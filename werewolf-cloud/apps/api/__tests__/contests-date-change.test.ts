import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { D1Database, KVNamespace } from '@cloudflare/workers-types';
import { createApp } from '../src/app';
import type { WerewolfEnvironment } from '../src/env';
import { resetCoefficientCaches } from '../src/services/coefficients';
import { createTestEnv, wipeDatabase, type TestEnvironment } from './helpers/d1';

type App = ReturnType<typeof createApp>;

describe('contest date change – age category, McCullough and results', () => {
  let testEnv: TestEnvironment;
  let db: D1Database;
  let kv: KVNamespace;
  let app: App;
  let env: WerewolfEnvironment;

  beforeAll(async () => {
    testEnv = await createTestEnv();
    db = testEnv.db;
    kv = testEnv.kv;
    app = testEnv.app;
    env = testEnv.env;
  });

  afterAll(async () => {
    await testEnv.dispose();
  });

  beforeEach(async () => {
    await wipeDatabase(db);
    const list = await kv.list();
    await Promise.all(list.keys.map((key) => kv.delete(key.name)));
    resetCoefficientCaches();
  });

  const json = (path: string, method: string, body?: unknown) =>
    app.request(`http://localhost${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }, env);

  async function createDatedContest(contestDate: string, birthDate: string) {
    const contestRes = await json('/contests', 'POST', {
      name: 'Date Change Meet',
      date: contestDate,
      location: 'Wrocław',
      discipline: 'Powerlifting',
    });
    expect(contestRes.status).toBe(201);
    const contestId = (await contestRes.json()).data.id as string;

    const competitorRes = await json('/competitors', 'POST', {
      firstName: 'Adam',
      lastName: 'Masters',
      birthDate,
      gender: 'Male',
    });
    expect(competitorRes.status).toBe(201);
    const competitorId = (await competitorRes.json()).data.id as string;

    const registrationRes = await json(`/contests/${contestId}/registrations`, 'POST', {
      contestId,
      competitorId,
      bodyweight: 95,
    });
    expect(registrationRes.status).toBe(201);
    const registrationId = (await registrationRes.json()).data.id as string;

    await db
      .prepare(
        `INSERT INTO attempts (id, registration_id, lift_type, attempt_number, weight, status, created_at, updated_at)
         VALUES (?, ?, 'Bench', 1, 150, 'Successful', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
      )
      .bind(randomUUID(), registrationId)
      .run();

    const recalcRes = await json(`/contests/${contestId}/results/recalculate`, 'POST', {});
    expect(recalcRes.status).toBe(200);

    return { contestId, registrationId };
  }

  const readRegistration = async (registrationId: string) =>
    db
      .prepare(
        `SELECT r.age_category_id, r.reshel_coefficient, r.mccullough_coefficient, cac.code AS age_category_code
         FROM registrations r
         LEFT JOIN contest_age_categories cac ON r.age_category_id = cac.id
         WHERE r.id = ?`
      )
      .bind(registrationId)
      .first<{
        age_category_id: string;
        reshel_coefficient: number;
        mccullough_coefficient: number;
        age_category_code: string;
      }>();

  it('reclassifies masters and refreshes McCullough when the date crosses a boundary', async () => {
    const { contestId, registrationId } = await createDatedContest('2024-05-01', '1984-06-15');

    const before = await readRegistration(registrationId);
    expect(before?.age_category_code).toBe('SENIOR');
    expect(Number(before?.mccullough_coefficient)).toBeCloseTo(1, 6);

    const resultBefore = await db
      .prepare('SELECT coefficient_points FROM results WHERE registration_id = ?')
      .bind(registrationId)
      .first<{ coefficient_points: number }>();
    const reshel = Number(before?.reshel_coefficient ?? 1);
    expect(Number(resultBefore?.coefficient_points)).toBeCloseTo(150 * reshel * 1, 6);

    await kv.put(`rankings:${contestId}:open`, '[]');
    await kv.put(`public-results:${contestId}`, '{}');

    // 2024-05-01 -> 39 years old (SENIOR, McCullough 1.0);
    // 2025-06-20 -> 41 years old (Master 40-49, McCullough 1.01).
    const patchRes = await json(`/contests/${contestId}`, 'PATCH', { date: '2025-06-20' });
    expect(patchRes.status).toBe(200);

    const after = await readRegistration(registrationId);
    expect(after?.age_category_code).toBe('M40');
    expect(Number(after?.mccullough_coefficient)).toBeCloseTo(1.01, 6);

    const resultAfter = await db
      .prepare('SELECT coefficient_points FROM results WHERE registration_id = ?')
      .bind(registrationId)
      .first<{ coefficient_points: number }>();
    expect(Number(resultAfter?.coefficient_points)).toBeCloseTo(150 * reshel * 1.01, 6);

    expect(await kv.get(`rankings:${contestId}:open`)).toBeNull();
    expect(await kv.get(`public-results:${contestId}`)).toBeNull();
  });

  it('leaves category and coefficients alone when the date stays inside the category', async () => {
    const { contestId, registrationId } = await createDatedContest('2024-05-01', '1984-06-15');

    const patchRes = await json(`/contests/${contestId}`, 'PATCH', { date: '2024-05-20' });
    expect(patchRes.status).toBe(200);

    const after = await readRegistration(registrationId);
    expect(after?.age_category_code).toBe('SENIOR');
    expect(Number(after?.mccullough_coefficient)).toBeCloseTo(1, 6);
  });

  it('recomputes every registration of the contest', async () => {
    const { contestId, registrationId } = await createDatedContest('2024-05-01', '1984-06-15');

    const competitorRes = await json('/competitors', 'POST', {
      firstName: 'Ewa',
      lastName: 'Senior',
      birthDate: '1986-01-10',
      gender: 'Female',
    });
    const competitorId = (await competitorRes.json()).data.id as string;

    const registrationRes = await json(`/contests/${contestId}/registrations`, 'POST', {
      contestId,
      competitorId,
      bodyweight: 70,
    });
    const secondRegistrationId = (await registrationRes.json()).data.id as string;

    const patchRes = await json(`/contests/${contestId}`, 'PATCH', { date: '2025-06-20' });
    expect(patchRes.status).toBe(200);

    // 1984-06-15 -> 41 on the new date; 1986-01-10 -> 39, so only the first
    // registration crosses into the masters category.
    expect((await readRegistration(registrationId))?.age_category_code).toBe('M40');
    expect((await readRegistration(secondRegistrationId))?.age_category_code).toBe('SENIOR');
  });
});

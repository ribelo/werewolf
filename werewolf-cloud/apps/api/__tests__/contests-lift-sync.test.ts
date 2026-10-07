import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { D1Database, KVNamespace } from '@cloudflare/workers-types';
import { createApp } from '../src/app';
import type { WerewolfEnvironment } from '../src/env';
import { resetCoefficientCaches } from '../src/services/coefficients';
import { createTestEnv, wipeDatabase, type TestEnvironment } from './helpers/d1';
import type { LiveRecorder } from './helpers/live';

type App = ReturnType<typeof createApp>;

describe('contest lift sync – rack heights, attempts and results', () => {
  let testEnv: TestEnvironment;
  let db: D1Database;
  let kv: KVNamespace;
  let app: App;
  let env: WerewolfEnvironment;
  let live: LiveRecorder;

  beforeAll(async () => {
    testEnv = await createTestEnv();
    db = testEnv.db;
    kv = testEnv.kv;
    app = testEnv.app;
    env = testEnv.env;
    live = testEnv.live;
  });

  afterAll(async () => {
    await testEnv.dispose();
  });

  beforeEach(async () => {
    await wipeDatabase(db);
    const list = await kv.list();
    await Promise.all(list.keys.map((key) => kv.delete(key.name)));
    live.reset();
    resetCoefficientCaches();
  });

  const json = (path: string, method: string, body?: unknown) =>
    app.request(`http://localhost${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }, env);

  it('narrowing to bench clears the squat rack height and rebuilds results', async () => {
    const contestRes = await json('/contests', 'POST', {
      name: 'Lift Sync Meet',
      date: '2025-08-09',
      location: 'Gdynia',
      discipline: 'Powerlifting',
    });
    expect(contestRes.status).toBe(201);
    const contestId = (await contestRes.json()).data.id as string;

    const competitorRes = await json('/competitors', 'POST', {
      firstName: 'Sylwia',
      lastName: 'Squat',
      birthDate: '1991-01-15',
      gender: 'Female',
    });
    const competitorId = (await competitorRes.json()).data.id as string;

    const registrationRes = await json(`/contests/${contestId}/registrations`, 'POST', {
      contestId,
      competitorId,
      bodyweight: 68,
      rackHeightSquat: 7,
      rackHeightBench: 5,
    });
    expect(registrationRes.status).toBe(201);
    const registrationId = (await registrationRes.json()).data.id as string;

    await db
      .prepare(
        `INSERT INTO attempts (id, registration_id, lift_type, attempt_number, weight, status, created_at, updated_at)
         VALUES (?, ?, 'Squat', 1, 120, 'Successful', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
      )
      .bind(randomUUID(), registrationId)
      .run();
    await db
      .prepare(
        `INSERT INTO attempts (id, registration_id, lift_type, attempt_number, weight, status, created_at, updated_at)
         VALUES (?, ?, 'Bench', 1, 70, 'Successful', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
      )
      .bind(randomUUID(), registrationId)
      .run();

    const recalcRes = await json(`/contests/${contestId}/results/recalculate`, 'POST', {});
    expect(recalcRes.status).toBe(200);

    const before = await db
      .prepare('SELECT total_weight FROM results WHERE registration_id = ?')
      .bind(registrationId)
      .first<{ total_weight: number }>();
    expect(Number(before?.total_weight)).toBe(190);

    await kv.put(`rankings:${contestId}:open`, '[]');
    await kv.put(`public-results:${contestId}`, '{}');

    const patchRes = await json(`/contests/${contestId}`, 'PATCH', { competitionType: 'Bench' });
    expect(patchRes.status).toBe(200);

    const registrationRow = await db
      .prepare('SELECT rack_height_squat, rack_height_bench FROM registrations WHERE id = ?')
      .bind(registrationId)
      .first<{ rack_height_squat: number | null; rack_height_bench: number | null }>();
    expect(registrationRow?.rack_height_squat).toBeNull();
    expect(registrationRow?.rack_height_bench).toBe(5);

    const liftRows = await db
      .prepare('SELECT lift_type FROM registration_lifts WHERE registration_id = ? ORDER BY lift_type')
      .bind(registrationId)
      .all<{ lift_type: string }>();
    expect(liftRows.results.map((row) => row.lift_type)).toEqual(['Bench']);

    const attemptRows = await db
      .prepare('SELECT lift_type FROM attempts WHERE registration_id = ? ORDER BY lift_type')
      .bind(registrationId)
      .all<{ lift_type: string }>();
    expect(attemptRows.results.map((row) => row.lift_type)).toEqual(['Bench']);

    const registration = await db
      .prepare('SELECT reshel_coefficient, mccullough_coefficient FROM registrations WHERE id = ?')
      .bind(registrationId)
      .first<{ reshel_coefficient: number; mccullough_coefficient: number }>();
    const reshel = Number(registration?.reshel_coefficient ?? 1);
    const mccullough = Number(registration?.mccullough_coefficient ?? 1);

    const result = await db
      .prepare('SELECT best_squat, best_bench, total_weight, coefficient_points FROM results WHERE registration_id = ?')
      .bind(registrationId)
      .first<{ best_squat: number; best_bench: number; total_weight: number; coefficient_points: number }>();
    expect(Number(result?.best_squat)).toBe(0);
    expect(Number(result?.best_bench)).toBe(70);
    expect(Number(result?.total_weight)).toBe(70);
    expect(Number(result?.coefficient_points)).toBeCloseTo(70 * reshel * mccullough, 6);

    expect(await kv.get(`rankings:${contestId}:open`)).toBeNull();
    expect(await kv.get(`public-results:${contestId}`)).toBeNull();

    const published = live.eventsFor(contestId).map((event) => event.type);
    expect(published).toContain('registration.upserted');
  });

  it('keeps rack heights and results when the lift set only grows', async () => {
    const contestRes = await json('/contests', 'POST', {
      name: 'Growing Meet',
      date: '2025-08-10',
      location: 'Sopot',
      discipline: 'Bench',
    });
    const contestId = (await contestRes.json()).data.id as string;

    const competitorRes = await json('/competitors', 'POST', {
      firstName: 'Adam',
      lastName: 'Bench',
      birthDate: '1992-03-03',
      gender: 'Male',
    });
    const competitorId = (await competitorRes.json()).data.id as string;

    const registrationRes = await json(`/contests/${contestId}/registrations`, 'POST', {
      contestId,
      competitorId,
      bodyweight: 90,
      rackHeightBench: 4,
    });
    const registrationId = (await registrationRes.json()).data.id as string;

    const patchRes = await json(`/contests/${contestId}`, 'PATCH', { discipline: 'Powerlifting' });
    expect(patchRes.status).toBe(200);

    const registrationRow = await db
      .prepare('SELECT rack_height_bench FROM registrations WHERE id = ?')
      .bind(registrationId)
      .first<{ rack_height_bench: number | null }>();
    expect(registrationRow?.rack_height_bench).toBe(4);
  });
});

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { KVNamespace } from '@cloudflare/workers-types';
import { createTestEnv, wipeDatabase, type TestEnvironment } from './helpers/d1';
import { resetCoefficientCaches } from '../src/services/coefficients';
import { publicResultsCacheKey } from '../src/utils/cache';

type Person = {
  lastName: string;
  bodyweight: number;
  /** Weight of the single successful squat; higher ranks first. */
  squat: number;
  labels?: string[];
};

describe('PATCH /registrations/:registrationId/labels', () => {
  let testEnv: TestEnvironment;
  let kv: KVNamespace;

  beforeAll(async () => {
    testEnv = await createTestEnv();
    kv = testEnv.kv;
  });

  afterAll(async () => {
    await testEnv.dispose();
  });

  beforeEach(async () => {
    await wipeDatabase(testEnv.db);
    const list = await kv.list();
    await Promise.all(list.keys.map((key) => kv.delete(key.name)));
    testEnv.live.reset();
    resetCoefficientCaches();
  });

  it('answers 200 when the same labels are sent again and still drops the caches', async () => {
    const { contestId, registrationIds } = await seedContest(testEnv, [
      { lastName: 'Repeat', bodyweight: 90, squat: 200, labels: ['Open', 'vip'] },
    ]);
    const registrationId = registrationIds[0] as string;

    const patchLabels = (labels: string[]) =>
      testEnv.app.request(
        `http://localhost/registrations/${registrationId}/labels`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ labels }),
        },
        testEnv.env
      );

    expect((await patchLabels(['Open', 'vip'])).status).toBe(200);

    await kv.put(`rankings:${contestId}:open`, '[]');
    await kv.put(publicResultsCacheKey(contestId), '{}');
    testEnv.live.reset();

    const repeated = await patchLabels(['Open', 'vip']);
    expect(repeated.status).toBe(200);
    expect((await repeated.json()).data.labels).toEqual(['Open', 'vip']);

    const stored = await testEnv.db
      .prepare('SELECT labels FROM registrations WHERE id = ?')
      .bind(registrationId)
      .first<{ labels: string }>();
    expect(JSON.parse(stored?.labels ?? '[]')).toEqual(['Open', 'vip']);

    expect(await kv.get(`rankings:${contestId}:open`)).toBeNull();
    expect(await kv.get(publicResultsCacheKey(contestId))).toBeNull();
    expect(testEnv.live.ofType('registration.upserted')).toHaveLength(1);
  });

  it('still answers 404 for an unknown registration', async () => {
    const response = await testEnv.app.request(
      `http://localhost/registrations/${randomUUID()}/labels`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ labels: ['Open'] }),
      },
      testEnv.env
    );

    expect(response.status).toBe(404);
  });

  it('re-ranks the contest when the mandatory tag leaves a registration', async () => {
    const { contestId, registrationIds } = await seedContest(testEnv, [
      { lastName: 'Strong', bodyweight: 90, squat: 200, labels: ['Open', 'vip'] },
      { lastName: 'Second', bodyweight: 95, squat: 100, labels: ['Open'] },
    ]);
    const [strongId, secondId] = registrationIds as [string, string];

    const patchLabels = (registrationId: string, labels: string[]) =>
      testEnv.app.request(
        `http://localhost/registrations/${registrationId}/labels`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ labels }),
        },
        testEnv.env
      );

    const before = await placeOpen(contestId, strongId, secondId);
    expect(before).toEqual([1, 2]);
    await kv.put(`rankings:${contestId}:tag:vip`, '[]');

    expect((await patchLabels(strongId, ['vip'])).status).toBe(200);

    const after = await placeOpen(contestId, strongId, secondId);
    expect(after).toEqual([null, 1]);
    expect(await kv.get(`rankings:${contestId}:tag:vip`)).toBeNull();
  });

  async function placeOpen(
    contestId: string,
    strongId: string,
    secondId: string,
  ): Promise<Array<number | null>> {
    const rows = await testEnv.db
      .prepare('SELECT registration_id, place_open FROM results WHERE contest_id = ?')
      .bind(contestId)
      .all<{ registration_id: string; place_open: number | null }>();
    const byRegistration = new Map(rows.results.map((row) => [row.registration_id, row.place_open]));
    return [byRegistration.get(strongId) ?? null, byRegistration.get(secondId) ?? null];
  }
});

async function seedContest(
  testEnv: TestEnvironment,
  people: Person[],
): Promise<{ contestId: string; registrationIds: string[] }> {
  const { app, env } = testEnv;
  const post = (path: string, body: unknown) =>
    app.request(
      `http://localhost${path}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
      env
    );

  const contestRes = await post('/contests', {
    name: 'Labels Cup',
    date: '2025-09-20',
    location: 'Gdansk',
    discipline: 'Powerlifting',
  });
  expect(contestRes.status).toBe(201);
  const contestId = (await contestRes.json()).data.id as string;

  expect((await post(`/contests/${contestId}/tags`, { label: 'vip' })).status).toBe(201);

  const registrationIds: string[] = [];

  for (const person of people) {
    const competitorRes = await post('/competitors', {
      firstName: 'Case',
      lastName: person.lastName,
      birthDate: '1991-01-01',
      gender: 'Male',
    });
    expect(competitorRes.status).toBe(201);
    const competitorId = (await competitorRes.json()).data.id as string;

    const registrationRes = await post(`/contests/${contestId}/registrations`, {
      contestId,
      competitorId,
      bodyweight: person.bodyweight,
    });
    expect(registrationRes.status).toBe(201);
    const registrationId = (await registrationRes.json()).data.id as string;
    registrationIds.push(registrationId);

    await testEnv.db
      .prepare(
        `INSERT INTO attempts (id, registration_id, lift_type, attempt_number, weight, status, created_at, updated_at)
         VALUES (?, ?, 'Squat', 1, ?, 'Successful', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
      )
      .bind(randomUUID(), registrationId, person.squat)
      .run();

    if (person.labels) {
      const labelsRes = await testEnv.app.request(
        `http://localhost/registrations/${registrationId}/labels`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ labels: person.labels }),
        },
        env
      );
      expect(labelsRes.status).toBe(200);
    }
  }

  expect((await post(`/contests/${contestId}/results/recalculate`, {})).status).toBe(200);

  return { contestId, registrationIds };
}

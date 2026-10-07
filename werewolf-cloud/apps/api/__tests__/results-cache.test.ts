import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { KVNamespace } from '@cloudflare/workers-types';
import { createTestEnv, wipeDatabase, type TestEnvironment } from './helpers/d1';
import { publicResultsCacheKey } from '../src/utils/cache';
import { resetCoefficientCaches } from '../src/services/coefficients';

const DEFAULT_SETTINGS = { language: 'pl' };

type Person = {
  lastName: string;
  birthDate: string;
  gender: 'Male' | 'Female';
  bodyweight: number;
  labels?: string[];
};

describe('results cache behaviour', () => {
  let testEnv: TestEnvironment;

  beforeAll(async () => {
    testEnv = await createTestEnv();
  });

  afterAll(async () => {
    await testEnv.dispose();
  });

  beforeEach(async () => {
    await wipeDatabase(testEnv.db);
    await clearKv(testEnv.kv);
    resetCoefficientCaches();
    await testEnv.db
      .prepare(
        `INSERT INTO settings (id, data, created_at, updated_at)
         VALUES (1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      )
      .bind(JSON.stringify(DEFAULT_SETTINGS))
      .run();
  });

  it('never serves live rankings from a stale KV entry', async () => {
    const { app, env, kv } = testEnv;
    const { contestId } = await seedContest(testEnv, [
      { lastName: 'Vip', birthDate: '1990-01-01', gender: 'Male', bodyweight: 90, labels: ['Open', 'vip'] },
      { lastName: 'Uniformed', birthDate: '1991-01-01', gender: 'Male', bodyweight: 91, labels: ['Open', 'uniformed'] },
    ]);

    const staleRow = { id: 'stale', registrationId: 'stale', lastName: 'Stale', labels: ['Open'] };
    const staleKey = `rankings:${contestId}:open`;
    await kv.put(staleKey, JSON.stringify([staleRow]));

    const res = await app.request(
      `http://localhost/contests/${contestId}/results/rankings?type=open&tag=uniformed`,
      {},
      env,
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.data.map((row: { lastName: string }) => row.lastName)).toEqual(['Uniformed']);
    expect(await kv.get(staleKey)).toBe(JSON.stringify([staleRow]));
  });

  it('keeps every tag filter separate', async () => {
    const { app, env } = testEnv;
    const { contestId } = await seedContest(testEnv, [
      { lastName: 'Vip', birthDate: '1990-01-01', gender: 'Male', bodyweight: 90, labels: ['Open', 'vip'] },
      { lastName: 'Uniformed', birthDate: '1991-01-01', gender: 'Male', bodyweight: 91, labels: ['Open', 'uniformed'] },
    ]);

    const fetchTag = async (tag: string) => {
      const res = await app.request(
        `http://localhost/contests/${contestId}/results/rankings?type=tag&tag=${tag}`,
        {},
        env,
      );
      expect(res.status).toBe(200);
      return (await res.json()).data as Array<{ lastName: string }>;
    };

    expect((await fetchTag('vip')).map((row) => row.lastName)).toEqual(['Vip']);
    expect((await fetchTag('uniformed')).map((row) => row.lastName)).toEqual(['Uniformed']);
    expect((await fetchTag('vip')).map((row) => row.lastName)).toEqual(['Vip']);
  });

  it('caches the public bundle for a minute and drops it on recalculate', async () => {
    const { app, env, db, kv } = testEnv;
    const { contestId } = await seedContest(testEnv, [
      { lastName: 'Cached', birthDate: '1990-01-01', gender: 'Male', bodyweight: 90 },
    ]);

    const fetchBundle = async () => {
      const res = await app.request(`http://localhost/contests/${contestId}/results/public-bundle`, {}, env);
      expect(res.status).toBe(200);
      return (await res.json()).data as { contest: { name: string } };
    };

    const first = await fetchBundle();
    expect(first.contest.name).toBe('Cache Cup');
    expect(await kv.get(publicResultsCacheKey(contestId))).not.toBeNull();

    await db.prepare('UPDATE contests SET name = ? WHERE id = ?').bind('Renamed Cup', contestId).run();

    const cached = await fetchBundle();
    expect(cached.contest.name).toBe('Cache Cup');

    const staleRankingsKey = `rankings:${contestId}:open`;
    await kv.put(staleRankingsKey, '[]');

    const recalc = await app.request(
      `http://localhost/contests/${contestId}/results/recalculate`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) },
      env,
    );
    expect(recalc.status).toBe(200);

    expect(await kv.get(publicResultsCacheKey(contestId))).toBeNull();
    expect(await kv.get(staleRankingsKey)).toBeNull();

    const fresh = await fetchBundle();
    expect(fresh.contest.name).toBe('Renamed Cup');
  });

  it('returns 404 instead of calculating and persisting on read', async () => {
    const { app, env, db } = testEnv;
    const { registrationIds } = await seedContest(testEnv, [
      { lastName: 'NoAttempts', birthDate: '1990-01-01', gender: 'Male', bodyweight: 90 },
    ]);

    await db.prepare('DELETE FROM results WHERE registration_id = ?').bind(registrationIds[0]).run();

    const res = await app.request(`http://localhost/results/${registrationIds[0]}`, {}, env);
    expect(res.status).toBe(404);

    const stored = await db
      .prepare('SELECT COUNT(*) AS total FROM results WHERE registration_id = ?')
      .bind(registrationIds[0])
      .first();
    expect(Number(stored?.total ?? 0)).toBe(0);
  });
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
      env,
    );

  const contestRes = await post('/contests', {
    name: 'Cache Cup',
    date: '2025-06-14',
    location: 'Warsaw',
    discipline: 'Powerlifting',
  });
  expect(contestRes.status).toBe(201);
  const contestId = (await contestRes.json()).data.id as string;

  for (const label of ['vip', 'uniformed']) {
    expect((await post(`/contests/${contestId}/tags`, { label })).status).toBe(201);
  }

  const registrationIds: string[] = [];

  for (const person of people) {
    const competitorRes = await post('/competitors', {
      firstName: 'Case',
      lastName: person.lastName,
      birthDate: person.birthDate,
      gender: person.gender,
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

    if (person.labels) {
      const labelsRes = await app.request(
        `http://localhost/registrations/${registrationId}/labels`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ labels: person.labels }),
        },
        env,
      );
      expect(labelsRes.status).toBe(200);
    }
  }

  for (const registrationId of registrationIds) {
    await testEnv.db
      .prepare(
        `INSERT INTO attempts (id, registration_id, lift_type, attempt_number, weight, status, created_at, updated_at)
         VALUES (?, ?, 'Squat', 1, 100, 'Successful', '2025-06-14T08:00:00.000Z', '2025-06-14T08:00:00.000Z')`,
      )
      .bind(crypto.randomUUID(), registrationId)
      .run();
  }

  expect((await post(`/contests/${contestId}/results/recalculate`, {})).status).toBe(200);

  return { contestId, registrationIds };
}

async function clearKv(kv: KVNamespace) {
  const list = await kv.list();
  await Promise.all(list.keys.map((key) => kv.delete(key.name)));
}

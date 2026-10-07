import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { D1Database, KVNamespace } from '@cloudflare/workers-types';
import { createTestEnv, wipeDatabase, type TestEnvironment } from './helpers/d1';
import { resetCoefficientCaches } from '../src/services/coefficients';
import { removeAttemptsForInactiveLifts } from '../src/utils/lifts';
import { publicResultsCacheKey } from '../src/utils/cache';
import type { WerewolfEnvironment } from '../src/env';

/**
 * D1 wrapper that records every prepared statement, so a test can count how
 * often a statement shape ran during one request.
 */
function recordStatements(db: D1Database): { db: D1Database; statements: string[] } {
  const statements: string[] = [];
  const wrapped = new Proxy(db, {
    get(target, property) {
      if (property === 'prepare') {
        return (sql: string) => {
          statements.push(sql);
          return target.prepare(sql);
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  }) as D1Database;

  return { db: wrapped, statements };
}

describe('removeAttemptsForInactiveLifts', () => {
  let testEnv: TestEnvironment;
  let db: D1Database;
  let kv: KVNamespace;
  let env: WerewolfEnvironment;

  beforeAll(async () => {
    testEnv = await createTestEnv();
    db = testEnv.db;
    kv = testEnv.kv;
    env = testEnv.env;
  });

  afterAll(async () => {
    await testEnv.dispose();
  });

  beforeEach(async () => {
    await wipeDatabase(db);
    const list = await kv.list();
    await Promise.all(list.keys.map((key) => kv.delete(key.name)));
    testEnv.live.reset();
    resetCoefficientCaches();
  });

  async function seedFailedLift(): Promise<{ contestId: string; registrationId: string }> {
    const post = (path: string, body: unknown) =>
      testEnv.app.request(
        `http://localhost${path}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
        env
      );

    const contestRes = await post('/contests', {
      name: 'Deletion Cup',
      date: '2025-08-09',
      location: 'Gdynia',
      discipline: 'Powerlifting',
    });
    expect(contestRes.status).toBe(201);
    const contestId = (await contestRes.json()).data.id as string;

    const competitorRes = await post('/competitors', {
      firstName: 'Maria',
      lastName: 'Squat',
      birthDate: '1991-01-15',
      gender: 'Female',
    });
    expect(competitorRes.status).toBe(201);
    const competitorId = (await competitorRes.json()).data.id as string;

    const registrationRes = await post(`/contests/${contestId}/registrations`, {
      contestId,
      competitorId,
      bodyweight: 68,
    });
    expect(registrationRes.status).toBe(201);
    const registrationId = (await registrationRes.json()).data.id as string;

    for (const [lift, weight] of [['Squat', 120], ['Bench', 70]] as const) {
      await db
        .prepare(
          `INSERT INTO attempts (id, registration_id, lift_type, attempt_number, weight, status, created_at, updated_at)
           VALUES (?, ?, ?, 1, ?, 'Successful', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
        )
        .bind(randomUUID(), registrationId, lift, weight)
        .run();
    }

    const recalcRes = await post(`/contests/${contestId}/results/recalculate`, {});
    expect(recalcRes.status).toBe(200);

    return { contestId, registrationId };
  }

  it('rebuilds the result, refreshes rankings and drops the caches it invalidates', async () => {
    const { contestId, registrationId } = await seedFailedLift();
    testEnv.live.reset();
    await kv.put(`rankings:${contestId}:open`, '[]');
    await kv.put(publicResultsCacheKey(contestId), '{}');

    const removed = await removeAttemptsForInactiveLifts(env, contestId, db, registrationId, ['Bench']);
    expect(removed).toBe(true);

    const attempts = await db
      .prepare('SELECT lift_type FROM attempts WHERE registration_id = ? ORDER BY lift_type')
      .bind(registrationId)
      .all<{ lift_type: string }>();
    expect(attempts.results.map((row) => row.lift_type)).toEqual(['Bench']);

    const result = await db
      .prepare('SELECT total_weight, place_open FROM results WHERE registration_id = ?')
      .bind(registrationId)
      .first<{ total_weight: number; place_open: number | null }>();
    expect(Number(result?.total_weight)).toBe(70);
    expect(Number(result?.place_open)).toBe(1);

    expect(await kv.get(`rankings:${contestId}:open`)).toBeNull();
    expect(await kv.get(publicResultsCacheKey(contestId))).toBeNull();

    const deleted = testEnv.live.ofType('attempt.deleted');
    expect(deleted).toHaveLength(1);
    expect(deleted[0]?.roomId).toBe(contestId);
    expect(deleted[0]?.payload.liftType).toBe('Squat');

    // Nothing left to delete: no second recalculation and no second event.
    expect(await removeAttemptsForInactiveLifts(env, contestId, db, registrationId, ['Bench'])).toBe(false);
    expect(testEnv.live.ofType('attempt.deleted')).toHaveLength(1);
  });

  it('recalculates once when a contest lift change cascades through the sync route', async () => {
    const { contestId } = await seedFailedLift();
    const recorder = recordStatements(db);
    const patchRes = await testEnv.app.request(
      `http://localhost/contests/${contestId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ competitionType: 'Bench' }),
      },
      { ...env, DB: recorder.db } as WerewolfEnvironment
    );
    expect(patchRes.status).toBe(200);

    const resultUpserts = recorder.statements.filter((sql) => sql.includes('INSERT INTO results'));
    expect(resultUpserts).toHaveLength(1);
  });
});

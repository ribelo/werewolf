import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { D1Database, KVNamespace } from '@cloudflare/workers-types';
import type { WerewolfEnvironment } from '../src/env';
import { publicResultsCacheKey, resultsCacheKey } from '../src/utils/cache';
import { createTestEnv, wipeDatabase, type TestEnvironment } from './helpers/d1';
import type { LiveRecorder } from './helpers/live';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

describe('attempt mutations', () => {
  let testEnv: TestEnvironment;
  let db: D1Database;
  let kv: KVNamespace;
  let env: WerewolfEnvironment;
  let live: LiveRecorder;

  beforeAll(async () => {
    testEnv = await createTestEnv();
    db = testEnv.db;
    kv = testEnv.kv;
    env = testEnv.env;
    live = testEnv.live;
  });

  afterAll(async () => {
    await testEnv.dispose();
  });

  beforeEach(async () => {
    await wipeDatabase(db);
    await clearKv(kv);
    live.reset();
  });

  const request = (path: string, init: RequestInit = {}) =>
    testEnv.app.request(`http://localhost${path}`, init, env);

  async function createContest(name = 'Attempt Meet'): Promise<string> {
    const res = await request('/contests', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ name, date: '2026-05-01', location: 'Poznań', discipline: 'Powerlifting' }),
    });
    expect(res.status).toBe(201);
    return ((await res.json()).data as { id: string }).id;
  }

  async function createRegistration(
    contestId: string,
    options: { firstName?: string; lastName?: string; gender?: string; bodyweight?: number } = {},
  ): Promise<string> {
    const competitorRes = await request('/competitors', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        firstName: options.firstName ?? 'Anna',
        lastName: options.lastName ?? 'Kowalska',
        birthDate: '1994-02-18',
        gender: options.gender ?? 'Male',
      }),
    });
    expect(competitorRes.status).toBe(201);
    const competitorId = ((await competitorRes.json()).data as { id: string }).id;

    const registrationRes = await request(`/contests/${contestId}/registrations`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ contestId, competitorId, bodyweight: options.bodyweight ?? 93 }),
    });
    expect(registrationRes.status).toBe(201);
    return ((await registrationRes.json()).data as { id: string }).id;
  }

  async function postAttempt(
    contestId: string,
    registrationId: string,
    weight: number,
    liftType = 'Squat',
    attemptNumber = 1,
  ): Promise<Response> {
    return request(`/contests/${contestId}/registrations/${registrationId}/attempts`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ registrationId, liftType, attemptNumber, weight }),
    });
  }

  async function patchResult(attemptId: string, body: Record<string, unknown>): Promise<Response> {
    return request(`/attempts/${attemptId}/result`, {
      method: 'PATCH',
      headers: JSON_HEADERS,
      body: JSON.stringify(body),
    });
  }

  async function seedAttempt(
    registrationId: string,
    liftType: string,
    attemptNumber: number,
    weight: number,
    status = 'Pending',
  ): Promise<string> {
    const attemptId = randomUUID();
    await db
      .prepare(
        `INSERT INTO attempts (id, registration_id, lift_type, attempt_number, weight, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      )
      .bind(attemptId, registrationId, liftType, attemptNumber, weight, status)
      .run();
    return attemptId;
  }

  async function setContestState(contestId: string, currentLift: string | null, currentRound = 1): Promise<void> {
    const res = await request(`/contests/${contestId}/state`, {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ currentLift, currentRound }),
    });
    expect(res.status).toBe(200);
  }

  async function seedResultsCache(contestId: string): Promise<void> {
    await kv.put(resultsCacheKey({ contestId, view: 'open' }), JSON.stringify({ stale: true }));
    await kv.put(publicResultsCacheKey(contestId), JSON.stringify({ stale: true }));
  }

  async function expectResultsCacheCleared(contestId: string): Promise<void> {
    expect(await kv.get(resultsCacheKey({ contestId, view: 'open' }))).toBeNull();
    expect(await kv.get(publicResultsCacheKey(contestId))).toBeNull();
  }

  async function clearStoredResults(registrationId: string): Promise<void> {
    await db.prepare('DELETE FROM results WHERE registration_id = ?').bind(registrationId).run();
  }

  async function storedResult(registrationId: string) {
    return db
      .prepare(
        'SELECT best_squat, best_bench, best_deadlift, total_weight, coefficient_points, place_open FROM results WHERE registration_id = ?',
      )
      .bind(registrationId)
      .first<Record<string, unknown>>();
  }

  /**
   * The observable half of the shared post-mutation sequence: the result row was
   * recalculated, rankings were recomputed and the cached rankings were dropped.
   */
  async function expectMutationSideEffects(contestId: string, registrationId: string): Promise<void> {
    const result = await storedResult(registrationId);
    expect(result, 'result row recalculated').not.toBeNull();
    expect(Number(result?.['place_open']), 'ranking recomputed').toBe(1);
    await expectResultsCacheCleared(contestId);
  }

  it('returns 404 for a result update on an attempt that does not exist', async () => {
    const res = await patchResult(randomUUID(), { status: 'Successful' });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.data).toBeNull();
    expect(body.error).toBe('ATTEMPT_NOT_FOUND');
    expect(live.events).toHaveLength(0);
  });

  it('recalculates the result, clears the cached rankings and publishes attempt.resultUpdated', async () => {
    const contestId = await createContest('Result Patch');
    const registrationId = await createRegistration(contestId);
    const attemptId = await seedAttempt(registrationId, 'Squat', 1, 180);
    await seedResultsCache(contestId);
    live.reset();

    const res = await patchResult(attemptId, {
      status: 'Successful',
      judge1Decision: true,
      judge2Decision: true,
      judge3Decision: false,
      notes: 'Two white lights',
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ data: { success: true }, error: null });

    const result = await storedResult(registrationId);
    expect(Number(result?.['best_squat'])).toBe(180);
    expect(Number(result?.['total_weight'])).toBe(180);
    expect(Number(result?.['coefficient_points'])).toBeGreaterThan(0);
    await expectResultsCacheCleared(contestId);

    const stored = await db
      .prepare('SELECT status, judge1_decision, judge3_decision, notes, timestamp FROM attempts WHERE id = ?')
      .bind(attemptId)
      .first<Record<string, unknown>>();
    expect(stored?.['status']).toBe('Successful');
    expect(Boolean(stored?.['judge1_decision'])).toBe(true);
    expect(Boolean(stored?.['judge3_decision'])).toBe(false);
    expect(stored?.['notes']).toBe('Two white lights');
    expect(typeof stored?.['timestamp']).toBe('string');

    expect(live.events.map((event) => event.type)).toEqual(['attempt.resultUpdated']);
    expect(live.ofType('attempt.resultUpdated')[0]?.payload).toMatchObject({
      id: attemptId,
      liftType: 'Squat',
      attemptNumber: 1,
      status: 'Successful',
      notes: 'Two white lights',
    });
  });

  it('runs the same recalculation, ranking, cache and publish sequence for every mutation', async () => {
    const contestId = await createContest('Sequence Meet');
    const registrationId = await createRegistration(contestId);
    await setContestState(contestId, 'Squat', 1);

    // Create
    await clearStoredResults(registrationId);
    await seedResultsCache(contestId);
    live.reset();
    expect((await postAttempt(contestId, registrationId, 180)).status).toBe(200);
    await expectMutationSideEffects(contestId, registrationId);
    expect(live.events.map((event) => event.type)).toEqual(['attempt.upserted']);

    const created = await db
      .prepare('SELECT id FROM attempts WHERE registration_id = ?')
      .bind(registrationId)
      .first<{ id: string }>();
    const attemptId = created?.id ?? '';
    expect(attemptId).not.toBe('');

    // Update weight
    await clearStoredResults(registrationId);
    await seedResultsCache(contestId);
    live.reset();
    expect((await postAttempt(contestId, registrationId, 182.5)).status).toBe(200);
    await expectMutationSideEffects(contestId, registrationId);
    expect(live.events.map((event) => event.type)).toEqual(['attempt.upserted']);
    const storedAttempts = await db
      .prepare('SELECT id, weight FROM attempts WHERE registration_id = ?')
      .bind(registrationId)
      .all<{ id: string; weight: number }>();
    expect(storedAttempts.results).toHaveLength(1);
    expect(Number(storedAttempts.results[0]?.weight)).toBe(182.5);

    // Update result
    await clearStoredResults(registrationId);
    await seedResultsCache(contestId);
    live.reset();
    expect(
      (await patchResult(attemptId, { status: 'Successful', judge1Decision: true, judge2Decision: true, judge3Decision: true })).status,
    ).toBe(200);
    await expectMutationSideEffects(contestId, registrationId);
    expect(live.events.map((event) => event.type)).toEqual(['attempt.resultUpdated']);
    expect(Number((await storedResult(registrationId))?.['best_squat'])).toBe(182.5);

    // Set current
    await clearStoredResults(registrationId);
    await seedResultsCache(contestId);
    live.reset();
    const setRes = await request(`/contests/${contestId}/attempts/current`, {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ attemptId }),
    });
    expect(setRes.status).toBe(200);
    await expectMutationSideEffects(contestId, registrationId);
    expect(live.events.map((event) => event.type)).toEqual(['attempt.currentSet']);

    // Clear current
    await clearStoredResults(registrationId);
    await seedResultsCache(contestId);
    live.reset();
    const clearRes = await request(`/contests/${contestId}/attempts/current`, { method: 'DELETE' });
    expect(clearRes.status).toBe(200);
    await expectMutationSideEffects(contestId, registrationId);
    expect(live.events.map((event) => event.type)).toEqual(['attempt.currentCleared']);
  });

  it('serves and publishes the same current-attempt snapshot', async () => {
    const contestId = await createContest('Current Snapshot');
    const registrationId = await createRegistration(contestId, { firstName: 'Marta', lastName: 'Nowak', bodyweight: 63 });
    live.reset();
    expect((await postAttempt(contestId, registrationId, 180)).status).toBe(200);
    const attemptId = (
      await db.prepare('SELECT id FROM attempts WHERE registration_id = ?').bind(registrationId).first<{ id: string }>()
    )?.id;

    const setRes = await request(`/contests/${contestId}/attempts/current`, {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ attemptId }),
    });
    expect(setRes.status).toBe(200);

    const currentRes = await request(`/contests/${contestId}/attempts/current`);
    expect(currentRes.status).toBe(200);
    const bundle = (await currentRes.json()).data as Record<string, unknown>;

    expect(bundle).toMatchObject({
      contest: { id: contestId },
      attempt: { id: attemptId, liftType: 'Squat', attemptNumber: 1, weight: 180, status: 'Pending' },
      registration: { id: registrationId, contestId, labels: ['Open'] },
      competitor: { firstName: 'Marta', lastName: 'Nowak' },
      highlight: { liftType: 'Squat', attemptNumber: 1 },
    });
    expect(Object.keys(bundle['attemptsByLift'] as Record<string, unknown>)).toEqual(['Squat', 'Bench', 'Deadlift']);
    expect((bundle['attemptsByLift'] as Record<string, unknown[]> )['Squat']?.[0]).toMatchObject({
      id: attemptId,
      liftType: 'Squat',
      attemptNumber: 1,
      weight: 180,
      status: 'Pending',
    });
    expect(bundle['platePlan']).toMatchObject({ targetWeight: 180, barWeight: 20, clampWeight: 5 });

    const published = live.ofType('attempt.currentSet');
    expect(published).toHaveLength(1);
    expect(published[0]?.payload).toEqual(bundle);

    // Editing the attempt on the platform refreshes the published bundle too.
    expect((await postAttempt(contestId, registrationId, 185)).status).toBe(200);
    expect(live.events.map((event) => event.type)).toEqual([
      'attempt.upserted',
      'attempt.currentSet',
      'attempt.upserted',
      'attempt.currentSet',
    ]);
    const refreshed = live.ofType('attempt.currentSet')[1]?.payload as Record<string, unknown>;
    expect(refreshed['attempt']).toMatchObject({ id: attemptId, weight: 185 });
  });

  it('keeps the queue ordered by weight, flight order and name', async () => {
    const contestId = await createContest('Queue Order');
    const heavier = await createRegistration(contestId, { firstName: 'Anna', lastName: 'Aaa', bodyweight: 93 });
    const tie = await createRegistration(contestId, { firstName: 'Basia', lastName: 'Bbb', bodyweight: 93 });
    const lighter = await createRegistration(contestId, { firstName: 'Celia', lastName: 'Ccc', bodyweight: 93 });
    const judged = await createRegistration(contestId, { firstName: 'Dorota', lastName: 'Ddd', bodyweight: 93 });

    await setContestState(contestId, 'Squat', 1);
    expect((await postAttempt(contestId, heavier, 120)).status).toBe(200);
    expect((await postAttempt(contestId, tie, 120)).status).toBe(200);
    expect((await postAttempt(contestId, lighter, 110)).status).toBe(200);
    await seedAttempt(judged, 'Squat', 1, 100, 'Successful');
    await seedAttempt(heavier, 'Squat', 2, 100);

    await db.prepare('UPDATE registrations SET flight_code = ?, flight_order = ?, labels = ? WHERE id = ?')
      .bind('A', 1, '["Open"]', heavier).run();
    await db.prepare('UPDATE registrations SET flight_code = ?, flight_order = ?, labels = ? WHERE id = ?')
      .bind('A', 2, '["Open"]', tie).run();
    await db.prepare('UPDATE registrations SET flight_code = ?, flight_order = ?, labels = ? WHERE id = ?')
      .bind('B', 3, '["Open"]', lighter).run();
    await db.prepare('UPDATE registrations SET flight_code = ?, flight_order = ?, labels = ? WHERE id = ?')
      .bind('A', 4, '["Open"]', judged).run();

    const queueRes = await request(`/contests/${contestId}/attempts/queue`);
    expect(queueRes.status).toBe(200);
    const queue = (await queueRes.json()).data as Record<string, unknown>[];

    // 110 kg comes first even though it sits on the worst flight order, the judged
    // attempt and round two stay out, and equal weights fall back to flight order.
    expect(queue.map((entry) => entry['registrationId'])).toEqual([lighter, heavier, tie]);
    expect(queue[0]).toMatchObject({
      liftType: 'Squat',
      attemptNumber: 1,
      weight: 110,
      flightCode: 'B',
      flightOrder: 3,
      competitorName: 'Celia Ccc',
      labels: ['Open'],
      status: 'Pending',
    });
    expect(Object.keys(queue[0] ?? {})).not.toContain('registration_id');

    const gatedRes = await request(`/contests/${contestId}/active-flight`, {
      method: 'PATCH',
      headers: JSON_HEADERS,
      body: JSON.stringify({ activeFlight: 'A' }),
    });
    expect(gatedRes.status).toBe(200);
    const gated = (await (await request(`/contests/${contestId}/attempts/queue`)).json()).data as Record<string, unknown>[];
    expect(gated.map((entry) => entry['registrationId'])).toEqual([heavier, tie]);

    await setContestState(contestId, null);
    const idle = (await (await request(`/contests/${contestId}/attempts/queue`)).json()).data as Record<string, unknown>[];
    expect(idle).toEqual([]);
  });
});

async function clearKv(kv: KVNamespace): Promise<void> {
  const list = await kv.list();
  await Promise.all(list.keys.map((key) => kv.delete(key.name)));
}

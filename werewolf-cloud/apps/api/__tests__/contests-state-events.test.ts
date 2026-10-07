import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { D1Database, KVNamespace } from '@cloudflare/workers-types';
import { createApp } from '../src/app';
import type { WerewolfEnvironment } from '../src/env';
import { resetCoefficientCaches } from '../src/services/coefficients';
import { createTestEnv, wipeDatabase, type TestEnvironment } from './helpers/d1';
import type { LiveRecorder } from './helpers/live';

type App = ReturnType<typeof createApp>;

describe('contest state and active flight – live events and caches', () => {
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

  async function createContest() {
    const contestRes = await json('/contests', 'POST', {
      name: 'Realtime State Meet',
      date: '2025-09-20',
      location: 'Kraków',
      discipline: 'Powerlifting',
    });
    expect(contestRes.status).toBe(201);
    return (await contestRes.json()).data.id as string;
  }

  it('publishes contest.stateChanged and drops the results cache', async () => {
    const contestId = await createContest();
    await kv.put(`rankings:${contestId}:open`, '[]');
    await kv.put(`public-results:${contestId}`, '{}');

    const putRes = await json(`/contests/${contestId}/state`, 'PUT', {
      status: 'InProgress',
      currentLift: 'Bench',
      currentRound: 2,
    });
    expect(putRes.status).toBe(200);

    const events = live.ofType('contest.stateChanged');
    expect(events).toHaveLength(1);
    expect(events[0]?.roomId).toBe(contestId);
    expect(events[0]?.payload).toMatchObject({
      status: 'InProgress',
      currentLift: 'Bench',
      currentRound: 2,
    });

    expect(await kv.get(`rankings:${contestId}:open`)).toBeNull();
    expect(await kv.get(`public-results:${contestId}`)).toBeNull();
  });

  it('publishes the updated state on a later state change', async () => {
    const contestId = await createContest();

    await json(`/contests/${contestId}/state`, 'PUT', {
      status: 'InProgress',
      currentLift: 'Squat',
      currentRound: 1,
    });
    live.reset();

    const putRes = await json(`/contests/${contestId}/state`, 'PUT', {
      status: 'Completed',
      currentLift: null,
    });
    expect(putRes.status).toBe(200);

    const events = live.ofType('contest.stateChanged');
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toMatchObject({
      status: 'Completed',
      currentLift: null,
      currentRound: 1,
    });
  });

  it('publishes queue.updated and drops the results cache when the active flight changes', async () => {
    const contestId = await createContest();
    await kv.put(`rankings:${contestId}:open`, '[]');
    await kv.put(`public-results:${contestId}`, '{}');

    const patchRes = await json(`/contests/${contestId}/active-flight`, 'PATCH', { activeFlight: 'B' });
    expect(patchRes.status).toBe(200);
    expect((await patchRes.json()).data.activeFlight).toBe('B');

    const events = live.ofType('queue.updated');
    expect(events).toHaveLength(1);
    expect(events[0]?.roomId).toBe(contestId);
    expect(events[0]?.payload).toMatchObject({ flight: 'B' });

    expect(await kv.get(`rankings:${contestId}:open`)).toBeNull();
    expect(await kv.get(`public-results:${contestId}`)).toBeNull();
  });

  it('reports a cleared active flight', async () => {
    const contestId = await createContest();

    await json(`/contests/${contestId}/active-flight`, 'PATCH', { activeFlight: 'A' });
    live.reset();

    const patchRes = await json(`/contests/${contestId}/active-flight`, 'PATCH', { activeFlight: null });
    expect(patchRes.status).toBe(200);

    const events = live.ofType('queue.updated');
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toMatchObject({ flight: null });
  });

  it('does not publish when the contest does not exist', async () => {
    const patchRes = await json('/contests/00000000-0000-0000-0000-000000000000/active-flight', 'PATCH', {
      activeFlight: 'A',
    });
    expect(patchRes.status).toBe(404);
    expect(live.ofType('queue.updated')).toHaveLength(0);
  });
});

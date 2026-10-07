import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { D1Database } from '@cloudflare/workers-types';
import type { WerewolfEnvironment } from '../src/env';
import { createTestEnv, wipeDatabase, type TestEnvironment } from './helpers/d1';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/**
 * Attempt weight validation has to accept exactly what the published plate plan
 * loads: the bar plus both clamps, with no unloadable remainder.
 * Contest defaults are a 20 kg men's bar, a 15 kg women's bar and 2.5 kg clamps.
 */
describe('attempt weight validation', () => {
  let testEnv: TestEnvironment;
  let db: D1Database;
  let env: WerewolfEnvironment;

  beforeAll(async () => {
    testEnv = await createTestEnv();
    db = testEnv.db;
    env = testEnv.env;
  });

  afterAll(async () => {
    await testEnv.dispose();
  });

  beforeEach(async () => {
    await wipeDatabase(db);
  });

  const request = (path: string, init: RequestInit = {}) =>
    testEnv.app.request(`http://localhost${path}`, init, env);

  async function createContest(name = 'Weight Meet'): Promise<string> {
    const res = await request('/contests', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ name, date: '2026-05-01', location: 'Poznań', discipline: 'Powerlifting' }),
    });
    expect(res.status).toBe(201);
    return ((await res.json()).data as { id: string }).id;
  }

  async function createRegistration(contestId: string, gender: 'Male' | 'Female'): Promise<string> {
    const competitorRes = await request('/competitors', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ firstName: 'Anna', lastName: 'Kowalska', birthDate: '1994-02-18', gender }),
    });
    expect(competitorRes.status).toBe(201);
    const competitorId = ((await competitorRes.json()).data as { id: string }).id;

    const registrationRes = await request(`/contests/${contestId}/registrations`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ contestId, competitorId, bodyweight: 63 }),
    });
    expect(registrationRes.status).toBe(201);
    return ((await registrationRes.json()).data as { id: string }).id;
  }

  async function postAttempt(contestId: string, registrationId: string, weight: number): Promise<Response> {
    return request(`/contests/${contestId}/registrations/${registrationId}/attempts`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ registrationId, liftType: 'Squat', attemptNumber: 1, weight }),
    });
  }

  it('rejects the bare bar now that clamps are part of the plan', async () => {
    const contestId = await createContest();
    const registrationId = await createRegistration(contestId, 'Male');

    const res = await postAttempt(contestId, registrationId, 20);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('BELOW_BAR_WEIGHT');
    expect(body.details).toMatchObject({ weight: 20, barWeight: 20, clampWeight: 5, minimumWeight: 25 });
  });

  it('accepts the lightest loadable weight and displays the matching plan', async () => {
    const contestId = await createContest();
    const registrationId = await createRegistration(contestId, 'Male');

    const res = await postAttempt(contestId, registrationId, 25);
    expect(res.status).toBe(200);

    const attemptId = (
      await db.prepare('SELECT id FROM attempts WHERE registration_id = ?').bind(registrationId).first<{ id: string }>()
    )?.id;
    expect((await request(`/contests/${contestId}/attempts/current`, {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ attemptId }),
    })).status).toBe(200);

    const bundle = (await (await request(`/contests/${contestId}/attempts/current`)).json()).data as {
      platePlan: Record<string, unknown>;
    };
    // Validation and the displayed plan agree on the bar, the clamps and the total.
    expect(bundle.platePlan).toMatchObject({ barWeight: 20, clampWeight: 5, total: 25, exact: true, plates: [] });
  });

  it('uses the women\'s bar and clamps as the minimum', async () => {
    const contestId = await createContest();
    const registrationId = await createRegistration(contestId, 'Female');

    const below = await postAttempt(contestId, registrationId, 19.5);
    expect(below.status).toBe(400);
    expect((await below.json()).error).toBe('BELOW_BAR_WEIGHT');

    expect((await postAttempt(contestId, registrationId, 20)).status).toBe(200);
  });

  it('rejects a weight the plates cannot load', async () => {
    const contestId = await createContest();
    const registrationId = await createRegistration(contestId, 'Male');

    const res = await postAttempt(contestId, registrationId, 25.25);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('UNLOADABLE_WEIGHT');
    expect(body.details).toMatchObject({ weight: 25.25, barWeight: 20, clampWeight: 5, achievableWeight: 25 });
  });

  it('rejects a non-positive weight before touching the plate plan', async () => {
    const contestId = await createContest();
    const registrationId = await createRegistration(contestId, 'Male');

    const res = await postAttempt(contestId, registrationId, 0);

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('INVALID_WEIGHT');
  });

  it('still stores a loadable weight', async () => {
    const contestId = await createContest();
    const registrationId = await createRegistration(contestId, 'Male');

    expect((await postAttempt(contestId, registrationId, 182.5)).status).toBe(200);

    const stored = await db
      .prepare('SELECT weight, status FROM attempts WHERE registration_id = ?')
      .bind(registrationId)
      .first<{ weight: number; status: string }>();
    expect(Number(stored?.weight)).toBe(182.5);
    expect(stored?.status).toBe('Pending');
  });

  it('reports an unknown registration as 404', async () => {
    const contestId = await createContest();

    const res = await postAttempt(contestId, randomUUID(), 100);

    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('REGISTRATION_NOT_FOUND');
  });
});

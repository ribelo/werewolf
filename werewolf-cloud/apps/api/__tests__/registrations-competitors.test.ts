import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createTestEnv, type TestEnvironment } from './helpers/d1';

type App = TestEnvironment['app'];
type Env = TestEnvironment['env'];

type RegistrationData = {
  id: string;
  contestId: string;
  competitorId: string;
  ageCategoryId: string;
  ageCategoryName: string | null;
  weightClassId: string | null;
  weightClassName: string | null;
  bodyweight: number | null;
  reshelCoefficient: number | null;
  mcculloughCoefficient: number | null;
  firstName: string;
  lastName: string;
  gender: string;
  club: string | null;
};

let testEnv: TestEnvironment;

beforeEach(async () => {
  testEnv = await createTestEnv();
});

afterEach(async () => {
  await testEnv.dispose();
});

const asJson = (body: unknown, method = 'POST') => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

async function createContest(app: App, env: Env, date = '2025-07-01'): Promise<string> {
  const res = await app.request(
    'http://localhost/contests',
    asJson({ name: 'Cleanup Meet', date, location: 'Test Hall', discipline: 'Powerlifting' }),
    env,
  );
  expect(res.status).toBe(201);
  return ((await res.json()) as { data: { id: string } }).data.id;
}

async function createCompetitor(
  app: App,
  env: Env,
  input: { firstName: string; lastName: string; birthDate: string; gender: string },
): Promise<string> {
  const res = await app.request('http://localhost/competitors', asJson(input), env);
  expect(res.status).toBe(201);
  return ((await res.json()) as { data: { id: string } }).data.id;
}

async function createRegistration(
  app: App,
  env: Env,
  contestId: string,
  body: Record<string, unknown>,
): Promise<RegistrationData> {
  const res = await app.request(
    `http://localhost/contests/${contestId}/registrations`,
    asJson({ contestId, ...body }),
    env,
  );
  expect(res.status).toBe(201);
  return ((await res.json()) as { data: RegistrationData }).data;
}

async function readRegistration(app: App, env: Env, registrationId: string): Promise<RegistrationData> {
  const res = await app.request(`http://localhost/registrations/${registrationId}`, {}, env);
  expect(res.status).toBe(200);
  return ((await res.json()) as { data: RegistrationData }).data;
}

async function patchCompetitor(
  app: App,
  env: Env,
  competitorId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return app.request(`http://localhost/competitors/${competitorId}`, asJson(body, 'PATCH'), env);
}

describe('competitor edits and registrations', () => {
  it('updates age category and McCullough of a pending weigh-in', async () => {
    const { app, env } = testEnv;
    const contestId = await createContest(app, env);
    const competitorId = await createCompetitor(app, env, {
      firstName: 'Pending',
      lastName: 'Weighin',
      birthDate: '2005-04-12',
      gender: 'Male',
    });

    const registration = await createRegistration(app, env, contestId, { competitorId });
    expect(registration.bodyweight).toBeNull();
    expect(registration.weightClassId).toBeNull();
    expect(registration.ageCategoryName).toBe('Junior (20-23)');
    expect(registration.mcculloughCoefficient).toBeCloseTo(1, 3);

    const patch = await patchCompetitor(app, env, competitorId, { birthDate: '1960-04-12' });
    expect(patch.status).toBe(200);

    const updated = await readRegistration(app, env, registration.id);
    expect(updated.ageCategoryName).toBe('Master 60+');
    expect(updated.mcculloughCoefficient).toBeCloseTo(1.48, 2);
    // Without a weigh-in there is no weight class and no Reshel value.
    expect(updated.bodyweight).toBeNull();
    expect(updated.weightClassId).toBeNull();
    expect(updated.reshelCoefficient).toBeNull();
  });

  it('recalculates weight class and Reshel when the gender changes', async () => {
    const { app, env } = testEnv;
    const contestId = await createContest(app, env);
    const competitorId = await createCompetitor(app, env, {
      firstName: 'Gender',
      lastName: 'Swap',
      birthDate: '1990-02-02',
      gender: 'Male',
    });

    const registration = await createRegistration(app, env, contestId, { competitorId, bodyweight: 88 });
    expect(registration.weightClassName).toBe('Do 95 kg');
    expect(registration.reshelCoefficient).toBeCloseTo(0.983, 3);

    const patch = await patchCompetitor(app, env, competitorId, { gender: 'Female' });
    expect(patch.status).toBe(200);

    const updated = await readRegistration(app, env, registration.id);
    expect(updated.gender).toBe('Female');
    expect(updated.weightClassName).toBe('82.5+ kg');
    expect(updated.reshelCoefficient).toBeCloseTo(1.433, 3);
  });

  it('reranks the survivors when a competitor is deleted', async () => {
    const { app, env, db } = testEnv;
    const contestId = await createContest(app, env);

    const leaderRegistration = await createRegistration(app, env, contestId, {
      competitorId: await createCompetitor(app, env, {
        firstName: 'Anna',
        lastName: 'Leader',
        birthDate: '1990-01-01',
        gender: 'Female',
      }),
      bodyweight: 70,
    });
    const survivorRegistration = await createRegistration(app, env, contestId, {
      competitorId: await createCompetitor(app, env, {
        firstName: 'Beata',
        lastName: 'Survivor',
        birthDate: '1991-01-01',
        gender: 'Female',
      }),
      bodyweight: 71,
    });

    const insertAttempt = db.prepare(
      `INSERT INTO attempts (id, registration_id, lift_type, attempt_number, weight, status, created_at, updated_at)
       VALUES (?, ?, 'Squat', 1, ?, 'Successful', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    );
    await insertAttempt.bind(randomUUID(), leaderRegistration.id, 200).run();
    await insertAttempt.bind(randomUUID(), survivorRegistration.id, 100).run();

    const recalculated = await app.request(
      `http://localhost/contests/${contestId}/results/recalculate`,
      { method: 'POST' },
      env,
    );
    expect(recalculated.status).toBe(200);

    const placeOf = async (registrationId: string) => {
      const row = await db
        .prepare('SELECT place_open FROM results WHERE registration_id = ?')
        .bind(registrationId)
        .first<{ place_open: number | null }>();
      return row?.place_open ?? null;
    };

    expect(await placeOf(leaderRegistration.id)).toBe(1);
    expect(await placeOf(survivorRegistration.id)).toBe(2);

    const cachedKey = `rankings:${contestId}:open`;
    await testEnv.kv.put(cachedKey, '{"stale":true}');

    const deletion = await app.request(
      `http://localhost/competitors/${leaderRegistration.competitorId}`,
      { method: 'DELETE' },
      env,
    );
    expect(deletion.status).toBe(200);

    expect(await placeOf(leaderRegistration.id)).toBeNull();
    expect(await placeOf(survivorRegistration.id)).toBe(1);
    expect(await testEnv.kv.get(cachedKey)).toBeNull();
  });

  it('rebuilds the result row when a birth date change alters a coefficient', async () => {
    const { app, env, db } = testEnv;
    const contestId = await createContest(app, env);
    const competitorId = await createCompetitor(app, env, {
      firstName: 'Masters',
      lastName: 'Rebuild',
      birthDate: '2005-04-12',
      gender: 'Male',
    });
    const registration = await createRegistration(app, env, contestId, { competitorId, bodyweight: 88 });

    await db
      .prepare(
        `INSERT INTO attempts (id, registration_id, lift_type, attempt_number, weight, status, created_at, updated_at)
         VALUES (?, ?, 'Squat', 1, 200, 'Successful', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      )
      .bind(randomUUID(), registration.id)
      .run();

    const recalculated = await app.request(
      `http://localhost/contests/${contestId}/results/recalculate`,
      { method: 'POST' },
      env,
    );
    expect(recalculated.status).toBe(200);

    const pointsOf = async () => {
      const row = await db
        .prepare('SELECT coefficient_points FROM results WHERE registration_id = ?')
        .bind(registration.id)
        .first<{ coefficient_points: number }>();
      return row?.coefficient_points ?? null;
    };

    expect(await pointsOf()).toBeCloseTo(200 * 0.983 * 1, 2);

    const patch = await patchCompetitor(app, env, competitorId, { birthDate: '1960-04-12' });
    expect(patch.status).toBe(200);

    const updated = await readRegistration(app, env, registration.id);
    expect(updated.mcculloughCoefficient).toBeCloseTo(1.48, 2);
    expect(await pointsOf()).toBeCloseTo(200 * 0.983 * 1.48, 2);
  });

  it('publishes the refreshed registration when name, club or city change', async () => {
    const { app, env, live } = testEnv;
    const contestId = await createContest(app, env);
    const competitorId = await createCompetitor(app, env, {
      firstName: 'Old',
      lastName: 'Name',
      birthDate: '1990-01-01',
      gender: 'Male',
    });
    const registration = await createRegistration(app, env, contestId, { competitorId, bodyweight: 88 });

    live.reset();

    const patch = await patchCompetitor(app, env, competitorId, {
      firstName: 'New',
      club: 'Iron Club',
      city: 'Kraków',
    });
    expect(patch.status).toBe(200);

    const published = live.eventsFor(contestId).filter((event) => event.type === 'registration.upserted');
    expect(published).toHaveLength(1);
    expect(published[0]?.payload).toMatchObject({
      id: registration.id,
      contestId,
      firstName: 'New',
      club: 'Iron Club',
      city: 'Kraków',
    });
  });
});

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
  labels: string[];
  bodyweight: number | null;
  mcculloughCoefficient: number | null;
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

async function createContest(app: App, env: Env, name: string): Promise<string> {
  const res = await app.request(
    'http://localhost/contests',
    asJson({ name, date: '2025-07-01', location: 'Test Hall', discipline: 'Powerlifting' }),
    env,
  );
  expect(res.status).toBe(201);
  return ((await res.json()) as { data: { id: string } }).data.id;
}

async function createCompetitor(app: App, env: Env, birthDate: string): Promise<string> {
  const res = await app.request(
    'http://localhost/competitors',
    asJson({ firstName: 'Cleanup', lastName: 'Lifter', birthDate, gender: 'Male' }),
    env,
  );
  expect(res.status).toBe(201);
  return ((await res.json()) as { data: { id: string } }).data.id;
}

async function createRegistration(
  app: App,
  env: Env,
  contestId: string,
  body: Record<string, unknown> = {},
): Promise<RegistrationData> {
  const res = await app.request(
    `http://localhost/contests/${contestId}/registrations`,
    asJson({ contestId, ...body }),
    env,
  );
  expect(res.status).toBe(201);
  return ((await res.json()) as { data: RegistrationData }).data;
}

async function patchRegistration(
  app: App,
  env: Env,
  registrationId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return app.request(`http://localhost/registrations/${registrationId}`, asJson(body, 'PATCH'), env);
}

describe('registration routes', () => {
  it('publishes registration.upserted when labels change', async () => {
    const { app, env, live } = testEnv;
    const contestId = await createContest(app, env, 'Labels Meet');
    const registration = await createRegistration(app, env, contestId, {
      competitorId: await createCompetitor(app, env, '1990-01-01'),
      bodyweight: 88,
    });

    const tagRes = await app.request(
      `http://localhost/contests/${contestId}/tags`,
      asJson({ label: 'Junior' }),
      env,
    );
    expect(tagRes.status).toBe(201);

    live.reset();

    const res = await app.request(
      `http://localhost/registrations/${registration.id}/labels`,
      asJson({ labels: ['Junior'] }, 'PATCH'),
      env,
    );
    expect(res.status).toBe(200);
    expect((await res.json()) as { data: { labels: string[] } }).toMatchObject({
      data: { labels: ['Junior'] },
    });

    const published = live.eventsFor(contestId).filter((event) => event.type === 'registration.upserted');
    expect(published).toHaveLength(1);
    expect(published[0]?.payload).toMatchObject({
      id: registration.id,
      contestId,
      labels: ['Junior'],
    });
  });

  it('tells both rooms when a registration moves to another contest', async () => {
    const { app, env, live } = testEnv;
    const sourceContestId = await createContest(app, env, 'Source Meet');
    const destinationContestId = await createContest(app, env, 'Destination Meet');
    const registration = await createRegistration(app, env, sourceContestId, {
      competitorId: await createCompetitor(app, env, '1990-01-01'),
      bodyweight: 88,
    });

    live.reset();

    const res = await patchRegistration(app, env, registration.id, { contestId: destinationContestId });
    expect(res.status).toBe(200);
    expect((await res.json()) as { data: RegistrationData }).toMatchObject({
      data: { contestId: destinationContestId },
    });

    expect(live.eventsFor(sourceContestId).filter((event) => event.type === 'registration.deleted'))
      .toEqual([
        expect.objectContaining({ payload: { registrationId: registration.id } }),
      ]);

    const destination = live
      .eventsFor(destinationContestId)
      .filter((event) => event.type === 'registration.upserted');
    expect(destination).toHaveLength(1);
    expect(destination[0]?.payload).toMatchObject({
      id: registration.id,
      contestId: destinationContestId,
    });
  });

  it('keeps an explicit null McCullough override', async () => {
    const { app, env } = testEnv;
    const contestId = await createContest(app, env, 'Override Meet');
    const registration = await createRegistration(app, env, contestId, {
      competitorId: await createCompetitor(app, env, '1960-04-12'),
      bodyweight: 88,
    });
    expect(registration.mcculloughCoefficient).toBeCloseTo(1.48, 2);

    const cachedKey = `rankings:${contestId}:open`;
    await testEnv.kv.put(cachedKey, '{"stale":true}');

    const res = await patchRegistration(app, env, registration.id, { mcculloughCoefficient: null });
    expect(res.status).toBe(200);
    expect((await res.json()) as { data: RegistrationData }).toMatchObject({
      data: { mcculloughCoefficient: null },
    });

    const stored = await testEnv.db
      .prepare('SELECT mccullough_coefficient FROM registrations WHERE id = ?')
      .bind(registration.id)
      .first<{ mccullough_coefficient: number | null }>();
    expect(stored?.mccullough_coefficient).toBeNull();
    expect(await testEnv.kv.get(cachedKey)).toBeNull();
  });

  it('invalidates the results cache when a registration is deleted', async () => {
    const { app, env, live } = testEnv;
    const contestId = await createContest(app, env, 'Delete Meet');
    const registration = await createRegistration(app, env, contestId, {
      competitorId: await createCompetitor(app, env, '1990-01-01'),
      bodyweight: 88,
    });

    const cachedKey = `rankings:${contestId}:open`;
    await testEnv.kv.put(cachedKey, '{"stale":true}');
    live.reset();

    const res = await app.request(`http://localhost/registrations/${registration.id}`, { method: 'DELETE' }, env);
    expect(res.status).toBe(200);
    expect(await testEnv.kv.get(cachedKey)).toBeNull();

    expect(live.eventsFor(contestId).filter((event) => event.type === 'registration.deleted'))
      .toEqual([expect.objectContaining({ payload: { registrationId: registration.id } })]);
  });

  it('rejects an unknown age category instead of falling back', async () => {
    const { app, env } = testEnv;
    const contestId = await createContest(app, env, 'Category Meet');
    const registration = await createRegistration(app, env, contestId, {
      competitorId: await createCompetitor(app, env, '1990-01-01'),
      bodyweight: 88,
    });

    const res = await patchRegistration(app, env, registration.id, { ageCategoryId: randomUUID() });
    expect(res.status).toBe(400);
    expect((await res.json()) as { error: string }).toMatchObject({
      data: null,
      error: 'Invalid age category selection',
    });

    const stored = await testEnv.db
      .prepare('SELECT age_category_id FROM registrations WHERE id = ?')
      .bind(registration.id)
      .first<{ age_category_id: string }>();
    expect(stored?.age_category_id).toBe(registration.ageCategoryId);

    const accepted = await patchRegistration(app, env, registration.id, {
      ageCategoryId: registration.ageCategoryId,
    });
    expect(accepted.status).toBe(200);
  });
});

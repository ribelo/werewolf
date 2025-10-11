import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Miniflare } from 'miniflare';
import type { D1Database, KVNamespace } from '@cloudflare/workers-types';
import { createApp } from '../src/app';
import type { WerewolfEnvironment } from '../src/env';
import reshelMenData from '../../../packages/domain/src/data/reshel-men.json';
import reshelWomenData from '../../../packages/domain/src/data/reshel-women.json';
import mccData from '../../../packages/domain/src/data/mccullough.json';
import { resetCoefficientCaches } from '../src/services/coefficients';


const DEFAULT_SETTINGS = {
  language: 'pl',
  ui: {
    theme: 'light',
    showWeights: true,
    showAttempts: true,
  },
  competition: {
    federationRules: 'IPF',
    defaultBarWeight: 20,
  },
  database: {
    backupEnabled: true,
    autoBackupInterval: 24,
  },
};

describe('Werewolf API – integration (Miniflare + D1)', () => {
  let mf: Miniflare;
  let db: D1Database;
  let kv: KVNamespace;
  let app: ReturnType<typeof createApp>;
  let env: WerewolfEnvironment;

  beforeAll(async () => {
    mf = new Miniflare({
      modules: true,
      compatibilityDate: '2024-01-01',
      script: 'export default { async fetch() { return new Response("ok") } }',
      d1Databases: { DB: ':memory:' },
      kvNamespaces: ['KV'],
    });

    db = await mf.getD1Database('DB');
    kv = await mf.getKVNamespace('KV');

    await applyMigrations(db);

    app = createApp();
    env = {
      DB: db,
      KV: kv,
      ENV: 'test',
    } as WerewolfEnvironment;

    (env as any)['werewolf-contest-room'] = {
      idFromName: () => ({
        name: 'test-room',
      }),
      get: () => ({
        fetch: async () => new Response(null, { status: 204 }),
      }),
    };
  });

  afterAll(async () => {
    await mf.dispose();
  });

  beforeEach(async () => {
    await resetDatabase(db);
    await clearKv(kv);
    resetCoefficientCaches();
  });

  it('GET /health returns service status', async () => {
    const res = await app.request('http://localhost/health', {}, env);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toMatchObject({
      data: {
        status: 'ok',
      },
      error: null,
    });
    expect(typeof body.requestId).toBe('string');
  });

  it('can create and fetch a contest', async () => {
    const created = await createContest(app, env, {
      name: 'Integration Meet',
      date: '2025-06-15',
      location: 'Test Arena',
      discipline: 'Powerlifting',
    });

    expect(created.status).toBe(201);
    const createdBody = await created.json();
    expect(createdBody.data).toMatchObject({
      name: 'Integration Meet',
      location: 'Test Arena',
      discipline: 'Powerlifting',
    });

    const contestId = createdBody.data.id;
    const fetched = await app.request(`http://localhost/contests/${contestId}`, {}, env);
    expect(fetched.status).toBe(200);
    const fetchedBody = await fetched.json();
    expect(fetchedBody.data).toMatchObject({
      id: contestId,
      name: 'Integration Meet',
      mensBarWeight: 20,
      womensBarWeight: 15,
    });
  });

  it('auto-classifies registrations based on competitor data', async () => {
    const contestRes = await createContest(app, env, {
      name: 'Auto Classify Open',
      date: '2025-07-01',
      location: 'Test City',
      discipline: 'Powerlifting',
    });
    const contestId = (await contestRes.json()).data.id as string;

    const competitorRes = await app.request('http://localhost/competitors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Alex',
        lastName: 'Lifter',
        birthDate: '1995-04-12',
        gender: 'Male',
      }),
    }, env);
    expect(competitorRes.status).toBe(201);
    const competitorId = (await competitorRes.json()).data.id as string;

  const registrationRes = await app.request(`http://localhost/contests/${contestId}/registrations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contestId,
      competitorId,
      bodyweight: 93.4,
    }),
  }, env);

  expect(registrationRes.status).toBe(201);
  const registrationBody = await registrationRes.json();
  expect(registrationBody.data).toMatchObject({
    competitorId,
    contestId,
    ageCategoryId: expect.any(String),
    weightClassId: expect.any(String),
    ageCategoryName: expect.any(String),
    weightClassName: expect.any(String),
    reshelCoefficient: expect.any(Number),
    mcculloughCoefficient: expect.any(Number),
  });

  expect(registrationBody.data.ageCategoryName).toBe('Open');
  expect(registrationBody.data.weightClassName).toBe('Do 95 kg');
  expect(registrationBody.data.reshelCoefficient).toBeCloseTo(0.945, 3);
  expect(registrationBody.data.mcculloughCoefficient).toBeCloseTo(1.0, 3);
  });

  it('recalculates coefficients via maintenance endpoint', async () => {
    const contestRes = await createContest(app, env, {
      name: 'Recalc Meet',
      date: '2025-05-10',
      location: 'City Hall',
      discipline: 'Powerlifting',
    });
    const contestId = (await contestRes.json()).data.id as string;

    const competitorRes = await app.request('http://localhost/competitors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Taylor',
        lastName: 'Strong',
        birthDate: '1988-02-02',
        gender: 'Male',
      }),
    }, env);
    expect(competitorRes.status).toBe(201);
    const competitorId = (await competitorRes.json()).data.id as string;

    const registrationRes = await app.request(`http://localhost/contests/${contestId}/registrations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contestId,
        competitorId,
        bodyweight: 93.5,
      }),
    }, env);
    expect(registrationRes.status).toBe(201);
    const registrationId = (await registrationRes.json()).data.id as string;

    // Tamper with stored coefficients to ensure the maintenance endpoint recalculates them
    await db.prepare(
      'UPDATE registrations SET reshel_coefficient = 0, mccullough_coefficient = 0 WHERE id = ?'
    ).bind(registrationId).run();

    const maintenanceRes = await app.request('http://localhost/system/maintenance/recalculate-coefficients', {
      method: 'POST',
    }, env);
    expect(maintenanceRes.status).toBe(200);
    const maintenanceBody = await maintenanceRes.json();
    expect(maintenanceBody.data).toMatchObject({ success: true, processed: expect.any(Number), updated: expect.any(Number) });
    expect(maintenanceBody.data.updated).toBeGreaterThanOrEqual(1);

    const registrationFetch = await app.request(`http://localhost/registrations/${registrationId}`, {}, env);
    expect(registrationFetch.status).toBe(200);
    const registrationBody = await registrationFetch.json();
    expect(registrationBody.data.reshelCoefficient).toBeCloseTo(0.945, 3);
    expect(registrationBody.data.mcculloughCoefficient).toBeCloseTo(1.0, 3);
    expect(registrationBody.data.weightClassName).toBe('Do 95 kg');
    expect(registrationBody.data.ageCategoryName).toBe('Open');
  });

  it('assigns flights and gates the attempt queue by active flight', async () => {
    const contestRes = await createContest(app, env, {
      name: 'Flight Meet',
      date: '2025-04-10',
      location: 'Katowice',
      discipline: 'Powerlifting',
    });
    const contestId = (await contestRes.json()).data.id as string;

    const lifterA = await app.request('http://localhost/competitors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Anna',
        lastName: 'FlightA',
        birthDate: '1992-03-01',
        gender: 'Female',
      }),
    }, env);
    const lifterB = await app.request('http://localhost/competitors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Basia',
        lastName: 'FlightB',
        birthDate: '1990-07-11',
        gender: 'Female',
      }),
    }, env);

    expect(lifterA.status).toBe(201);
    expect(lifterB.status).toBe(201);

    const lifterAId = (await lifterA.json()).data.id as string;
    const lifterBId = (await lifterB.json()).data.id as string;

    const registrationARes = await app.request(`http://localhost/contests/${contestId}/registrations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contestId,
        competitorId: lifterAId,
        bodyweight: 63.2,
      }),
    }, env);

    const registrationBRes = await app.request(`http://localhost/contests/${contestId}/registrations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contestId,
        competitorId: lifterBId,
        bodyweight: 70.4,
      }),
    }, env);

    expect(registrationARes.status).toBe(201);
    expect(registrationBRes.status).toBe(201);

    const registrationAId = (await registrationARes.json()).data.id as string;
    const registrationBId = (await registrationBRes.json()).data.id as string;

    const bulkFlightRes = await app.request(`http://localhost/contests/${contestId}/registrations/bulk-flight`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assignments: [
          { registrationId: registrationAId, flightCode: 'A', flightOrder: 1 },
          { registrationId: registrationBId, flightCode: 'B', flightOrder: 1 },
        ],
      }),
    }, env);

    expect(bulkFlightRes.status).toBe(200);
    const bulkPayload = await bulkFlightRes.json();
    expect(bulkPayload.data.updated).toBe(2);

    const stateRes = await app.request(`http://localhost/contests/${contestId}/state`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentLift: 'Squat', currentRound: 1 }),
    }, env);
    expect(stateRes.status).toBe(200);

    // Upsert attempts for both lifters
    const attemptARes = await app.request(`http://localhost/contests/${contestId}/registrations/${registrationAId}/attempts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        registrationId: registrationAId,
        liftType: 'Squat',
        attemptNumber: 1,
        weight: 120,
      }),
    }, env);
    const attemptBRes = await app.request(`http://localhost/contests/${contestId}/registrations/${registrationBId}/attempts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        registrationId: registrationBId,
        liftType: 'Squat',
        attemptNumber: 1,
        weight: 130,
      }),
    }, env);

    expect(attemptARes.status).toBe(200);
    expect(attemptBRes.status).toBe(200);

    // Without active flight all attempts should appear
    const fullQueueRes = await app.request(`http://localhost/contests/${contestId}/attempts/queue`, {}, env);
    const fullQueue = await fullQueueRes.json();
    expect(fullQueueRes.status).toBe(200);
    expect(fullQueue.data).toHaveLength(2);

    // Activate flight A and ensure queue narrows
    const activeFlightRes = await app.request(`http://localhost/contests/${contestId}/active-flight`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activeFlight: 'A' }),
    }, env);
    expect(activeFlightRes.status).toBe(200);

    const gatedQueueRes = await app.request(`http://localhost/contests/${contestId}/attempts/queue`, {}, env);
    expect(gatedQueueRes.status).toBe(200);
    const gatedQueue = await gatedQueueRes.json();
    expect(gatedQueue.data).toHaveLength(1);
    expect(gatedQueue.data[0]?.flightCode).toBe('A');
    expect(gatedQueue.data[0]?.registrationId).toBe(registrationAId);
  });

  it('updates registration labels and returns arrays in responses', async () => {
    const contestRes = await createContest(app, env, {
      name: 'Labels Meet',
      date: '2025-10-12',
      location: 'Poznań',
      discipline: 'Powerlifting',
    });
    const contestId = (await contestRes.json()).data.id as string;

    const competitorRes = await app.request('http://localhost/competitors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Cezary',
        lastName: 'Label',
        birthDate: '1985-09-09',
        gender: 'Male',
      }),
    }, env);
    expect(competitorRes.status).toBe(201);
    const competitorId = (await competitorRes.json()).data.id as string;

    const registrationRes = await app.request(`http://localhost/contests/${contestId}/registrations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contestId,
        competitorId,
        bodyweight: 95.3,
      }),
    }, env);
    expect(registrationRes.status).toBe(201);
    const registrationId = (await registrationRes.json()).data.id as string;

    const labelPatch = await app.request(`http://localhost/registrations/${registrationId}/labels`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ labels: ['uniformed', 'vip'] }),
    }, env);
    expect(labelPatch.status).toBe(200);
    const labelData = await labelPatch.json();
    expect(labelData.data.labels).toEqual(['uniformed', 'vip']);

    const registrationFetch = await app.request(`http://localhost/registrations/${registrationId}`, {}, env);
    const registrationJson = await registrationFetch.json();
    expect(registrationJson.data.labels).toEqual(['uniformed', 'vip']);

    const contestRegistrationsRes = await app.request(`http://localhost/contests/${contestId}/registrations`, {}, env);
    const contestRegistrationsJson = await contestRegistrationsRes.json();
    const entry = contestRegistrationsJson.data.find((row: any) => row.id === registrationId);
    expect(entry.labels).toEqual(['uniformed', 'vip']);
  });

  it('includes clamp weight when calculating plate plans', async () => {
    const contestRes = await createContest(app, env, {
      name: 'Clamp Classic',
      date: '2025-03-20',
      location: 'Warsaw',
      discipline: 'Powerlifting',
    });
    const contestId = (await contestRes.json()).data.id as string;

    const clampUpdate = await app.request(`http://localhost/contests/${contestId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clampWeight: 4 }),
    }, env);
    expect(clampUpdate.status).toBe(200);

    // Provide a simple plate inventory
    await app.request(`http://localhost/contests/${contestId}/platesets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plateWeight: 25, quantity: 10 }),
    }, env);
    await app.request(`http://localhost/contests/${contestId}/platesets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plateWeight: 20, quantity: 10 }),
    }, env);

    const planRes = await app.request(`http://localhost/contests/${contestId}/platesets/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetWeight: 180 }),
    }, env);

    expect(planRes.status).toBe(200);
    const planBody = await planRes.json();
    expect(planBody.data.clampWeight).toBeCloseTo(4, 5);
    expect(planBody.data.barWeight).toBeCloseTo(20, 5);

    const barWeightsRes = await app.request(`http://localhost/contests/${contestId}/platesets/barweights`, {}, env);
    const barWeights = await barWeightsRes.json();
    expect(barWeights.data.clampWeight).toBeCloseTo(4, 5);
  });

  it('plate calculator respects limited small plates and returns best achievable <= target', async () => {
    const contestRes = await createContest(app, env, {
      name: 'Small Plates Limit',
      date: '2025-03-21',
      location: 'Poznań',
      discipline: 'Powerlifting',
    });
    const contestId = (await contestRes.json()).data.id as string;

    // Reduce inventory to only two pairs of 0.5 kg to simulate limited small plates
    await db.prepare('DELETE FROM plate_sets WHERE contest_id = ?').bind(contestId).run();
    await db.prepare('INSERT INTO plate_sets (contest_id, plate_weight, quantity, color) VALUES (?, ?, ?, ?)')
      .bind(contestId, 0.5, 2, '#6B7280').run();

    // 22.5 (bar+clamps): exact
    let planRes = await app.request(`http://localhost/contests/${contestId}/platesets/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetWeight: 22.5 }),
    }, env);
    expect(planRes.status).toBe(200);
    let plan = await planRes.json();
    expect(plan.data.totalLoaded).toBeCloseTo(22.5, 2);
    expect(plan.data.exact).toBe(true);
    expect(plan.data.increment).toBeCloseTo(1, 5); // min plate 0.5 -> step 1

    // 23.5: exact with one pair of 0.5
    planRes = await app.request(`http://localhost/contests/${contestId}/platesets/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetWeight: 23.5 }),
    }, env);
    plan = await planRes.json();
    expect(plan.data.totalLoaded).toBeCloseTo(23.5, 2);
    expect(plan.data.exact).toBe(true);

    // 24.5: exact with two pairs of 0.5
    planRes = await app.request(`http://localhost/contests/${contestId}/platesets/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetWeight: 24.5 }),
    }, env);
    plan = await planRes.json();
    expect(plan.data.totalLoaded).toBeCloseTo(24.5, 2);
    expect(plan.data.exact).toBe(true);

    // 25.5: not enough 0.5 plates to go higher; returns best achievable 24.5
    planRes = await app.request(`http://localhost/contests/${contestId}/platesets/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetWeight: 25.5 }),
    }, env);
    plan = await planRes.json();
    expect(plan.data.exact).toBe(false);
    expect(plan.data.totalLoaded).toBeCloseTo(24.5, 2);

    // Add one pair of 1.25 kg plates so that 25.0 becomes achievable
    await db.prepare('INSERT INTO plate_sets (contest_id, plate_weight, quantity, color) VALUES (?, ?, ?, ?)')
      .bind(contestId, 1.25, 1, '#16A34A').run();

    planRes = await app.request(`http://localhost/contests/${contestId}/platesets/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetWeight: 25.0 }),
    }, env);
    plan = await planRes.json();
    expect(plan.data.exact).toBe(true);
    expect(plan.data.totalLoaded).toBeCloseTo(25.0, 2);
  });

  it('manages contest-scoped categories via GET/PUT endpoints', async () => {
    const contestRes = await createContest(app, env, {
      name: 'Category Config Test',
      date: '2025-09-01',
      location: 'Gliwice',
      discipline: 'Powerlifting',
    });
    const contestId = (await contestRes.json()).data.id as string;

    const fetchInitial = await app.request(`http://localhost/contests/${contestId}/categories`, {}, env);
    expect(fetchInitial.status).toBe(200);
    const initialBody = await fetchInitial.json();

    expect(initialBody.data.ageCategories.length).toBeGreaterThan(0);
    expect(initialBody.data.weightClasses.length).toBeGreaterThan(0);

    const t16 = initialBody.data.ageCategories.find((entry: any) => entry.code === 'T16');
    const female52 = initialBody.data.weightClasses.find((entry: any) => entry.gender === 'Female' && entry.code === 'F_52');

    expect(t16).toBeTruthy();
    expect(female52).toBeTruthy();

    const updatePayload = {
      ageCategories: [
        {
          id: t16.id,
          code: 'T16',
          name: 'T16 / Młodzicy',
          minAge: t16.minAge,
          maxAge: t16.maxAge,
          sortOrder: 5,
        },
        {
          code: 'LEGENDS',
          name: 'Legends 60+',
          minAge: 60,
          maxAge: null,
          sortOrder: 90,
        },
      ],
      weightClasses: [
        {
          id: female52.id,
          gender: 'Female',
          code: 'F_52',
          name: 'Kobiety do 52 kg',
          minWeight: female52.minWeight,
          maxWeight: female52.maxWeight,
          sortOrder: 10,
        },
        {
          gender: 'Male',
          code: 'M_SUPER',
          name: 'Mężczyźni 140+ kg',
          minWeight: 140,
          maxWeight: null,
          sortOrder: 95,
        },
      ],
    };

    const updateRes = await app.request(`http://localhost/contests/${contestId}/categories`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatePayload),
    }, env);

    expect(updateRes.status).toBe(200);
    const updateBody = await updateRes.json();

    expect(updateBody.data.ageCategories).toHaveLength(2);
    expect(updateBody.data.weightClasses).toHaveLength(2);
    const legends = updateBody.data.ageCategories.find((entry: any) => entry.code === 'LEGENDS');
    expect(legends).toMatchObject({ name: 'Legends 60+', minAge: 60, maxAge: null });
    const superMale = updateBody.data.weightClasses.find((entry: any) => entry.code === 'M_SUPER');
    expect(superMale).toMatchObject({ minWeight: 140, maxWeight: null, gender: 'Male' });
  });

  it('prevents deleting in-use categories and blocks resetting defaults when registrations exist', async () => {
    const contestRes = await createContest(app, env, {
      name: 'Category Guard Test',
      date: '2025-10-01',
      location: 'Katowice',
      discipline: 'Powerlifting',
    });
    const contestId = (await contestRes.json()).data.id as string;

    const competitorRes = await app.request('http://localhost/competitors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Guard',
        lastName: 'Tester',
        birthDate: '1990-03-15',
        gender: 'Male',
      }),
    }, env);
    expect(competitorRes.status).toBe(201);
    const competitorId = (await competitorRes.json()).data.id as string;

    const registrationRes = await app.request(`http://localhost/contests/${contestId}/registrations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contestId,
        competitorId,
        bodyweight: 95,
      }),
    }, env);
    expect(registrationRes.status).toBe(201);
    const registrationBody = await registrationRes.json();
    const { ageCategoryId, weightClassId } = registrationBody.data;

    const removalAttempt = await app.request(`http://localhost/contests/${contestId}/categories`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ageCategories: [
          {
            code: 'U23',
            name: 'U23',
            minAge: 0,
            maxAge: 23,
            sortOrder: 10,
          },
        ],
        weightClasses: [
          {
            gender: 'Male',
            code: 'M_140',
            name: 'Mężczyźni 140 kg',
            minWeight: 140,
            maxWeight: null,
            sortOrder: 95,
          },
        ],
      }),
    }, env);

    expect(removalAttempt.status).toBe(409);
    const removalBody = await removalAttempt.json();
    expect(removalBody.error).toBe('AGE_CATEGORY_IN_USE');

    const resetDefaults = await app.request(`http://localhost/contests/${contestId}/categories/defaults`, {
      method: 'POST',
    }, env);
    expect(resetDefaults.status).toBe(409);
    const resetBody = await resetDefaults.json();
    expect(resetBody.error).toBe('CONTEST_HAS_REGISTRATIONS');
  });

  it('returns 404 when registering with an unknown competitor', async () => {
    const contestRes = await createContest(app, env, {
      name: '404 Contest',
      date: '2025-08-01',
      location: 'Nowhere',
      discipline: 'Powerlifting',
    });
    const contestId = (await contestRes.json()).data.id as string;

    const registrationRes = await app.request(`http://localhost/contests/${contestId}/registrations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contestId,
        competitorId: '00000000-0000-0000-0000-000000000000',
        bodyweight: 82.5,
      }),
    }, env);

    expect(registrationRes.status).toBe(404);
    const body = await registrationRes.json();
    expect(body).toMatchObject({ data: null, error: 'Competitor not found' });
  });

  it('GET /settings parses JSON payloads into structured object', async () => {
    const res = await app.request('http://localhost/settings', {}, env);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data).toMatchObject({
      language: 'pl',
      ui: { theme: 'light', showWeights: true },
      competition: { defaultBarWeight: 20 },
    });
  });

  it('validation errors follow the standard envelope', async () => {
    const res = await app.request('http://localhost/system/database/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: 'nope' }),
    }, env);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.data).toBeNull();
    expect(body.error).toContain('Validation failed');
  });

  it('rejects invalid payload for PATCH /settings/ui and keeps previous value', async () => {
    const res = await app.request('http://localhost/settings/ui', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ showWeights: 'yes' }),
    }, env);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.data).toBeNull();
    expect(body.error).toContain('Validation failed');

    const settingsRes = await app.request('http://localhost/settings', {}, env);
    expect(settingsRes.status).toBe(200);
    const settingsBody = await settingsRes.json();
    expect(settingsBody.data.ui.showWeights).toBe(true);
  });

  it('PATCH /attempts/:id/result updates status and judges', async () => {
    const contestRes = await createContest(app, env, {
      name: 'Result Patch Test',
      date: '2025-05-01',
      location: 'Patch City',
      discipline: 'Powerlifting',
    });
    const contestId = (await contestRes.json()).data.id as string;

    const competitorRes = await app.request('http://localhost/competitors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Marta',
        lastName: 'Nowak',
        birthDate: '1994-02-18',
        gender: 'Female',
      }),
    }, env);
    const competitorId = (await competitorRes.json()).data.id as string;

    const registrationRes = await app.request(`http://localhost/contests/${contestId}/registrations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contestId,
        competitorId,
        bodyweight: 63.0,
      }),
    }, env);
    const registrationId = (await registrationRes.json()).data.id as string;

    const attemptId = randomUUID();
    await db.prepare(
      `INSERT INTO attempts (id, registration_id, lift_type, attempt_number, weight, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'Pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
    ).bind(attemptId, registrationId, 'Bench', 1, 95).run();

    const patchRes = await app.request(`http://localhost/attempts/${attemptId}/result`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        attemptId,
        status: 'Successful',
        judge1Decision: true,
        judge2Decision: true,
        judge3Decision: false,
        notes: 'Two white lights',
      }),
    }, env);

    expect(patchRes.status).toBe(200);
    const patchBody = await patchRes.json();
    expect(patchBody).toMatchObject({ data: { success: true }, error: null });

    const updatedAttempt = await db.prepare(
      'SELECT status, judge1_decision, judge2_decision, judge3_decision, notes, timestamp, updated_at FROM attempts WHERE id = ?'
    ).bind(attemptId).first();

    expect(updatedAttempt?.status).toBe('Successful');
    expect(Boolean(updatedAttempt?.judge1_decision)).toBe(true);
    expect(Boolean(updatedAttempt?.judge2_decision)).toBe(true);
    expect(Boolean(updatedAttempt?.judge3_decision)).toBe(false);
    expect(updatedAttempt?.notes).toBe('Two white lights');
    expect(typeof updatedAttempt?.timestamp).toBe('string');
    expect(typeof updatedAttempt?.updated_at).toBe('string');
  });

  it('DELETE /contests/:id/attempts/current clears the active lift', async () => {
    const contestRes = await createContest(app, env, {
      name: 'Clear Current Test',
      date: '2025-05-10',
      location: 'Clear City',
      discipline: 'Powerlifting',
    });
    const contestId = (await contestRes.json()).data.id as string;

    await db.prepare(
      'INSERT INTO contest_states (contest_id, status, current_lift, current_round) VALUES (?, ?, ?, ?)'
    ).bind(contestId, 'InProgress', 'Bench', 1).run();

    const competitorRes = await app.request('http://localhost/competitors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Piotr',
        lastName: 'Lis',
        birthDate: '1991-11-11',
        gender: 'Male',
      }),
    }, env);
    const competitorId = (await competitorRes.json()).data.id as string;

    const registrationRes = await app.request(`http://localhost/contests/${contestId}/registrations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contestId,
        competitorId,
        bodyweight: 93.0,
      }),
    }, env);
    const registrationId = (await registrationRes.json()).data.id as string;

    const attemptId = randomUUID();
    await db.prepare(
      `INSERT INTO attempts (id, registration_id, lift_type, attempt_number, weight, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'Pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
    ).bind(attemptId, registrationId, 'Bench', 1, 140).run();

    const setRes = await app.request(`http://localhost/contests/${contestId}/attempts/current`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attemptId }),
    }, env);
    expect(setRes.status).toBe(200);

    const activeEntry = await db.prepare(
      'SELECT is_active FROM current_lifts WHERE contest_id = ?'
    ).bind(contestId).first();
    expect(Boolean(activeEntry?.is_active)).toBe(true);

    const currentRes = await app.request(`http://localhost/contests/${contestId}/attempts/current`, {}, env);
    expect(currentRes.status).toBe(200);
    const currentBody = await currentRes.json();
    expect(currentBody.error).toBeNull();
    expect(currentBody.data).not.toBeNull();

    const bundle = currentBody.data;
    expect(bundle.contest).toMatchObject({ id: contestId, name: 'Clear Current Test' });
    expect(bundle.attempt).toMatchObject({ id: attemptId, weight: 140, liftType: 'Bench', attemptNumber: 1 });
    expect(bundle.registration).toMatchObject({
      id: registrationId,
      contestId,
    });
    expect(bundle.attemptsByLift.Bench?.[0]).toMatchObject({ id: attemptId, weight: 140, status: 'Pending' });
    expect(bundle.platePlan).toMatchObject({ targetWeight: 140, barWeight: expect.any(Number) });

    const clearRes = await app.request(`http://localhost/contests/${contestId}/attempts/current`, {
      method: 'DELETE',
    }, env);

    expect(clearRes.status).toBe(200);
    const clearBody = await clearRes.json();
    expect(clearBody).toMatchObject({ data: { success: true, cleared: true }, error: null });

    const clearedEntry = await db.prepare(
      'SELECT is_active FROM current_lifts WHERE contest_id = ?'
    ).bind(contestId).first();
    expect(Boolean(clearedEntry?.is_active)).toBe(false);
  });
});

async function createContest(
  app: ReturnType<typeof createApp>,
  env: WerewolfEnvironment,
  input: { name: string; date: string; location: string; discipline: string }
) {
  return app.request('http://localhost/contests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  }, env);
}

const TEST_SCHEMA = `
CREATE TABLE contests (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    date TEXT NOT NULL,
    location TEXT NOT NULL,
    discipline TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Setup',
    federation_rules TEXT,
    competition_type TEXT,
    organizer TEXT,
    notes TEXT,
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    mens_bar_weight REAL NOT NULL DEFAULT 20,
    womens_bar_weight REAL NOT NULL DEFAULT 15,
    bar_weight REAL NOT NULL DEFAULT 20,
    clamp_weight REAL NOT NULL DEFAULT 2.5,
    active_flight TEXT
);

CREATE TABLE competitors (
    id TEXT PRIMARY KEY,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    birth_date TEXT NOT NULL,
    gender TEXT NOT NULL,
    club TEXT,
    city TEXT,
    notes TEXT,
    photo_data BLOB,
    photo_format TEXT,
    photo_metadata TEXT,
    competition_order INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE registrations (
    id TEXT PRIMARY KEY,
    contest_id TEXT NOT NULL,
    competitor_id TEXT NOT NULL,
    age_category_id TEXT NOT NULL,
    weight_class_id TEXT NOT NULL,
    equipment_m BOOLEAN NOT NULL DEFAULT FALSE,
    equipment_sm BOOLEAN NOT NULL DEFAULT FALSE,
    equipment_t BOOLEAN NOT NULL DEFAULT FALSE,
    bodyweight REAL NOT NULL,
    lot_number TEXT,
    personal_record_at_entry REAL,
    reshel_coefficient REAL,
    mccullough_coefficient REAL,
    rack_height_squat INTEGER,
    rack_height_bench INTEGER,
    flight_code TEXT,
    flight_order INTEGER,
    labels TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE attempts (
    id TEXT PRIMARY KEY,
    registration_id TEXT NOT NULL,
    lift_type TEXT NOT NULL,
    attempt_number INTEGER NOT NULL,
    weight REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'Pending',
    timestamp TEXT,
    judge1_decision BOOLEAN,
    judge2_decision BOOLEAN,
    judge3_decision BOOLEAN,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE results (
    id TEXT PRIMARY KEY,
    registration_id TEXT NOT NULL,
    contest_id TEXT NOT NULL,
    best_bench REAL DEFAULT 0,
    best_squat REAL DEFAULT 0,
    best_deadlift REAL DEFAULT 0,
    total_weight REAL NOT NULL DEFAULT 0,
    coefficient_points REAL NOT NULL DEFAULT 0,
    place_open INTEGER,
    place_in_age_class INTEGER,
    place_in_weight_class INTEGER,
    is_disqualified BOOLEAN NOT NULL DEFAULT FALSE,
    disqualification_reason TEXT,
    broke_record BOOLEAN NOT NULL DEFAULT FALSE,
    record_type TEXT,
    calculated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE current_lifts (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    contest_id TEXT NOT NULL,
    registration_id TEXT NOT NULL,
    lift_type TEXT NOT NULL,
    attempt_number INTEGER NOT NULL,
    weight REAL NOT NULL,
    timer_start TEXT,
    timer_duration INTEGER NOT NULL DEFAULT 60,
    rack_height INTEGER,
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE contest_states (
    contest_id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'Setup',
    current_lift TEXT,
    current_round INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE plate_sets (
    contest_id TEXT NOT NULL,
    plate_weight REAL NOT NULL,
    quantity INTEGER NOT NULL,
    color TEXT,
    PRIMARY KEY (contest_id, plate_weight)
);

CREATE TABLE reshel_coefficients (
    gender TEXT NOT NULL,
    bodyweight_kg REAL NOT NULL,
    coefficient REAL NOT NULL,
    source TEXT NOT NULL,
    retrieved_at TEXT NOT NULL,
    notes TEXT,
    PRIMARY KEY (gender, bodyweight_kg)
);

CREATE TABLE mccullough_coefficients (
    age INTEGER PRIMARY KEY,
    coefficient REAL NOT NULL,
    source TEXT NOT NULL,
    retrieved_at TEXT NOT NULL,
    notes TEXT
);

CREATE TABLE contest_age_categories (
    id TEXT PRIMARY KEY,
    contest_id TEXT NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    min_age INTEGER,
    max_age INTEGER,
    sort_order INTEGER NOT NULL DEFAULT 0,
    metadata TEXT
);

CREATE TABLE contest_weight_classes (
    id TEXT PRIMARY KEY,
    contest_id TEXT NOT NULL,
    gender TEXT NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    min_weight REAL,
    max_weight REAL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    metadata TEXT
);

CREATE TABLE settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    data TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`;

async function applyMigrations(db: D1Database) {
  const statements = TEST_SCHEMA
    .split(/;\s*(?:\n|$)/)
    .map((stmt) => stmt.trim())
    .filter((stmt) => stmt.length > 0);

  for (const sql of statements) {
    await db.prepare(sql).run();
  }
}

async function resetDatabase(db: D1Database) {
  const tables = [
    'results',
    'attempts',
    'current_lifts',
    'registrations',
    'contest_states',
    'plate_sets',
    'reshel_coefficients',
    'mccullough_coefficients',
    'contest_weight_classes',
    'contest_age_categories',
    'competitors',
    'contests',
    'settings'
  ];

  for (const table of tables) {
    await db.prepare(`DELETE FROM ${table}`).run();
  }

  await db.prepare(
    `INSERT INTO settings (id, data, created_at, updated_at)
     VALUES (1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
  ).bind(JSON.stringify(DEFAULT_SETTINGS)).run();

  await seedCoefficientTables(db);
}

async function seedCoefficientTables(db: D1Database) {
  const insertReshel = db.prepare(
    `INSERT OR REPLACE INTO reshel_coefficients (gender, bodyweight_kg, coefficient, source, retrieved_at, notes)
     VALUES (?, ?, ?, ?, ?, NULL)`
  );

  for (const entry of reshelMenData.entries) {
    await insertReshel
      .bind('male', entry.bodyweightKg, entry.coefficient, reshelMenData.source, reshelMenData.retrievedAt)
      .run();
  }

  for (const entry of reshelWomenData.entries) {
    await insertReshel
      .bind('female', entry.bodyweightKg, entry.coefficient, reshelWomenData.source, reshelWomenData.retrievedAt)
      .run();
  }

  const insertMc = db.prepare(
    `INSERT OR REPLACE INTO mccullough_coefficients (age, coefficient, source, retrieved_at, notes)
     VALUES (?, ?, ?, ?, NULL)`
  );

  for (const entry of mccData.entries) {
    await insertMc
      .bind(entry.age, entry.coefficient, mccData.source, mccData.retrievedAt)
      .run();
  }
}

async function clearKv(kv: KVNamespace) {
  const list = await kv.list();
  await Promise.all(list.keys.map((key) => kv.delete(key.name)));
}

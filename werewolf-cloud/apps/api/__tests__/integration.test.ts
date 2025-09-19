import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Miniflare } from 'miniflare';
import type { D1Database, KVNamespace } from '@cloudflare/workers-types';
import { createApp } from '../src/app';
import type { WerewolfEnvironment } from '../src/env';


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
      reshelCoefficient: expect.any(Number),
      mcculloughCoefficient: expect.any(Number),
    });
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
    bar_weight REAL NOT NULL DEFAULT 20
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

CREATE TABLE age_categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    min_age INTEGER,
    max_age INTEGER
);

INSERT INTO age_categories (id, name, min_age, max_age) VALUES
 ('JUNIOR13', 'Junior 13', 13, 15),
 ('JUNIOR16', 'Junior 16', 16, 18),
 ('JUNIOR19', 'Junior 19', 19, 19),
 ('JUNIOR23', 'Junior 23', 20, 23),
 ('SENIOR', 'Senior', 24, 39),
 ('VETERAN40', 'Veteran 40', 40, 49),
 ('VETERAN50', 'Veteran 50', 50, 59),
 ('VETERAN60', 'Veteran 60', 60, 69),
 ('VETERAN70', 'Veteran 70', 70, NULL);

CREATE TABLE weight_classes (
    id TEXT PRIMARY KEY,
    gender TEXT NOT NULL,
    name TEXT NOT NULL,
    weight_min REAL,
    weight_max REAL
);

INSERT INTO weight_classes (id, gender, name, weight_min, weight_max) VALUES
 ('M_52', 'Male', 'DO 52 KG', NULL, 52.0),
 ('M_56', 'Male', 'DO 56 KG', 52.01, 56.0),
 ('M_60', 'Male', 'DO 60 KG', 56.01, 60.0),
 ('M_67_5', 'Male', 'DO 67.5 KG', 60.01, 67.5),
 ('M_75', 'Male', 'DO 75 KG', 67.51, 75.0),
 ('M_82_5', 'Male', 'DO 82.5 KG', 75.01, 82.5),
 ('M_90', 'Male', 'DO 90 KG', 82.51, 90.0),
 ('M_100', 'Male', 'DO 100 KG', 90.01, 100.0),
 ('M_110', 'Male', 'DO 110 KG', 100.01, 110.0),
 ('M_125', 'Male', 'DO 125 KG', 110.01, 125.0),
 ('M_140', 'Male', 'DO 140 KG', 125.01, 140.0),
 ('M_140_PLUS', 'Male', '+ 140 KG', 140.01, NULL),
 ('F_47', 'Female', 'DO 47 KG', NULL, 47.0),
 ('F_52', 'Female', 'DO 52 KG', 47.01, 52.0),
 ('F_57', 'Female', 'DO 57 KG', 52.01, 57.0),
 ('F_63', 'Female', 'DO 63 KG', 57.01, 63.0),
 ('F_72', 'Female', 'DO 72 KG', 63.01, 72.0),
 ('F_84', 'Female', 'DO 84 KG', 72.01, 84.0),
 ('F_84_PLUS', 'Female', '+ 84 KG', 84.01, NULL);

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
}

async function clearKv(kv: KVNamespace) {
  const list = await kv.list();
  await Promise.all(list.keys.map((key) => kv.delete(key.name)));
}

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare } from 'miniflare';
import type { D1Database, KVNamespace } from '@cloudflare/workers-types';
import { createApp } from '../src/app';
import type { WerewolfEnvironment } from '../src/env';
import { BACKUP_TABLES } from '../src/services/backup';
import { resetCoefficientCaches } from '../src/services/coefficients';

const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../migrations',
);

type Row = Record<string, unknown>;
type TableDump = Record<string, Row[]>;

interface StoredManifest {
  id: string;
  timestamp: string;
  version: string;
  data: TableDump;
}

describe('system backup routes (Miniflare + D1)', () => {
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

    db = (await mf.getD1Database('DB')) as unknown as D1Database;
    kv = (await mf.getKVNamespace('KV')) as unknown as KVNamespace;

    await applyMigrations(db);

    app = createApp();
    env = {
      DB: db,
      KV: kv,
      ENV: 'test',
      ADMIN_PASSWORD: 'test-password',
    } as unknown as WerewolfEnvironment;
  });

  afterAll(async () => {
    await mf.dispose();
  });

  beforeEach(async () => {
    await wipeDatabase(db);
    await clearKv(kv);
    resetCoefficientCaches();
  });

  const postJson = (pathname: string, body: unknown) =>
    app.request(
      `http://localhost${pathname}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      env,
    );

  const restore = (backupId: string) =>
    app.request(`http://localhost/system/backups/${backupId}/restore`, { method: 'POST' }, env);

  const createStoredBackup = async (): Promise<{
    backupId: string;
    manifest: StoredManifest;
    record: { recordCounts: Record<string, number>; version: string };
  }> => {
    const response = await app.request('http://localhost/system/backups', { method: 'POST' }, env);
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { backupId: string; recordCounts: Record<string, number>; version: string };
    };
    const stored = await kv.get(`backup:${body.data.backupId}`);
    expect(stored).not.toBeNull();
    return {
      backupId: body.data.backupId,
      manifest: JSON.parse(stored as string) as StoredManifest,
      record: body.data,
    };
  };

  const storeBackup = async (backupId: string, manifest: unknown): Promise<void> => {
    await kv.put(`backup:${backupId}`, JSON.stringify(manifest));
  };

  it('covers every table and column of the migrated schema', async () => {
    const tables = await db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all();
    const tableNames = (tables.results as { name: string }[])
      .map((row) => row.name)
      .filter((name) => !name.startsWith('sqlite_') && !name.startsWith('_'))
      .sort();

    expect(BACKUP_TABLES.map((table) => table.name).sort()).toEqual(tableNames);

    for (const table of BACKUP_TABLES) {
      const info = await db.prepare(`PRAGMA table_info(${table.name})`).all();
      const columnNames = (info.results as { name: string }[]).map((row) => row.name);
      expect(table.columns.map((column) => column.name), table.name).toEqual(columnNames);
    }

    // Restore relies on foreign keys being enforced, which also proves the
    // delete/insert ordering below is meaningful.
    await expect(
      db
        .prepare(
          `INSERT INTO attempts (id, registration_id, lift_type, attempt_number, weight, status)
           VALUES ('orphan', 'missing-registration', 'Bench', 1, 100, 'Pending')`,
        )
        .run(),
    ).rejects.toThrow();
  });

  it('exports and restores every field of every table', async () => {
    await seedDatabase(db);
    const before = await dumpDatabase(db);
    for (const table of BACKUP_TABLES) {
      expect(before[table.name]?.length, table.name).toBeGreaterThan(0);
    }

    const { backupId, manifest, record } = await createStoredBackup();
    expect(record.version).toBe('2.0');
    expect(record.recordCounts).toMatchObject({
      contests: 1,
      competitors: 1,
      registrations: 1,
      attempts: 1,
      results: 1,
      contestAgeCategories: 1,
      contestWeightClasses: 1,
      contestTags: 1,
    });
    for (const table of BACKUP_TABLES) {
      expect(manifest.data[table.name], table.name).toBeDefined();
    }
    expect(manifest.data['registration_lifts']).toHaveLength(3);
    expect(manifest.data['contests']?.[0]?.['active_flight']).toBe('A');
    expect(manifest.data['contests']?.[0]?.['clamp_weight']).toBeCloseTo(2.5, 5);
    expect(manifest.data['contest_states']?.[0]?.['current_attempt_number']).toBe(3);
    expect(manifest.data['results']?.[0]?.['squat_points']).toBeCloseTo(10, 5);

    await wipeDatabase(db);
    const decoy = await db
      .prepare(
        `INSERT INTO competitors (id, first_name, last_name, birth_date, gender)
         VALUES ('decoy', 'Decoy', 'Row', '2000-01-01', 'Male')`,
      )
      .run();
    expect(decoy.success).toBe(true);
    expect(await dumpDatabase(db)).not.toEqual(before);

    const response = await restore(backupId);
    expect(response.status).toBe(200);

    const after = await dumpDatabase(db);
    expect(after).toEqual(before);

    const photo = (await db.prepare('SELECT photo_data FROM competitors').first()) as Row | null;
    expect(normalizeValue(photo?.['photo_data'])).toEqual([1, 2, 3, 4, 5]);
  });

  it('rejects malformed payloads without touching the database', async () => {
    await seedDatabase(db);
    const before = await dumpDatabase(db);
    const { manifest } = await createStoredBackup();

    // Every case carries a name change, so a restore that mutates before
    // validating would be visible in the dump below.
    const seededContest = manifest.data['contests']?.[0] ?? {};
    const contest = { ...seededContest, name: 'MUTATED-BY-RESTORE' };
    const data = { ...manifest.data, contests: [contest] };

    const cases: Array<[string, unknown]> = [
      ['empty object', {}],
      ['empty data', { data: {} }],
      ['single table only', { data: { contests: [contest] } }],
      ['unknown table', { data: { ...data, extra_table: [] } }],
      ['unrecognised version', { version: '1.0', data }],
      ['wrong column type', { data: { ...data, contests: [{ ...contest, is_archived: 'yes' }] } }],
      ['unknown column', { data: { ...data, contests: [{ ...contest, rogue_column: 1 }] } }],
      ['null in required column', { data: { ...data, contests: [{ ...contest, name: null }] } }],
    ];

    let index = 0;
    for (const [name, payload] of cases) {
      index += 1;
      const backupId = `backup_malformed_${index}`;
      await storeBackup(backupId, payload);

      const response = await restore(backupId);
      expect(response.status, name).toBe(400);
      expect(await dumpDatabase(db), name).toEqual(before);
    }

    // Control: the same payload without the malformation is applied.
    await storeBackup('backup_control', { ...manifest, id: 'backup_control', data });
    const control = await restore('backup_control');
    expect(control.status).toBe(200);
    const contestRow = (await db
      .prepare('SELECT name FROM contests WHERE id = ?')
      .bind('11111111-1111-4111-8111-111111111111')
      .first()) as Row | null;
    expect(contestRow?.['name']).toBe('MUTATED-BY-RESTORE');
  });

  it('leaves the database unchanged when a statement fails mid-restore', async () => {
    await seedDatabase(db);
    const before = await dumpDatabase(db);
    const { manifest } = await createStoredBackup();

    const contests = manifest.data['contests'] ?? [];
    expect(contests).toHaveLength(1);

    // Duplicate primary keys pass schema validation and fail inside the batch.
    const backupId = 'backup_duplicate_keys';
    await storeBackup(backupId, {
      ...manifest,
      id: backupId,
      data: { ...manifest.data, contests: [...contests, { ...contests[0] }] },
    });

    const response = await restore(backupId);
    expect(response.status).toBe(500);
    expect(await dumpDatabase(db)).toEqual(before);
  });

  it('rebuilds missing results and drops cached rankings after a restore', async () => {
    await seedDatabase(db);
    const { manifest } = await createStoredBackup();
    const contestId = '11111111-1111-4111-8111-111111111111';

    await storeBackup('backup_without_results', {
      ...manifest,
      id: 'backup_without_results',
      data: { ...manifest.data, results: [] },
    });
    await kv.put(`rankings:${contestId}:open`, JSON.stringify([{ stale: true }]));
    await kv.put(`rankings:${contestId}:bundle`, JSON.stringify({ stale: true }));

    const response = await restore('backup_without_results');
    expect(response.status).toBe(200);

    const result = (await db
      .prepare('SELECT * FROM results WHERE registration_id = ?')
      .bind('77777777-7777-4777-8777-777777777777')
      .first()) as Row | null;
    expect(result).not.toBeNull();
    expect(result?.['total_weight']).toBeCloseTo(100, 5);
    expect(result?.['coefficient_points']).toBeCloseTo(100 * 1.5 * 1.1, 5);
    expect(result?.['place_open']).toBe(1);

    expect(await kv.get(`rankings:${contestId}:open`)).toBeNull();
    expect(await kv.get(`rankings:${contestId}:bundle`)).toBeNull();
  });

  it('imports a downloaded snapshot and rejects empty or partial payloads', async () => {
    await seedDatabase(db);
    const before = await dumpDatabase(db);
    const { backupId } = await createStoredBackup();

    const download = await app.request(`http://localhost/system/backups/${backupId}`, {}, env);
    expect(download.status).toBe(200);
    const snapshot = (await download.json()) as { data: StoredManifest };

    const listed = await app.request('http://localhost/system/backups', {}, env);
    expect(listed.status).toBe(200);
    const listedBody = (await listed.json()) as {
      data: { total: number; backups: Array<{ id: string; recordCounts: Record<string, number> }> };
    };
    expect(listedBody.data.total).toBe(1);
    expect(listedBody.data.backups[0]?.recordCounts?.['contestAgeCategories']).toBe(1);

    const imported = await postJson('/system/backups/import', snapshot.data);
    expect(imported.status).toBe(200);
    const importedBody = (await imported.json()) as { data: { backupId: string } };
    expect(importedBody.data.backupId).not.toBe(backupId);
    expect(await kv.get(`backup:${importedBody.data.backupId}`)).not.toBeNull();

    const rejected: unknown[] = [{}, { data: {} }, { data: { contests: [] } }, { backups: [] }];
    for (const payload of rejected) {
      const response = await postJson('/system/backups/import', payload);
      expect(response.status, JSON.stringify(payload)).toBe(400);
    }

    await wipeDatabase(db);
    const response = await restore(importedBody.data.backupId);
    expect(response.status).toBe(200);
    expect(await dumpDatabase(db)).toEqual(before);
  });

  it('recalculates results and drops cached rankings after coefficient maintenance', async () => {
    await seedMaintenanceFixture(db);
    const contestId = 'aaaaaaaa-0000-4000-8000-000000000001';
    await kv.put(`rankings:${contestId}:open`, JSON.stringify([{ stale: true }]));

    const response = await app.request(
      'http://localhost/system/maintenance/recalculate-coefficients',
      { method: 'POST' },
      env,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { processed: number; updated: number } };
    expect(body.data.processed).toBe(1);
    expect(body.data.updated).toBe(1);

    const registration = (await db
      .prepare('SELECT reshel_coefficient, mccullough_coefficient FROM registrations WHERE id = ?')
      .bind('aaaaaaaa-0000-4000-8000-000000000005')
      .first()) as Row | null;
    expect(registration?.['reshel_coefficient']).toBeCloseTo(1.75, 5);
    expect(registration?.['mccullough_coefficient']).toBeCloseTo(1.25, 5);

    const result = (await db
      .prepare('SELECT coefficient_points, place_open FROM results WHERE registration_id = ?')
      .bind('aaaaaaaa-0000-4000-8000-000000000005')
      .first()) as Row | null;
    expect(result).not.toBeNull();
    expect(result?.['coefficient_points']).toBeCloseTo(100 * 1.75 * 1.25, 5);
    expect(result?.['place_open']).toBe(1);

    expect(await kv.get(`rankings:${contestId}:open`)).toBeNull();
  });
});

async function applyMigrations(db: D1Database): Promise<void> {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const withoutComments = sql
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
    const statements = withoutComments
      .split(/;\s*(?:\n|$)/)
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0);

    for (const statement of statements) {
      await db.prepare(statement).run();
    }
  }
}

async function wipeDatabase(db: D1Database): Promise<void> {
  for (const table of [...BACKUP_TABLES].reverse()) {
    await db.prepare(`DELETE FROM ${table.name}`).run();
  }
}

async function clearKv(kv: KVNamespace): Promise<void> {
  const list = await kv.list();
  await Promise.all(list.keys.map((key) => kv.delete(key.name)));
}

function normalizeValue(value: unknown): unknown {
  if (value instanceof ArrayBuffer) return Array.from(new Uint8Array(value));
  if (value instanceof Uint8Array) return Array.from(value);
  return value;
}

function normalizeRow(row: Row): Row {
  const normalized: Row = {};
  for (const [key, value] of Object.entries(row)) {
    normalized[key] = normalizeValue(value);
  }
  return normalized;
}

async function dumpDatabase(db: D1Database): Promise<TableDump> {
  const dump: TableDump = {};
  for (const table of BACKUP_TABLES) {
    const result = await db.prepare(`SELECT * FROM ${table.name}`).all();
    const rows = (result.results as Row[]).map((row) => normalizeRow(row));
    rows.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    dump[table.name] = rows;
  }
  return dump;
}

async function seedDatabase(db: D1Database): Promise<void> {
  const timestamp = '2025-01-01T10:00:00.000Z';
  const statements: Array<[string, unknown[]]> = [
    [
      `INSERT INTO contests (id, name, date, location, discipline, status, federation_rules, competition_type,
         organizer, notes, is_archived, created_at, updated_at, bar_weight, mens_bar_weight, womens_bar_weight,
         active_flight, clamp_weight)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['11111111-1111-4111-8111-111111111111', 'Test Cup', '2025-01-01', 'Warszawa', 'Powerlifting', 'InProgress', 'IPF', 'Full Power',
        'Organizer', 'notes', 0, timestamp, timestamp, 20, 20, 15, 'A', 2.5],
    ],
    [
      `INSERT INTO competitors (id, first_name, last_name, birth_date, gender, club, city, notes, photo_data,
         photo_format, photo_metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['22222222-2222-4222-8222-222222222222', 'Jan', 'Kowalski', '1995-01-01', 'Male', 'Club', 'City', 'notes', new Uint8Array([1, 2, 3, 4, 5]),
        'webp', '{"width":1}', timestamp, timestamp],
    ],
    [
      `INSERT INTO contest_age_categories (id, contest_id, code, name, min_age, max_age, sort_order, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ['33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', 'SENIOR', 'Senior (24-39)', 24, 39, 40, '{"source":"test"}'],
    ],
    [
      `INSERT INTO contest_weight_classes (id, contest_id, gender, code, name, min_weight, max_weight, sort_order, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['44444444-4444-4444-8444-444444444444', '11111111-1111-4111-8111-111111111111', 'Male', 'M_95', 'Do 95 kg', 82.51, 95, 30, null],
    ],
    [
      `INSERT INTO contest_tags (id, contest_id, label, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
      ['55555555-5555-4555-8555-555555555555', '11111111-1111-4111-8111-111111111111', 'Open', timestamp, timestamp],
    ],
    [
      `INSERT INTO plate_sets (id, contest_id, plate_weight, quantity, created_at, updated_at, color)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['66666666-6666-4666-8666-666666666666', '11111111-1111-4111-8111-111111111111', 20, 2, timestamp, timestamp, '#2563EB'],
    ],
    [
      `INSERT INTO contest_states (contest_id, status, current_round, current_lift, current_attempt_number, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ['11111111-1111-4111-8111-111111111111', 'InProgress', 2, 'Bench', 3, timestamp],
    ],
    [
      `INSERT INTO settings (id, data, created_at, updated_at) VALUES (?, ?, ?, ?)`,
      [1, '{"language":"pl"}', timestamp, timestamp],
    ],
    [
      `INSERT INTO reshel_coefficients (gender, bodyweight_kg, coefficient, source, retrieved_at, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ['male', 90.5, 1.5, 'test', timestamp, null],
    ],
    [
      `INSERT INTO mccullough_coefficients (age, coefficient, source, retrieved_at, notes)
       VALUES (?, ?, ?, ?, ?)`,
      [30, 1.1, 'test', timestamp, null],
    ],
    [
      `INSERT INTO system_logs (id, level, message, metadata, created_at) VALUES (?, ?, ?, ?, ?)`,
      [1, 'info', 'seeded', '{"detail":true}', timestamp],
    ],
    [
      `INSERT INTO registrations (id, contest_id, competitor_id, age_category_id, weight_class_id, bodyweight,
         reshel_coefficient, mccullough_coefficient, rack_height_squat, rack_height_bench, created_at, flight_code,
         flight_order, labels)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['77777777-7777-4777-8777-777777777777', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444', 90.5, 1.5, 1.1, 100, 90, timestamp, 'A', 1, '["Open"]'],
    ],
    [
      `INSERT INTO registration_lifts (registration_id, lift_type, created_at) VALUES (?, ?, ?)`,
      ['77777777-7777-4777-8777-777777777777', 'Squat', timestamp],
    ],
    [
      `INSERT INTO registration_lifts (registration_id, lift_type, created_at) VALUES (?, ?, ?)`,
      ['77777777-7777-4777-8777-777777777777', 'Bench', timestamp],
    ],
    [
      `INSERT INTO registration_lifts (registration_id, lift_type, created_at) VALUES (?, ?, ?)`,
      ['77777777-7777-4777-8777-777777777777', 'Deadlift', timestamp],
    ],
    [
      `INSERT INTO attempts (id, registration_id, lift_type, attempt_number, weight, status, timestamp,
         judge1_decision, judge2_decision, judge3_decision, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['88888888-8888-4888-8888-888888888888', '77777777-7777-4777-8777-777777777777', 'Bench', 1, 100, 'Successful', timestamp, 1, 0, 1, 'notes', timestamp, timestamp],
    ],
    [
      `INSERT INTO results (id, registration_id, contest_id, best_bench, best_squat, best_deadlift, total_weight,
         coefficient_points, place_open, place_in_age_class, place_in_weight_class, is_disqualified,
         disqualification_reason, broke_record, record_type, calculated_at, squat_points, bench_points, deadlift_points)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['99999999-9999-4999-8999-999999999999', '77777777-7777-4777-8777-777777777777', '11111111-1111-4111-8111-111111111111', 100, 10, 0, 110, 181.5, 1, 1, 1, 0, null, 1, 'Contest', timestamp, 10, 100, 0],
    ],
    [
      `INSERT INTO current_lifts (id, contest_id, registration_id, lift_type, attempt_number, weight, timer_start,
         timer_duration, rack_height, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [1, '11111111-1111-4111-8111-111111111111', '77777777-7777-4777-8777-777777777777', 'Bench', 3, 100, timestamp, 60, 90, 1, timestamp, timestamp],
    ],
  ];

  for (const [sql, params] of statements) {
    await db.prepare(sql).bind(...params).run();
  }
}

async function seedMaintenanceFixture(db: D1Database): Promise<void> {
  const timestamp = '2025-01-01T10:00:00.000Z';
  const statements: Array<[string, unknown[]]> = [
    [
      `INSERT INTO contests (id, name, date, location, discipline, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ['aaaaaaaa-0000-4000-8000-000000000001', 'Maintenance Cup', '2025-01-01', 'Warszawa', 'Powerlifting', 'InProgress', timestamp, timestamp],
    ],
    [
      `INSERT INTO competitors (id, first_name, last_name, birth_date, gender, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['aaaaaaaa-0000-4000-8000-000000000002', 'Anna', 'Nowak', '1995-01-01', 'Male', timestamp, timestamp],
    ],
    [
      `INSERT INTO contest_age_categories (id, contest_id, code, name, min_age, max_age, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['aaaaaaaa-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000001', 'SENIOR', 'Senior (24-39)', 24, 39, 40],
    ],
    [
      `INSERT INTO contest_weight_classes (id, contest_id, gender, code, name, min_weight, max_weight, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ['aaaaaaaa-0000-4000-8000-000000000004', 'aaaaaaaa-0000-4000-8000-000000000001', 'Male', 'M_95', 'Do 95 kg', 82.51, 95, 30],
    ],
    [
      `INSERT INTO reshel_coefficients (gender, bodyweight_kg, coefficient, source, retrieved_at, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ['male', 90.5, 1.75, 'test', timestamp, null],
    ],
    [
      `INSERT INTO mccullough_coefficients (age, coefficient, source, retrieved_at, notes)
       VALUES (?, ?, ?, ?, ?)`,
      [30, 1.25, 'test', timestamp, null],
    ],
    [
      `INSERT INTO registrations (id, contest_id, competitor_id, age_category_id, weight_class_id, bodyweight,
         reshel_coefficient, mccullough_coefficient, created_at, flight_code, flight_order, labels)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['aaaaaaaa-0000-4000-8000-000000000005', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000003',
        'aaaaaaaa-0000-4000-8000-000000000004', 90.5, 0.5, 0.5, timestamp, 'A', 1, '["Open"]'],
    ],
    [
      `INSERT INTO attempts (id, registration_id, lift_type, attempt_number, weight, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ['aaaaaaaa-0000-4000-8000-000000000006', 'aaaaaaaa-0000-4000-8000-000000000005', 'Bench', 1, 100, 'Successful', timestamp, timestamp],
    ],
    [
      `INSERT INTO results (id, registration_id, contest_id, best_bench, total_weight, coefficient_points,
         place_open, is_disqualified, broke_record, calculated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['aaaaaaaa-0000-4000-8000-000000000007', 'aaaaaaaa-0000-4000-8000-000000000005', 'aaaaaaaa-0000-4000-8000-000000000001', 100, 100, 999, 1, 0, 0, timestamp],
    ],
  ];

  for (const [sql, params] of statements) {
    await db.prepare(sql).bind(...params).run();
  }
}

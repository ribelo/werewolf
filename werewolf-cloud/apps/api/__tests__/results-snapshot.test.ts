import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { D1Database, KVNamespace } from '@cloudflare/workers-types';
import { createTestEnv, wipeDatabase, type TestEnvironment } from './helpers/d1';
import { resetCoefficientCaches } from '../src/services/coefficients';
import reshelMenData from '../../../packages/domain/src/data/reshel-men.json';
import reshelWomenData from '../../../packages/domain/src/data/reshel-women.json';
import mccData from '../../../packages/domain/src/data/mccullough.json';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.resolve(HERE, 'results-snapshot.json');
const UPDATE_FIXTURE = process.env.RESULTS_SNAPSHOT_UPDATE === '1';

const DEFAULT_SETTINGS = {
  language: 'pl',
  ui: { theme: 'light', showWeights: true, showAttempts: true },
  competition: { federationRules: 'IPF', defaultBarWeight: 20 },
  database: { backupEnabled: true, autoBackupInterval: 24 },
};

const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const TIMESTAMP_PATTERN = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g;

/** Replace generated ids and wall-clock timestamps so payloads compare byte for byte. */
function normalise(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.replace(UUID_PATTERN, '<uuid>').replace(TIMESTAMP_PATTERN, '<timestamp>');
  }
  if (Array.isArray(value)) {
    return value.map((entry) => normalise(entry));
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, normalise(entry)]),
    );
  }
  return value;
}

type FixturePerson = {
  firstName: string;
  lastName: string;
  birthDate: string;
  gender: 'Male' | 'Female';
  club: string | null;
  bodyweight: number;
  labels?: string[];
  attempts: Array<
    [lift: 'Squat' | 'Bench' | 'Deadlift', attempt: number, weight: number, status: 'Successful' | 'Failed']
  >;
  disqualify?: { reason: string; recordType: string };
};

const PEOPLE: FixturePerson[] = [
  {
    firstName: 'Anna',
    lastName: 'Kowalska',
    birthDate: '1998-05-10',
    gender: 'Female',
    club: 'Atlas',
    bodyweight: 58.5,
    attempts: [
      ['Squat', 1, 120, 'Successful'],
      ['Squat', 2, 130, 'Successful'],
      ['Squat', 3, 135, 'Failed'],
      ['Bench', 1, 70, 'Successful'],
      ['Bench', 2, 75, 'Successful'],
      ['Bench', 4, 80, 'Successful'],
      ['Deadlift', 1, 150, 'Successful'],
      ['Deadlift', 2, 160, 'Successful'],
    ],
  },
  {
    firstName: 'Barbara',
    lastName: 'Nowak',
    birthDate: '1975-02-20',
    gender: 'Female',
    club: 'Tytan',
    bodyweight: 70,
    labels: ['Open', 'vip'],
    attempts: [
      ['Squat', 1, 100, 'Successful'],
      ['Bench', 1, 55, 'Successful'],
      ['Deadlift', 1, 120, 'Successful'],
    ],
  },
  {
    firstName: 'Cezary',
    lastName: 'Zielinski',
    birthDate: '2005-01-05',
    gender: 'Male',
    club: 'Atlas',
    bodyweight: 80,
    labels: ['Open', 'uniformed'],
    attempts: [
      ['Squat', 1, 180, 'Successful'],
      ['Bench', 1, 110, 'Successful'],
      ['Bench', 4, 115, 'Failed'],
      ['Deadlift', 1, 200, 'Successful'],
    ],
  },
  {
    firstName: 'Damian',
    lastName: 'Wisniewski',
    birthDate: '1990-11-30',
    gender: 'Male',
    club: 'Tytan',
    bodyweight: 100,
    labels: ['Open', 'vip', 'uniformed'],
    attempts: [
      ['Squat', 1, 200, 'Successful'],
      ['Bench', 1, 140, 'Successful'],
      ['Deadlift', 1, 240, 'Successful'],
    ],
  },
  {
    firstName: 'Ewa',
    lastName: 'Lewandowska',
    birthDate: '1960-03-01',
    gender: 'Female',
    club: 'Atlas',
    bodyweight: 55,
    attempts: [
      ['Squat', 1, 60, 'Successful'],
      ['Bench', 1, 40, 'Successful'],
      ['Deadlift', 1, 80, 'Successful'],
    ],
  },
  {
    firstName: 'Filip',
    lastName: 'Kaczmarek',
    birthDate: '1985-07-04',
    gender: 'Male',
    club: null,
    bodyweight: 120,
    attempts: [
      ['Squat', 1, 190, 'Successful'],
      ['Bench', 1, 130, 'Successful'],
      ['Deadlift', 1, 230, 'Successful'],
    ],
  },
  {
    firstName: 'Grazyna',
    lastName: 'Plonka',
    birthDate: '1995-01-01',
    gender: 'Female',
    club: 'Tytan',
    bodyweight: 62,
    attempts: [
      ['Squat', 1, 100, 'Successful'],
      ['Bench', 1, 50, 'Successful'],
      ['Deadlift', 1, 100, 'Successful'],
    ],
    disqualify: { reason: 'Depth', recordType: 'National' },
  },
];

describe('results payload snapshots', () => {
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
    await seedCoefficientTables(testEnv.db);
  });

  it('keeps rankings, exports and the public bundle byte-identical', async () => {
    const { app, env, db } = testEnv;
    const request = (pathname: string, init?: RequestInit) =>
      app.request(`http://localhost${pathname}`, init, env);
    const postJson = (pathname: string, body: unknown) =>
      request(pathname, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

    const contestRes = await postJson('/contests', {
      name: 'Snapshot Cup',
      date: '2025-06-14',
      location: 'Warsaw',
      discipline: 'Powerlifting',
    });
    expect(contestRes.status).toBe(201);
    const contestId = (await contestRes.json()).data.id as string;

    for (const label of ['vip', 'uniformed']) {
      const tagRes = await postJson(`/contests/${contestId}/tags`, { label });
      expect(tagRes.status).toBe(201);
    }

    const registrationIds: string[] = [];

    for (const person of PEOPLE) {
      const competitorRes = await postJson('/competitors', {
        firstName: person.firstName,
        lastName: person.lastName,
        birthDate: person.birthDate,
        gender: person.gender,
        club: person.club ?? undefined,
      });
      expect(competitorRes.status).toBe(201);
      const competitorId = (await competitorRes.json()).data.id as string;

      const registrationRes = await postJson(`/contests/${contestId}/registrations`, {
        contestId,
        competitorId,
        bodyweight: person.bodyweight,
      });
      expect(registrationRes.status).toBe(201);
      const registrationId = (await registrationRes.json()).data.id as string;
      registrationIds.push(registrationId);

      if (person.labels) {
        const labelsRes = await request(`/registrations/${registrationId}/labels`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ labels: person.labels }),
        });
        expect(labelsRes.status).toBe(200);
      }

      for (const [lift, attempt, weight, status] of person.attempts) {
        await db
          .prepare(
            `INSERT INTO attempts (id, registration_id, lift_type, attempt_number, weight, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            randomUUID(),
            registrationId,
            lift,
            attempt,
            weight,
            status,
            '2025-06-14T08:00:00.000Z',
            '2025-06-14T08:00:00.000Z',
          )
          .run();
      }
    }

    const recalcRes = await postJson(`/contests/${contestId}/results/recalculate`, {});
    expect(recalcRes.status).toBe(200);

    // Disqualifications and records are applied after the recalculation so the
    // snapshot locks the read paths instead of the recompute side effects.
    await db
      .prepare(
        `UPDATE results
         SET is_disqualified = 1, disqualification_reason = ?, broke_record = 1, record_type = ?
         WHERE registration_id = ?`,
      )
      .bind('Depth', 'National', registrationIds[6]!)
      .run();
    await db.prepare(`UPDATE results SET calculated_at = '2025-06-14T18:00:00.000Z'`).run();

    const json = async (pathname: string, init?: RequestInit) =>
      normalise(await (await request(pathname, init)).json());
    const text = async (pathname: string, init?: RequestInit) =>
      normalise(await (await request(pathname, init)).text());
    const exportBody = (body: Record<string, unknown>): RequestInit => ({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const snapshot = {
      rankingsOpen: await json(`/contests/${contestId}/results/rankings?type=open`),
      rankingsAge: await json(`/contests/${contestId}/results/rankings?type=age`),
      rankingsWeight: await json(`/contests/${contestId}/results/rankings?type=weight`),
      rankingsTagVip: await json(`/contests/${contestId}/results/rankings?type=tag&tag=vip`),
      rankingsBundle: await json(`/contests/${contestId}/results/rankings/all`),
      team: await json(`/contests/${contestId}/results/team`),
      publicBundle: await json(`/contests/${contestId}/results/public-bundle`),
      registrationResult: await json(`/results/${registrationIds[0]}`),
      exportLegacyJson: await json(`/contests/${contestId}/results/export`, exportBody({ format: 'json' })),
      exportLegacyCsv: await text(`/contests/${contestId}/results/export`, exportBody({ format: 'csv' })),
      exportBenchJson: await json(
        `/contests/${contestId}/results/export`,
        exportBody({ format: 'json', lift: 'Bench' }),
      ),
      exportBenchCsv: await text(
        `/contests/${contestId}/results/export`,
        exportBody({ format: 'csv', lift: 'Bench' }),
      ),
      exportSquatCsv: await text(
        `/contests/${contestId}/results/export`,
        exportBody({ format: 'csv', lift: 'Squat' }),
      ),
    };

    if (UPDATE_FIXTURE) {
      writeFileSync(FIXTURE_PATH, JSON.stringify(snapshot, null, 2) + '\n');
    }

    const recorded = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as unknown;
    expect(snapshot).toEqual(recorded);
  });
});

async function seedCoefficientTables(db: D1Database) {
  const insertReshel = db.prepare(
    `INSERT OR REPLACE INTO reshel_coefficients (gender, bodyweight_kg, coefficient, source, retrieved_at, notes)
     VALUES (?, ?, ?, ?, ?, NULL)`,
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
     VALUES (?, ?, ?, ?, NULL)`,
  );

  for (const entry of mccData.entries) {
    await insertMc.bind(entry.age, entry.coefficient, mccData.source, mccData.retrievedAt).run();
  }
}

async function clearKv(kv: KVNamespace) {
  const list = await kv.list();
  await Promise.all(list.keys.map((key) => kv.delete(key.name)));
}

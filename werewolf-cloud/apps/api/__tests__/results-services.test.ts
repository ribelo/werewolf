import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';
import { createTestEnv, wipeDatabase, type TestEnvironment } from './helpers/d1';
import { calculateRegistrationResults, updateAllRankings } from '../src/services/results';
import { resetCoefficientCaches } from '../src/services/coefficients';

describe('result writes', () => {
  let testEnv: TestEnvironment;

  beforeAll(async () => {
    testEnv = await createTestEnv();
  });

  afterAll(async () => {
    await testEnv.dispose();
  });

  beforeEach(async () => {
    await wipeDatabase(testEnv.db);
    resetCoefficientCaches();
  });

  it('preserves disqualification, record and placement columns when results are recalculated', async () => {
    const { db } = testEnv;
    const { registrationId } = await seedRegistration(testEnv, 'Preserved');
    await insertAttempt(db, registrationId, 'Squat', 1, 100, 'Successful');

    await calculateRegistrationResults(db, registrationId);

    await db
      .prepare(
        `UPDATE results
         SET is_disqualified = 1, disqualification_reason = 'Depth',
             broke_record = 1, record_type = 'National',
             place_open = 5, place_in_age_class = 4, place_in_weight_class = 3
         WHERE registration_id = ?`,
      )
      .bind(registrationId)
      .run();

    await insertAttempt(db, registrationId, 'Squat', 2, 120, 'Successful');
    await calculateRegistrationResults(db, registrationId);

    const row = await db
      .prepare(
        `SELECT best_squat, total_weight, is_disqualified, disqualification_reason,
                broke_record, record_type, place_open, place_in_age_class, place_in_weight_class
         FROM results WHERE registration_id = ?`,
      )
      .bind(registrationId)
      .first();

    expect(row?.best_squat).toBe(120);
    expect(row?.total_weight).toBe(120);
    expect(row?.is_disqualified).toBe(1);
    expect(row?.disqualification_reason).toBe('Depth');
    expect(row?.broke_record).toBe(1);
    expect(row?.record_type).toBe('National');
    expect(row?.place_open).toBe(5);
    expect(row?.place_in_age_class).toBe(4);
    expect(row?.place_in_weight_class).toBe(3);
  });

  it('ranks legacy rows whose ids are not UUIDs', async () => {
    const { db } = testEnv;
    const { contestId, ageCategoryId, weightClassId } = await seedContest(testEnv, 'Legacy Cup');

    await db
      .prepare(
        `INSERT INTO competitors (id, first_name, last_name, birth_date, gender, created_at, updated_at)
         VALUES ('legacy-competitor', 'Legacy', 'Lifter', '1990-01-01', 'Male', '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z')`,
      )
      .run();
    await db
      .prepare(
        `INSERT INTO registrations (id, contest_id, competitor_id, age_category_id, weight_class_id, bodyweight, created_at)
         VALUES ('legacy-registration', ?, 'legacy-competitor', ?, ?, 90, '2025-01-01T00:00:00.000Z')`,
      )
      .bind(contestId, ageCategoryId, weightClassId)
      .run();
    await db
      .prepare(
        `INSERT INTO results (id, registration_id, contest_id, best_squat, total_weight, coefficient_points, calculated_at)
         VALUES ('legacy-result', 'legacy-registration', ?, 150, 150, 137.25, '2025-01-01T00:00:00.000Z')`,
      )
      .bind(contestId)
      .run();

    await expect(updateAllRankings(db, contestId)).resolves.toBeUndefined();

    const row = await db
      .prepare('SELECT place_open, place_in_age_class, place_in_weight_class FROM results WHERE id = ?')
      .bind('legacy-result')
      .first();
    expect(row?.place_open).toBe(1);
    expect(row?.place_in_age_class).toBe(1);
    expect(row?.place_in_weight_class).toBe(1);
  });

  it('keeps every placement statement inside the D1 parameter budget', async () => {
    const { db } = testEnv;
    const { contestId, ageCategoryId, weightClassId } = await seedContest(testEnv, 'Bulk Cup');
    const rows = 40;

    for (let index = 0; index < rows; index += 1) {
      const suffix = String(index + 1).padStart(2, '0');
      const points = 200 - index;

      await db
        .prepare(
          `INSERT INTO competitors (id, first_name, last_name, birth_date, gender, created_at, updated_at)
           VALUES (?, 'Bulk', ?, '1990-01-01', 'Male', '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z')`,
        )
        .bind(`bulk-competitor-${suffix}`, `Lifter ${suffix}`)
        .run();
      await db
        .prepare(
          `INSERT INTO registrations (id, contest_id, competitor_id, age_category_id, weight_class_id, bodyweight, created_at)
           VALUES (?, ?, ?, ?, ?, 90, '2025-01-01T00:00:00.000Z')`,
        )
        .bind(`bulk-registration-${suffix}`, contestId, `bulk-competitor-${suffix}`, ageCategoryId, weightClassId)
        .run();
      await db
        .prepare(
          `INSERT INTO results (id, registration_id, contest_id, total_weight, coefficient_points, calculated_at)
           VALUES (?, ?, ?, ?, ?, '2025-01-01T00:00:00.000Z')`,
        )
        .bind(`bulk-result-${suffix}`, `bulk-registration-${suffix}`, contestId, points, points)
        .run();
    }

    const boundCounts: number[] = [];
    await updateAllRankings(recordBoundParams(db, boundCounts), contestId);

    const placements = await db
      .prepare('SELECT id, place_open FROM results WHERE contest_id = ? ORDER BY place_open ASC')
      .bind(contestId)
      .all();

    expect(placements.results).toHaveLength(rows);
    expect(placements.results.map((row) => row.place_open)).toEqual(
      Array.from({ length: rows }, (_, index) => index + 1),
    );
    expect(Math.max(...boundCounts)).toBeLessThanOrEqual(100);
  });
});

/** Wraps D1 so the test can see how many parameters each statement binds. */
function recordBoundParams(db: D1Database, boundCounts: number[]): D1Database {
  const wrapper = Object.create(db) as D1Database;
  wrapper.prepare = ((sql: string) => {
    const statement = db.prepare(sql);
    return {
      bind: (...params: unknown[]) => {
        boundCounts.push(params.length);
        return statement.bind(...params);
      },
    } as unknown as D1PreparedStatement;
  }) as D1Database['prepare'];

  return wrapper;
}

async function seedContest(
  testEnv: TestEnvironment,
  name: string,
): Promise<{ contestId: string; ageCategoryId: string; weightClassId: string }> {
  const { app, env, db } = testEnv;
  const res = await app.request(
    'http://localhost/contests',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, date: '2025-06-14', location: 'Warsaw', discipline: 'Powerlifting' }),
    },
    env,
  );
  expect(res.status).toBe(201);
  const contestId = (await res.json()).data.id as string;

  const ageCategory = await db
    .prepare('SELECT id FROM contest_age_categories WHERE contest_id = ? ORDER BY sort_order ASC LIMIT 1')
    .bind(contestId)
    .first();
  const weightClass = await db
    .prepare('SELECT id FROM contest_weight_classes WHERE contest_id = ? AND gender = ? ORDER BY sort_order ASC LIMIT 1')
    .bind(contestId, 'Male')
    .first();

  return {
    contestId,
    ageCategoryId: String(ageCategory?.id),
    weightClassId: String(weightClass?.id),
  };
}

async function seedRegistration(
  testEnv: TestEnvironment,
  lastName: string,
): Promise<{ contestId: string; registrationId: string }> {
  const { app, env } = testEnv;
  const post = (path: string, body: unknown) =>
    app.request(
      `http://localhost${path}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
      env,
    );

  const contestRes = await post('/contests', {
    name: `${lastName} Cup`,
    date: '2025-06-14',
    location: 'Warsaw',
    discipline: 'Powerlifting',
  });
  expect(contestRes.status).toBe(201);
  const contestId = (await contestRes.json()).data.id as string;

  const competitorRes = await post('/competitors', {
    firstName: 'Case',
    lastName,
    birthDate: '1990-01-01',
    gender: 'Male',
  });
  expect(competitorRes.status).toBe(201);
  const competitorId = (await competitorRes.json()).data.id as string;

  const registrationRes = await post(`/contests/${contestId}/registrations`, {
    contestId,
    competitorId,
    bodyweight: 90,
  });
  expect(registrationRes.status).toBe(201);

  return { contestId, registrationId: (await registrationRes.json()).data.id as string };
}

async function insertAttempt(
  db: D1Database,
  registrationId: string,
  lift: 'Squat' | 'Bench' | 'Deadlift',
  attemptNumber: number,
  weight: number,
  status: 'Successful' | 'Failed',
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO attempts (id, registration_id, lift_type, attempt_number, weight, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, '2025-06-14T08:00:00.000Z', '2025-06-14T08:00:00.000Z')`,
    )
    .bind(randomUUID(), registrationId, lift, attemptNumber, weight, status)
    .run();
}

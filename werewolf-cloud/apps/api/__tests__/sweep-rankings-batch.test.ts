import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { D1Database, KVNamespace } from '@cloudflare/workers-types';
import { createTestEnv, wipeDatabase, type TestEnvironment } from './helpers/d1';
import { resetCoefficientCaches } from '../src/services/coefficients';
import { updateAllRankings } from '../src/services/results';
import { rebuildContestResults } from '../src/services/backup/rankings';
import { publicResultsCacheKey } from '../src/utils/cache';

type RankingRow = {
  id: string;
  registration_id: string;
  place_open: number | null;
  place_in_age_class: number | null;
  place_in_weight_class: number | null;
  total_weight: number;
  coefficient_points: number;
  squat_points: number;
  bench_points: number;
  deadlift_points: number;
  is_disqualified: number;
  bodyweight: number;
  age_category_id: string | null;
  weight_class_id: string | null;
  labels: string;
};

type RecordedStatement = { sql: string; params: readonly unknown[] };

/**
 * Stands in for D1 so a test can see whether updateAllRankings writes through
 * one batch and how many statements (and bound parameters) that batch carries.
 */
function createRecordingDatabase(rows: readonly RankingRow[]) {
  const batched: RecordedStatement[] = [];
  const runsOutsideBatch: string[] = [];
  let batchCalls = 0;

  const db = {
    prepare(sql: string) {
      let params: readonly unknown[] = [];
      const statement = {
        sql,
        bind(...bound: readonly unknown[]) {
          params = bound;
          return statement;
        },
        async all() {
          return { results: rows, success: true, meta: {} };
        },
        async run() {
          runsOutsideBatch.push(sql);
          return { results: [], success: true, meta: { changes: 1 } };
        },
        async first() {
          return null;
        },
        get boundParams() {
          return params;
        },
      };
      return statement;
    },
    async batch(statements: readonly { sql: string; boundParams: readonly unknown[] }[]) {
      batchCalls += 1;
      for (const statement of statements) {
        batched.push({ sql: statement.sql, params: statement.boundParams });
      }
      return [];
    },
  };

  return {
    db: db as unknown as D1Database,
    batchCalls: () => batchCalls,
    batched,
    runsOutsideBatch,
  };
}

function rankingRows(count: number, placements: (index: number) => number | null): RankingRow[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `result-${index}`,
    registration_id: `registration-${index}`,
    place_open: placements(index),
    place_in_age_class: placements(index),
    place_in_weight_class: placements(index),
    total_weight: 100 + index,
    coefficient_points: 1000 - index,
    squat_points: 0,
    bench_points: 0,
    deadlift_points: 0,
    is_disqualified: 0,
    bodyweight: 90,
    age_category_id: 'age-1',
    weight_class_id: 'weight-1',
    labels: '["Open"]',
  }));
}

describe('updateAllRankings statement batching', () => {
  it('writes every placement column of a chunk set through one batch', async () => {
    // 40 changed rows per column, while one statement holds 30 of them.
    const recorder = createRecordingDatabase(rankingRows(40, () => null));

    await updateAllRankings(recorder.db, 'contest-1');

    expect(recorder.batchCalls()).toBe(1);
    expect(recorder.runsOutsideBatch).toEqual([]);

    for (const column of ['place_open', 'place_in_age_class', 'place_in_weight_class']) {
      expect(
        recorder.batched.filter((statement) => statement.sql.includes(`${column} = CASE`)),
        column,
      ).toHaveLength(2);
    }

    for (const statement of recorder.batched) {
      expect(statement.params.length, statement.sql).toBeLessThanOrEqual(100);
    }
  });

  it('skips the batch entirely when every placement already matches', async () => {
    const recorder = createRecordingDatabase(rankingRows(40, (index) => index + 1));

    await updateAllRankings(recorder.db, 'contest-1');

    expect(recorder.batchCalls()).toBe(0);
    expect(recorder.batched).toEqual([]);
  });
});

describe('ranking writes against D1', () => {
  let testEnv: TestEnvironment;
  let db: D1Database;
  let kv: KVNamespace;

  beforeAll(async () => {
    testEnv = await createTestEnv();
    db = testEnv.db;
    kv = testEnv.kv;
  });

  afterAll(async () => {
    await testEnv.dispose();
  });

  beforeEach(async () => {
    await wipeDatabase(db);
    const list = await kv.list();
    await Promise.all(list.keys.map((key) => kv.delete(key.name)));
    resetCoefficientCaches();
  });

  it('ranks every registration across statement chunks', async () => {
    const contest = await db
      .prepare(
        `INSERT INTO contests (id, name, date, location, discipline, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
      )
      .bind('contest-chunked', 'Chunk Cup', '2025-07-01', 'Warszawa', 'Powerlifting', 'InProgress')
      .run();
    expect(contest.success).toBe(true);

    const age = await db
      .prepare(
        `INSERT INTO contest_age_categories (id, contest_id, code, name, min_age, max_age, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind('age-1', 'contest-chunked', 'SENIOR', 'Senior', 24, 39, 10)
      .run();
    expect(age.success).toBe(true);

    const weight = await db
      .prepare(
        `INSERT INTO contest_weight_classes (id, contest_id, gender, code, name, min_weight, max_weight, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind('weight-1', 'contest-chunked', 'Male', 'M_95', 'Do 95 kg', 82.51, 95, 10)
      .run();
    expect(weight.success).toBe(true);

    const statements = [];

    for (let index = 0; index < 40; index += 1) {
      const competitorId = `competitor-${index}`;
      const registrationId = `registration-${index}`;

      statements.push(
        db
          .prepare(
            `INSERT INTO competitors (id, first_name, last_name, birth_date, gender, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
          )
          .bind(competitorId, 'Case', `Number${index}`, '1990-01-01', 'Male')
      );
      statements.push(
        db
          .prepare(
            `INSERT INTO registrations (id, contest_id, competitor_id, age_category_id, weight_class_id,
               bodyweight, created_at, flight_code, flight_order, labels)
             VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 'A', ?, '["Open"]')`
          )
          .bind(registrationId, 'contest-chunked', competitorId, 'age-1', 'weight-1', 90, index)
      );
      statements.push(
        db
          .prepare(
            `INSERT INTO results (id, registration_id, contest_id, total_weight, coefficient_points,
               place_open, place_in_age_class, place_in_weight_class, is_disqualified, broke_record, calculated_at)
             VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, 0, 0, CURRENT_TIMESTAMP)`
          )
          .bind(`result-${index}`, registrationId, 'contest-chunked', 100 + index, 1000 - index)
      );
    }

    await db.batch(statements);

    await updateAllRankings(db, 'contest-chunked');

    const placements = await db
      .prepare(
        `SELECT place_open, place_in_age_class, place_in_weight_class
         FROM results
         WHERE contest_id = ?
         ORDER BY coefficient_points DESC`
      )
      .bind('contest-chunked')
      .all<{ place_open: number; place_in_age_class: number; place_in_weight_class: number }>();

    expect(placements.results).toHaveLength(40);
    placements.results.forEach((row, index) => {
      expect(row.place_open).toBe(index + 1);
      expect(row.place_in_age_class).toBe(index + 1);
      expect(row.place_in_weight_class).toBe(index + 1);
    });
  });

  it('rebuilds missing results through the shared ranking writer and drops the caches', async () => {
    const contestId = 'contest-rebuild';
    await db
      .prepare(
        `INSERT INTO contests (id, name, date, location, discipline, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
      )
      .bind(contestId, 'Rebuild Cup', '2025-07-02', 'Warszawa', 'Powerlifting', 'InProgress')
      .run();
    await db
      .prepare(
        `INSERT INTO competitors (id, first_name, last_name, birth_date, gender, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
      )
      .bind('competitor-rebuild', 'Anna', 'Nowak', '1990-01-01', 'Male')
      .run();
    await db
      .prepare(
        `INSERT INTO contest_age_categories (id, contest_id, code, name, min_age, max_age, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind('age-rebuild', contestId, 'SENIOR', 'Senior', 24, 39, 10)
      .run();
    await db
      .prepare(
        `INSERT INTO contest_weight_classes (id, contest_id, gender, code, name, min_weight, max_weight, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind('weight-rebuild', contestId, 'Male', 'M_95', 'Do 95 kg', 82.51, 95, 10)
      .run();
    await db
      .prepare(
        `INSERT INTO registrations (id, contest_id, competitor_id, age_category_id, weight_class_id,
           bodyweight, created_at, flight_code, flight_order, labels)
         VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 'A', 1, '["Open"]')`
      )
      .bind('registration-rebuild', contestId, 'competitor-rebuild', 'age-rebuild', 'weight-rebuild', 90)
      .run();
    await db
      .prepare(
        `INSERT INTO registration_lifts (registration_id, lift_type, created_at)
         VALUES (?, ?, CURRENT_TIMESTAMP)`
      )
      .bind('registration-rebuild', 'Squat')
      .run();
    await db
      .prepare(
        `INSERT INTO attempts (id, registration_id, lift_type, attempt_number, weight, status, created_at, updated_at)
         VALUES (?, ?, 'Squat', 1, 100, 'Successful', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
      )
      .bind('attempt-rebuild', 'registration-rebuild')
      .run();

    await kv.put(`rankings:${contestId}:open`, '[]');
    await kv.put(`rankings:${contestId}:age`, '[]');
    await kv.put(publicResultsCacheKey(contestId), '{}');

    await rebuildContestResults(db, kv, contestId);

    const result = await db
      .prepare('SELECT total_weight, place_open FROM results WHERE registration_id = ?')
      .bind('registration-rebuild')
      .first<{ total_weight: number; place_open: number | null }>();
    expect(result).not.toBeNull();
    expect(Number(result?.total_weight)).toBe(100);
    expect(Number(result?.place_open)).toBe(1);

    expect(await kv.get(`rankings:${contestId}:open`)).toBeNull();
    expect(await kv.get(`rankings:${contestId}:age`)).toBeNull();
    expect(await kv.get(publicResultsCacheKey(contestId))).toBeNull();
  });
});

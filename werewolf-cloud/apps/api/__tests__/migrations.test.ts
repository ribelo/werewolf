import { describe, it, expect } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';
import { applyMigrations, createTestDatabase, listMigrationFiles } from './helpers/d1';

/**
 * 0025 rebuilds `registrations` after `PRAGMA foreign_keys = OFF`, but D1 does
 * not honour that pragma: `DROP TABLE registrations` cascades into every child
 * table, so the upgrade silently deletes attempts, results, lift selections and
 * the current lift. The test below documents the hazard; it is expected to fail
 * until the migration is fixed (never edited in place once applied).
 */
const REBUILD_MIGRATION = '0025_allow_pending_weigh_ins.sql';

const countRows = async (db: D1Database, table: string): Promise<number> => {
  const row = await db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first<{ count: number }>();
  return Number(row?.count ?? 0);
};

describe('D1 migration upgrades', () => {
  it('lists migrations in order with the 0025 rebuild after 0024', () => {
    const files = listMigrationFiles();

    expect(files.indexOf('0024_add_lift_points.sql')).toBeGreaterThanOrEqual(0);
    expect(files.indexOf(REBUILD_MIGRATION)).toBeGreaterThan(files.indexOf('0024_add_lift_points.sql'));
    expect(files).toEqual([...files].sort());
  });

  it.fails(
    '0025 rebuild preserves registrations children (attempts, results, lift selections, current lift)',
    async () => {
      const { db, dispose } = await createTestDatabase();

      try {
        const files = listMigrationFiles();
        const rebuildIndex = files.indexOf(REBUILD_MIGRATION);
        if (rebuildIndex === -1) {
          throw new Error(`Missing migration ${REBUILD_MIGRATION}`);
        }

        // Schema as the app shipped before the bodyweight/weight-class relaxations.
        await applyMigrations(db, files.slice(0, rebuildIndex));

        await db
          .prepare(
            "INSERT INTO contests (id, name, date, location, discipline, status) VALUES (?, ?, ?, ?, ?, 'InProgress')",
          )
          .bind('contest-1', 'Upgrade Meet', '2025-01-11', 'Warsaw', 'Powerlifting')
          .run();
        await db
          .prepare('INSERT INTO competitors (id, first_name, last_name, birth_date, gender) VALUES (?, ?, ?, ?, ?)')
          .bind('competitor-1', 'Ala', 'Malinowska', '1994-02-03', 'Female')
          .run();
        await db
          .prepare('INSERT INTO contest_age_categories (id, contest_id, code, name) VALUES (?, ?, ?, ?)')
          .bind('contest-1:SENIOR', 'contest-1', 'SENIOR', 'Senior (24-39)')
          .run();
        await db
          .prepare('INSERT INTO contest_weight_classes (id, contest_id, gender, code, name) VALUES (?, ?, ?, ?, ?)')
          .bind('contest-1:F_63', 'contest-1', 'Female', 'F_63', 'Do 63 kg')
          .run();
        await db
          .prepare(
            'INSERT INTO registrations (id, contest_id, competitor_id, age_category_id, weight_class_id, bodyweight) VALUES (?, ?, ?, ?, ?, ?)',
          )
          .bind('registration-1', 'contest-1', 'competitor-1', 'contest-1:SENIOR', 'contest-1:F_63', 61.5)
          .run();
        await db
          .prepare('INSERT INTO registration_lifts (registration_id, lift_type) VALUES (?, ?)')
          .bind('registration-1', 'Bench')
          .run();
        await db
          .prepare(
            'INSERT INTO attempts (id, registration_id, lift_type, attempt_number, weight, status) VALUES (?, ?, ?, ?, ?, ?)',
          )
          .bind('attempt-1', 'registration-1', 'Bench', 1, 95, 'Successful')
          .run();
        await db
          .prepare('INSERT INTO results (id, registration_id, contest_id, best_bench, total_weight) VALUES (?, ?, ?, ?, ?)')
          .bind('result-1', 'registration-1', 'contest-1', 95, 95)
          .run();
        await db
          .prepare(
            'INSERT INTO current_lifts (id, contest_id, registration_id, lift_type, attempt_number, weight, is_active) VALUES (1, ?, ?, ?, ?, ?, ?)',
          )
          .bind('contest-1', 'registration-1', 'Bench', 1, 95, true)
          .run();
        await db
          .prepare('INSERT INTO contest_states (contest_id, status, current_lift, current_round) VALUES (?, ?, ?, ?)')
          .bind('contest-1', 'InProgress', 'Bench', 1)
          .run();

        const childTables = ['registration_lifts', 'attempts', 'results', 'current_lifts'];

        for (const table of childTables) {
          expect(await countRows(db, table), `${table} seeded before 0025`).toBe(1);
        }

        await applyMigrations(db, files.slice(rebuildIndex));

        expect(await countRows(db, 'registrations')).toBe(1);

        for (const table of childTables) {
          expect(await countRows(db, table), `${table} after the 0025 rebuild`).toBe(1);
        }

        expect(await countRows(db, 'contest_states')).toBe(1);
      } finally {
        await dispose();
      }
    },
  );
});

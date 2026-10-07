import type { Database } from '../../utils/database';
import { convertKeysToCamelCase, executeQuery } from '../../utils/database';

/**
 * Every contest result view reads one join over results, registrations,
 * competitors and the contest categories. Each projection below is a named
 * column slice of that single source; column order is part of the payload
 * because JSON responses serialise the keys in the order the query returns.
 */
const RESULT_SOURCE = `
    FROM results r
    JOIN registrations reg ON r.registration_id = reg.id
    JOIN competitors c ON reg.competitor_id = c.id
    JOIN contests contest ON reg.contest_id = contest.id
    LEFT JOIN contest_age_categories ac ON reg.age_category_id = ac.id
    LEFT JOIN contest_weight_classes wc ON reg.weight_class_id = wc.id
`;

const LABELS_COLUMN = `COALESCE(reg.labels, '[]') AS labels`;

const RANKING_COLUMNS = `
      r.id, r.registration_id, r.contest_id,
      r.best_bench, r.best_squat, r.best_deadlift,
      r.total_weight, r.coefficient_points,
      r.squat_points, r.bench_points, r.deadlift_points,
      r.place_open, r.place_in_age_class, r.place_in_weight_class,
      r.is_disqualified, r.disqualification_reason,
      r.broke_record, r.record_type, r.calculated_at,
      c.first_name, c.last_name,
      c.gender,
      c.club,
      reg.competitor_id,
      ac.name AS age_category,
      wc.name AS weight_class,
      reg.bodyweight,
      ${LABELS_COLUMN}
`;

const EXPORT_COLUMNS = `
      r.place_open,
      r.registration_id,
      r.best_squat,
      r.best_bench,
      r.best_deadlift,
      r.total_weight,
      r.coefficient_points,
      r.squat_points,
      r.bench_points,
      r.deadlift_points,
      r.is_disqualified,
      c.first_name,
      c.last_name,
      c.birth_date,
      reg.bodyweight,
      reg.reshel_coefficient,
      reg.mccullough_coefficient,
      c.gender,
      ${LABELS_COLUMN},
      ac.name AS age_category,
      ac.min_age AS age_min,
      ac.max_age AS age_max,
      wc.name AS weight_class
`;

const TEAM_COLUMNS = `
      r.registration_id,
      r.best_bench,
      r.best_squat,
      r.best_deadlift,
      r.total_weight,
      r.coefficient_points,
      r.squat_points,
      r.bench_points,
      r.deadlift_points,
      r.is_disqualified,
      reg.competitor_id,
      reg.bodyweight,
      reg.reshel_coefficient,
      reg.mccullough_coefficient,
      c.first_name,
      c.last_name,
      c.gender,
      c.birth_date,
      c.club,
      contest.date AS contest_date,
      ac.name AS age_category,
      wc.name AS weight_class
`;

export type RankingResultRow = {
  id: string;
  registrationId: string;
  contestId: string;
  bestBench: number | null;
  bestSquat: number | null;
  bestDeadlift: number | null;
  totalWeight: number | null;
  coefficientPoints: number | null;
  squatPoints: number | null;
  benchPoints: number | null;
  deadliftPoints: number | null;
  placeOpen: number | null;
  placeInAgeClass: number | null;
  placeInWeightClass: number | null;
  isDisqualified: number | boolean | null;
  disqualificationReason: string | null;
  brokeRecord: number | boolean | null;
  recordType: string | null;
  calculatedAt: string;
  firstName: string;
  lastName: string;
  gender: string | null;
  club: string | null;
  competitorId: string;
  ageCategory: string | null;
  weightClass: string | null;
  bodyweight: number | null;
  labels: string[];
};

/** Export projection; labels stay the raw JSON text the export payload has always carried. */
export type ExportResultRow = {
  placeOpen: number | null;
  registrationId: string;
  bestSquat: number | null;
  bestBench: number | null;
  bestDeadlift: number | null;
  totalWeight: number | null;
  coefficientPoints: number | null;
  squatPoints: number | null;
  benchPoints: number | null;
  deadliftPoints: number | null;
  isDisqualified: number | boolean | null;
  firstName: string | null;
  lastName: string | null;
  birthDate: string | null;
  bodyweight: number | null;
  reshelCoefficient: number | null;
  mcculloughCoefficient: number | null;
  gender: string | null;
  labels: string;
  ageCategory: string | null;
  ageMin: number | null;
  ageMax: number | null;
  weightClass: string | null;
};

export type TeamResultRow = {
  registrationId: string;
  competitorId: string;
  bestBench: number | null;
  bestSquat: number | null;
  bestDeadlift: number | null;
  totalWeight: number | null;
  coefficientPoints: number | null;
  squatPoints: number | null;
  benchPoints: number | null;
  deadliftPoints: number | null;
  isDisqualified: number | boolean | null;
  bodyweight: number | null;
  reshelCoefficient: number | null;
  mcculloughCoefficient: number | null;
  firstName: string;
  lastName: string;
  gender: string | null;
  birthDate: string | null;
  contestDate: string | null;
  club: string | null;
  ageCategory: string | null;
  weightClass: string | null;
};

export function parseLabelText(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input.map(String);
  }
  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export async function loadRankingRows(db: Database, contestId: string): Promise<RankingResultRow[]> {
  const rows = await executeQuery(db, `SELECT${RANKING_COLUMNS}${RESULT_SOURCE} WHERE r.contest_id = ?`, [contestId]);
  const camel = convertKeysToCamelCase(rows) as Array<Omit<RankingResultRow, 'labels'> & { labels: unknown }>;

  return camel.map((row) => ({ ...row, labels: parseLabelText(row.labels) }));
}

export async function loadExportRows(db: Database, contestId: string): Promise<ExportResultRow[]> {
  const rows = await executeQuery(
    db,
    `SELECT${EXPORT_COLUMNS}${RESULT_SOURCE}
    WHERE r.contest_id = ?
    ORDER BY CASE WHEN r.place_open IS NULL THEN 1 ELSE 0 END, r.place_open ASC`,
    [contestId],
  );

  return convertKeysToCamelCase(rows) as ExportResultRow[];
}

export async function loadTeamRows(db: Database, contestId: string): Promise<TeamResultRow[]> {
  const rows = await executeQuery(db, `SELECT${TEAM_COLUMNS}${RESULT_SOURCE} WHERE r.contest_id = ?`, [contestId]);

  return convertKeysToCamelCase(rows) as TeamResultRow[];
}

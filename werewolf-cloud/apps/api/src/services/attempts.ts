import type { Database } from '../utils/database';
import { executeQuery, executeQueryOne, convertKeysToCamelCase } from '../utils/database';
import { buildPlatePlan } from './plate-plan';

function parseLabelText(input: unknown): string[] {
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

export async function getAttemptWithRelations(
  db: Database,
  attemptId: string,
  contestId?: string
) {
  const params: (string)[] = contestId ? [attemptId, contestId] : [attemptId];
  const attempt = await executeQueryOne(
    db,
    `
      SELECT
        a.id,
        a.registration_id,
        a.lift_type,
        a.attempt_number,
        a.weight,
        a.status,
        a.timestamp,
        a.judge1_decision,
        a.judge2_decision,
        a.judge3_decision,
        a.notes,
        a.created_at,
        a.updated_at,
        r.contest_id,
        r.bodyweight,
        r.weight_class_id,
        r.age_category_id,
        r.rack_height_squat,
        r.rack_height_bench,
        r.flight_code,
        r.flight_order,
        COALESCE(r.labels, '[]') AS labels,
        comp.id AS competitor_id,
        comp.first_name,
        comp.last_name,
        comp.club,
        comp.city,
        comp.gender,
        comp.birth_date,
        wc.name AS weight_class_name,
        ac.name AS age_category_name
      FROM attempts a
      JOIN registrations r ON a.registration_id = r.id
      JOIN competitors comp ON r.competitor_id = comp.id
      LEFT JOIN contest_weight_classes wc ON r.weight_class_id = wc.id
      LEFT JOIN contest_age_categories ac ON r.age_category_id = ac.id
      WHERE a.id = ?
      ${contestId ? 'AND r.contest_id = ?' : ''}
    `,
    params
  );

  return attempt;
}

export async function buildCurrentAttemptPayload(
  db: Database,
  contestId: string,
  attemptId: string
) {
  const attempt = await getAttemptWithRelations(db, attemptId, contestId);
  if (!attempt) {
    return null;
  }

  const contest = await executeQueryOne(
    db,
    `
      SELECT
        id,
        name,
        date,
        location,
        discipline,
        status,
        bar_weight,
        mens_bar_weight,
        womens_bar_weight
      FROM contests
      WHERE id = ?
    `,
    [contestId]
  );

  if (!contest) {
    return null;
  }

  const registrationAttempts = await executeQuery(
    db,
    `
      SELECT
        id,
        lift_type,
        attempt_number,
        weight,
        status,
        updated_at,
        judge1_decision,
        judge2_decision,
        judge3_decision,
        notes
      FROM attempts
      WHERE registration_id = ?
      ORDER BY lift_type ASC, attempt_number ASC
    `,
    [attempt.registration_id]
  );

  const attemptsByLift: Record<string, any[]> = {
    Squat: [],
    Bench: [],
    Deadlift: [],
  };

  for (const row of registrationAttempts) {
    const target = attemptsByLift[row.lift_type] ?? (attemptsByLift[row.lift_type] = []);
    target.push({
      id: row.id,
      lift_type: row.lift_type,
      attempt_number: row.attempt_number,
      weight: row.weight,
      status: row.status,
      updated_at: row.updated_at,
      judge1_decision: row.judge1_decision,
      judge2_decision: row.judge2_decision,
      judge3_decision: row.judge3_decision,
      notes: row.notes,
    });
  }

  let platePlan = null;
  try {
    platePlan = await buildPlatePlan(db, contestId, Number(attempt.weight ?? 0), {
      gender: attempt.gender,
    });
  } catch (error) {
    console.error('Failed to build plate plan', { contestId, attemptId, error });
    platePlan = null;
  }

  const payload = {
    contest,
    attempt,
      registration: {
        id: attempt.registration_id,
        contest_id: attempt.contest_id,
        bodyweight: attempt.bodyweight,
        weight_class_id: attempt.weight_class_id,
        weight_class_name: attempt.weight_class_name,
        age_category_id: attempt.age_category_id,
        age_category_name: attempt.age_category_name,
        rack_height_squat: attempt.rack_height_squat,
        rack_height_bench: attempt.rack_height_bench,
        flight_code: attempt.flight_code,
        flight_order: attempt.flight_order,
      labels: parseLabelText(attempt.labels),
    },
    competitor: {
      id: attempt.competitor_id,
      first_name: attempt.first_name,
      last_name: attempt.last_name,
      club: attempt.club,
      city: attempt.city,
      gender: attempt.gender,
      birth_date: attempt.birth_date,
    },
    attempts_by_lift: attemptsByLift,
    plate_plan: platePlan,
    highlight: {
      lift_type: attempt.lift_type,
      attempt_number: attempt.attempt_number,
    },
  };

  return convertKeysToCamelCase(payload);
}

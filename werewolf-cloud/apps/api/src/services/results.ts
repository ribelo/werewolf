import type { D1Database } from '@cloudflare/workers-types';
import { executeMutation, executeQuery, executeQueryOne, generateId, getCurrentTimestamp } from '../utils/database';
import { MANDATORY_TAG_LABEL } from '../utils/tags';
import { compareResults, hasTag } from './results/ranking';
import { parseLabelText } from './results/rows';

export { compareResults, hasTag } from './results/ranking';
export { parseLabelText } from './results/rows';

function getLiftsForDiscipline(discipline: string): Array<'Squat' | 'Bench' | 'Deadlift'> {
  switch (discipline) {
    case 'Bench':
      return ['Bench'];
    case 'Squat':
      return ['Squat'];
    case 'Deadlift':
      return ['Deadlift'];
    case 'Powerlifting':
      return ['Squat', 'Bench', 'Deadlift'];
    default:
      return ['Squat', 'Bench', 'Deadlift'];
  }
}

export async function calculateRegistrationResults(db: D1Database, registrationId: string) {
  const registration = await executeQueryOne(
    db,
    `
    SELECT
      r.contest_id,
      r.reshel_coefficient,
      r.mccullough_coefficient,
      contest.discipline
    FROM registrations r
    JOIN competitors c ON r.competitor_id = c.id
    JOIN contests contest ON r.contest_id = contest.id
    WHERE r.id = ?
    `,
    [registrationId]
  );

  if (!registration) return;

  const existingResult = await executeQueryOne<{ id: string }>(
    db,
    'SELECT id FROM results WHERE registration_id = ? ORDER BY calculated_at DESC LIMIT 1',
    [registrationId]
  );
  const resultId = existingResult?.id ?? generateId();
  if (existingResult?.id) {
    await executeMutation(
      db,
      'DELETE FROM results WHERE registration_id = ? AND id != ?',
      [registrationId, existingResult.id]
    );
  }

  const bestAttempts = await executeQuery(
    db,
    `
    SELECT lift_type, MAX(weight) as best_weight
    FROM attempts
    WHERE registration_id = ? AND status = 'Successful'
    GROUP BY lift_type
    `,
    [registrationId]
  );

  const bestSquat = Number(bestAttempts.find((attempt) => attempt.lift_type === 'Squat')?.best_weight ?? 0) || 0;
  const bestBench = Number(bestAttempts.find((attempt) => attempt.lift_type === 'Bench')?.best_weight ?? 0) || 0;
  const bestDeadlift = Number(bestAttempts.find((attempt) => attempt.lift_type === 'Deadlift')?.best_weight ?? 0) || 0;

  const discipline = typeof registration.discipline === 'string' ? registration.discipline : 'Powerlifting';
  const liftsForTotals = getLiftsForDiscipline(discipline);

  const totalsByLift: Record<'Squat' | 'Bench' | 'Deadlift', number> = {
    Squat: bestSquat,
    Bench: bestBench,
    Deadlift: bestDeadlift,
  };

  const totalWeight = liftsForTotals.reduce((sum, lift) => sum + totalsByLift[lift], 0);

  const reshelCoefficient =
    registration.reshel_coefficient === null || registration.reshel_coefficient === undefined
      ? 1
      : Number(registration.reshel_coefficient);
  const mcCoefficient =
    registration.mccullough_coefficient === null || registration.mccullough_coefficient === undefined
      ? 1
      : Number(registration.mccullough_coefficient);

  const normalizedReshel = Number.isFinite(reshelCoefficient) ? reshelCoefficient : 1;
  const normalizedMc = Number.isFinite(mcCoefficient) ? mcCoefficient : 1;

  const squatPoints = bestSquat * normalizedReshel * normalizedMc;
  const benchPoints = bestBench * normalizedReshel * normalizedMc;
  const deadliftPoints = bestDeadlift * normalizedReshel * normalizedMc;

  const coefficientPoints = totalWeight * normalizedReshel * normalizedMc;

  const now = getCurrentTimestamp();

  // Upsert by id: INSERT OR REPLACE would delete the row first and silently
  // reset the disqualification, record and placement columns set elsewhere.
  await executeMutation(
    db,
    `
    INSERT INTO results (
      id, registration_id, contest_id,
      best_squat, best_bench, best_deadlift,
      total_weight, coefficient_points,
      squat_points, bench_points, deadlift_points,
      calculated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      registration_id = excluded.registration_id,
      contest_id = excluded.contest_id,
      best_squat = excluded.best_squat,
      best_bench = excluded.best_bench,
      best_deadlift = excluded.best_deadlift,
      total_weight = excluded.total_weight,
      coefficient_points = excluded.coefficient_points,
      squat_points = excluded.squat_points,
      bench_points = excluded.bench_points,
      deadlift_points = excluded.deadlift_points,
      calculated_at = excluded.calculated_at
    `,
    [
      resultId, registrationId, registration.contest_id,
      bestSquat, bestBench, bestDeadlift,
      totalWeight, coefficientPoints,
      squatPoints, benchPoints, deadliftPoints,
      now
    ]
  );
}

/**
 * D1 caps a statement at 100 bound parameters. One placement entry costs two
 * (id and value) plus one for the id list, so chunks stay well inside the cap
 * instead of inlining ids the way the old CASE builder did.
 */
const MAX_BOUND_PARAMS_PER_STATEMENT = 90;
const PLACEMENT_PARAMS_PER_ROW = 3;

async function applyPlacementChanges(
  db: D1Database,
  column: 'place_open' | 'place_in_age_class' | 'place_in_weight_class',
  changes: ReadonlyMap<string, number | null>,
): Promise<void> {
  const entries = Array.from(changes.entries());
  const chunkSize = Math.max(1, Math.floor(MAX_BOUND_PARAMS_PER_STATEMENT / PLACEMENT_PARAMS_PER_ROW));

  for (let start = 0; start < entries.length; start += chunkSize) {
    const chunk = entries.slice(start, start + chunkSize);
    const cases = chunk.map(() => 'WHEN ? THEN ?').join(' ');
    const idPlaceholders = chunk.map(() => '?').join(', ');
    const params: Array<string | number | null> = [];

    for (const [id, value] of chunk) {
      params.push(id, value);
    }
    for (const [id] of chunk) {
      params.push(id);
    }

    await executeMutation(
      db,
      `UPDATE results SET ${column} = CASE id ${cases} ELSE ${column} END WHERE id IN (${idPlaceholders})`,
      params
    );
  }
}

export async function updateAllRankings(db: D1Database, contestId: string) {
  const rows = await executeQuery(
    db,
    `
    SELECT
      r.id,
      r.registration_id,
      r.place_open,
      r.place_in_age_class,
      r.place_in_weight_class,
      r.total_weight,
      r.coefficient_points,
      r.squat_points, r.bench_points, r.deadlift_points,
      r.is_disqualified,
      reg.bodyweight,
      reg.age_category_id,
      reg.weight_class_id,
      COALESCE(reg.labels, '[]') AS labels
    FROM results r
    JOIN registrations reg ON r.registration_id = reg.id
    WHERE r.contest_id = ?
    `,
    [contestId]
  );

  const enriched = rows.map((row) => ({
    ...row,
    labels: parseLabelText(row.labels),
  }));

  const openCandidates = enriched.filter((row) => !row.is_disqualified && hasTag(row.labels, MANDATORY_TAG_LABEL));
  const sortedOpen = [...openCandidates].sort((a, b) => compareResults(
    { coefficientPoints: a.coefficient_points, totalWeight: a.total_weight, bodyweight: a.bodyweight, registrationId: a.registration_id },
    { coefficientPoints: b.coefficient_points, totalWeight: b.total_weight, bodyweight: b.bodyweight, registrationId: b.registration_id },
  ));

  const openPlacements = new Map<string, number>();
  sortedOpen.forEach((row, index) => {
    openPlacements.set(row.id, index + 1);
  });

  // Compute only-changed updates for place_open
  const openChanges = new Map<string, number | null>();
  for (const row of enriched) {
    const next = openPlacements.get(row.id) ?? null;
    const prev = (row.place_open ?? null) as number | null;
    if (prev !== next) {
      openChanges.set(row.id, next);
    }
  }

  const ageGroups = new Map<string | null, typeof enriched>();
  for (const row of openCandidates) {
    const key = row.age_category_id ?? null;
    const group = ageGroups.get(key);
    if (group) {
      group.push(row);
    } else {
      ageGroups.set(key, [row]);
    }
  }

  const agePlacementMap = new Map<string, number>();

  for (const [, group] of ageGroups.entries()) {
    const sortedGroup = [...group].sort((a, b) => compareResults(
      { coefficientPoints: a.coefficient_points, totalWeight: a.total_weight, bodyweight: a.bodyweight, registrationId: a.registration_id },
      { coefficientPoints: b.coefficient_points, totalWeight: b.total_weight, bodyweight: b.bodyweight, registrationId: b.registration_id },
    ));
    let rank = 1;
    for (const row of sortedGroup) {
      agePlacementMap.set(row.id, rank);
      rank += 1;
    }
  }

  // Compute only-changed updates for place_in_age_class
  const ageChanges = new Map<string, number | null>();
  for (const row of enriched) {
    const next = agePlacementMap.get(row.id) ?? null;
    const prev = (row.place_in_age_class ?? null) as number | null;
    if (prev !== next) {
      ageChanges.set(row.id, next);
    }
  }

  const weightGroups = new Map<string | null, typeof enriched>();
  for (const row of openCandidates) {
    const key = row.weight_class_id ?? null;
    const group = weightGroups.get(key);
    if (group) {
      group.push(row);
    } else {
      weightGroups.set(key, [row]);
    }
  }

  const weightPlacementMap = new Map<string, number>();

  for (const [, group] of weightGroups.entries()) {
    const sortedGroup = [...group].sort((a, b) => compareResults(
      { coefficientPoints: a.coefficient_points, totalWeight: a.total_weight, bodyweight: a.bodyweight, registrationId: a.registration_id },
      { coefficientPoints: b.coefficient_points, totalWeight: b.total_weight, bodyweight: b.bodyweight, registrationId: b.registration_id },
    ));
    let rank = 1;
    for (const row of sortedGroup) {
      weightPlacementMap.set(row.id, rank);
      rank += 1;
    }
  }

  // Compute only-changed updates for place_in_weight_class
  const weightChanges = new Map<string, number | null>();
  for (const row of enriched) {
    const next = weightPlacementMap.get(row.id) ?? null;
    const prev = (row.place_in_weight_class ?? null) as number | null;
    if (prev !== next) {
      weightChanges.set(row.id, next);
    }
  }

  // If nothing changed, skip write entirely
  if (openChanges.size === 0 && ageChanges.size === 0 && weightChanges.size === 0) {
    return;
  }

  await applyPlacementChanges(db, 'place_open', openChanges);
  await applyPlacementChanges(db, 'place_in_age_class', ageChanges);
  await applyPlacementChanges(db, 'place_in_weight_class', weightChanges);
}

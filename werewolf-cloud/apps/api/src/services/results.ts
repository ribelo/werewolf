import type { D1Database } from '@cloudflare/workers-types';
import { executeMutation, executeQuery, executeQueryOne, generateId, getCurrentTimestamp } from '../utils/database';
import { MANDATORY_TAG_LABEL } from '../utils/tags';

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

export function hasTag(labels: readonly string[], tag: string): boolean {
  if (tag === MANDATORY_TAG_LABEL) {
    return labels.length === 0 || labels.includes(tag);
  }
  return labels.includes(tag);
}

export function compareResults(
  a: { coefficientPoints?: number | null; totalWeight?: number | null; bodyweight?: number | null; registrationId?: string | null },
  b: { coefficientPoints?: number | null; totalWeight?: number | null; bodyweight?: number | null; registrationId?: string | null },
): number {
  const pointsA = Number(a.coefficientPoints ?? 0);
  const pointsB = Number(b.coefficientPoints ?? 0);
  if (pointsA !== pointsB) {
    return pointsB - pointsA;
  }

  const totalA = Number(a.totalWeight ?? 0);
  const totalB = Number(b.totalWeight ?? 0);
  if (totalA !== totalB) {
    return totalB - totalA;
  }

  const bodyA = Number(a.bodyweight ?? 0);
  const bodyB = Number(b.bodyweight ?? 0);
  if (bodyA !== bodyB) {
    return bodyA - bodyB;
  }

  const idA = a.registrationId ?? '';
  const idB = b.registrationId ?? '';
  return idA.localeCompare(idB);
}

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

  await executeMutation(
    db,
    `
    INSERT OR REPLACE INTO results (
      id, registration_id, contest_id,
      best_squat, best_bench, best_deadlift,
      total_weight, coefficient_points,
      squat_points, bench_points, deadlift_points,
      calculated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

// Helper to safely escape SQL identifiers (validates UUIDs)
function escapeId(id: unknown): string {
  const str = String(id);
  // Validate UUID format to prevent SQL injection
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)) {
    throw new Error(`Invalid ID format: ${str}`);
  }
  return str;
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

  const seenAgeIds = new Set<string>();
  const agePlacementMap = new Map<string, number>();

  for (const [, group] of ageGroups.entries()) {
    const sortedGroup = [...group].sort((a, b) => compareResults(
      { coefficientPoints: a.coefficient_points, totalWeight: a.total_weight, bodyweight: a.bodyweight, registrationId: a.registration_id },
      { coefficientPoints: b.coefficient_points, totalWeight: b.total_weight, bodyweight: b.bodyweight, registrationId: b.registration_id },
    ));
    let rank = 1;
    for (const row of sortedGroup) {
      agePlacementMap.set(row.id, rank);
      seenAgeIds.add(row.id);
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

  const seenWeightIds = new Set<string>();
  const weightPlacementMap = new Map<string, number>();

  for (const [, group] of weightGroups.entries()) {
    const sortedGroup = [...group].sort((a, b) => compareResults(
      { coefficientPoints: a.coefficient_points, totalWeight: a.total_weight, bodyweight: a.bodyweight, registrationId: a.registration_id },
      { coefficientPoints: b.coefficient_points, totalWeight: b.total_weight, bodyweight: b.bodyweight, registrationId: b.registration_id },
    ));
    let rank = 1;
    for (const row of sortedGroup) {
      weightPlacementMap.set(row.id, rank);
      seenWeightIds.add(row.id);
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

  // Build a single UPDATE with three CASE blocks; only include columns that changed.
  const allIds = new Set<string>();
  const openCases: string[] = [];
  const ageCases: string[] = [];
  const weightCases: string[] = [];

  for (const [id, value] of openChanges) {
    const safeId = escapeId(id);
    allIds.add(safeId);
    openCases.push(value === null ? `WHEN '${safeId}' THEN NULL` : `WHEN '${safeId}' THEN ${value}`);
  }
  for (const [id, value] of ageChanges) {
    const safeId = escapeId(id);
    allIds.add(safeId);
    ageCases.push(value === null ? `WHEN '${safeId}' THEN NULL` : `WHEN '${safeId}' THEN ${value}`);
  }
  for (const [id, value] of weightChanges) {
    const safeId = escapeId(id);
    allIds.add(safeId);
    weightCases.push(value === null ? `WHEN '${safeId}' THEN NULL` : `WHEN '${safeId}' THEN ${value}`);
  }

  const assignments: string[] = [];
  if (openCases.length > 0) {
    assignments.push(`place_open = CASE id ${openCases.join(' ')} ELSE place_open END`);
  }
  if (ageCases.length > 0) {
    assignments.push(`place_in_age_class = CASE id ${ageCases.join(' ')} ELSE place_in_age_class END`);
  }
  if (weightCases.length > 0) {
    assignments.push(`place_in_weight_class = CASE id ${weightCases.join(' ')} ELSE place_in_weight_class END`);
  }

  if (assignments.length === 0) {
    return;
  }

  const idList = Array.from(allIds).map((id) => `'${id}'`).join(', ');

  await executeMutation(
    db,
    `UPDATE results SET ${assignments.join(', ')} WHERE id IN (${idList})`,
    []
  );
}

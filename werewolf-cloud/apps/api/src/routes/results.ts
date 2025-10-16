import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { WerewolfEnvironment } from '../env';
import { executeQuery, executeQueryOne, executeMutation, generateId, getCurrentTimestamp, convertKeysToCamelCase } from '../utils/database';

export const contestResults = new Hono<WerewolfEnvironment>();

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

// POST /contests/:contestId/results/recalculate - Recalculate all results
contestResults.post('/recalculate', async (c) => {
  const db = c.env.DB;
  const contestId = c.req.param('contestId');

  if (!contestId) {
    return c.json({ data: null, error: 'Contest ID is required', requestId: c.get('requestId') }, 400);
  }

  // Get all registrations for the contest
  const registrations = await executeQuery(
    db,
    'SELECT id FROM registrations WHERE contest_id = ?',
    [contestId]
  );

  // Calculate results for each registration
  for (const reg of registrations) {
    await calculateRegistrationResults(db, reg.id);
  }

  // Update rankings for the entire contest
  await updateAllRankings(db, contestId);

  return c.json({
    data: { success: true },
    error: null,
    requestId: c.get('requestId'),
  });
});

// GET /contests/:contestId/results/rankings - Get rankings by type
contestResults.get('/rankings', zValidator('query', z.object({
  type: z.enum(['open', 'age', 'weight']).default('open'),
  label: z.string().trim().min(1).optional(),
})), async (c) => {
  const db = c.env.DB;
  const contestId = c.req.param('contestId');
  const { type, label } = c.req.valid('query');

  const labelMatch = label ? `%"${label}"%` : null;

  let rankings;

  switch (type) {
    case 'open':
      rankings = await executeQuery(
        db,
        `
        SELECT
          r.id, r.registration_id, r.contest_id,
          r.best_bench, r.best_squat, r.best_deadlift,
          r.total_weight, r.coefficient_points,
          r.place_open, r.place_in_age_class, r.place_in_weight_class,
          r.is_disqualified, r.disqualification_reason,
          r.broke_record, r.record_type, r.calculated_at,
          c.first_name, c.last_name,
          COALESCE(reg.labels, '[]') AS labels
        FROM results r
        JOIN registrations reg ON r.registration_id = reg.id
        JOIN competitors c ON reg.competitor_id = c.id
        WHERE r.contest_id = ?
        ${labelMatch ? "AND COALESCE(reg.labels, '[]') LIKE ?" : ''}
        ORDER BY r.place_open ASC
        `,
        labelMatch ? [contestId, labelMatch] : [contestId]
      );
      break;

    case 'age':
      rankings = await executeQuery(
        db,
        `
        SELECT
          r.id, r.registration_id, r.contest_id,
          r.best_bench, r.best_squat, r.best_deadlift,
          r.total_weight, r.coefficient_points,
          r.place_open, r.place_in_age_class, r.place_in_weight_class,
          r.is_disqualified, r.disqualification_reason,
          r.broke_record, r.record_type, r.calculated_at,
          c.first_name, c.last_name, ac.name as age_category,
          COALESCE(reg.labels, '[]') AS labels
        FROM results r
        JOIN registrations reg ON r.registration_id = reg.id
        JOIN competitors c ON reg.competitor_id = c.id
        JOIN contest_age_categories ac ON reg.age_category_id = ac.id
        WHERE r.contest_id = ?
        ${labelMatch ? "AND COALESCE(reg.labels, '[]') LIKE ?" : ''}
        ORDER BY ac.name ASC, r.place_in_age_class ASC
        `,
        labelMatch ? [contestId, labelMatch] : [contestId]
      );
      break;

    case 'weight':
      rankings = await executeQuery(
        db,
        `
        SELECT
          r.id, r.registration_id, r.contest_id,
          r.best_bench, r.best_squat, r.best_deadlift,
          r.total_weight, r.coefficient_points,
          r.place_open, r.place_in_age_class, r.place_in_weight_class,
          r.is_disqualified, r.disqualification_reason,
          r.broke_record, r.record_type, r.calculated_at,
          c.first_name, c.last_name, wc.name as weight_class,
          COALESCE(reg.labels, '[]') AS labels
        FROM results r
        JOIN registrations reg ON r.registration_id = reg.id
        JOIN competitors c ON reg.competitor_id = c.id
        JOIN contest_weight_classes wc ON reg.weight_class_id = wc.id
        WHERE r.contest_id = ?
        ${labelMatch ? "AND COALESCE(reg.labels, '[]') LIKE ?" : ''}
        ORDER BY wc.name ASC, r.place_in_weight_class ASC
        `,
        labelMatch ? [contestId, labelMatch] : [contestId]
      );
      break;
  }

  const camel = convertKeysToCamelCase(rankings) as any[];
  const enriched = camel.map((row) => ({
    ...row,
    labels: parseLabelText(row.labels),
  }));

  return c.json({
    data: enriched,
    error: null,
    requestId: c.get('requestId'),
  });
});

// POST /contests/:contestId/results/export - Export results
contestResults.post('/export', zValidator('json', z.object({
  format: z.enum(['csv', 'json']).default('csv'),
})), async (c) => {
  const db = c.env.DB;
  const contestId = c.req.param('contestId');
  const { format } = c.req.valid('json');

  const rankings = await executeQuery(
    db,
    `
    SELECT
      r.place_open, r.registration_id,
      r.best_squat, r.best_bench, r.best_deadlift,
      r.total_weight, r.coefficient_points,
      c.first_name, c.last_name
    FROM results r
    JOIN registrations reg ON r.registration_id = reg.id
    JOIN competitors c ON reg.competitor_id = c.id
    WHERE r.contest_id = ?
    ORDER BY r.place_open ASC
    `,
    [contestId]
  );

  if (format === 'csv') {
    const csv = exportToCsv(rankings);
    return c.text(csv, 200, { 'Content-Type': 'text/csv' });
  } else {
    return c.json({
      data: convertKeysToCamelCase(rankings),
      error: null,
      requestId: c.get('requestId'),
    });
  }
});

// GET /contests/:contestId/scoreboard - Get scoreboard data
contestResults.get('/scoreboard', async (c) => {
  const db = c.env.DB;
  const contestId = c.req.param('contestId');

  const rankings = await executeQuery(
    db,
    `
    SELECT
      r.id, r.registration_id, r.contest_id,
      r.best_bench, r.best_squat, r.best_deadlift,
      r.total_weight, r.coefficient_points,
      r.place_open, r.place_in_age_class, r.place_in_weight_class,
      r.is_disqualified, r.disqualification_reason,
      r.broke_record, r.record_type, r.calculated_at,
      c.first_name, c.last_name
    FROM results r
    JOIN registrations reg ON r.registration_id = reg.id
    JOIN competitors c ON reg.competitor_id = c.id
    WHERE r.contest_id = ?
    ORDER BY r.place_open ASC
    `,
    [contestId]
  );

  const contest = await executeQueryOne(
    db,
    'SELECT name FROM contests WHERE id = ?',
    [contestId]
  );

  const scoreboardData = {
    rankings,
    totalCompetitors: rankings.length,
    contestName: contest?.name || null,
    updatedAt: getCurrentTimestamp(),
  };

  return c.json({
    data: convertKeysToCamelCase(scoreboardData),
    error: null,
    requestId: c.get('requestId'),
  });
});

const results = new Hono<WerewolfEnvironment>();

// GET /registrations/:registrationId/results - Get competitor results
results.get('/:registrationId', async (c) => {
  const db = c.env.DB;
  const registrationId = c.req.param('registrationId');

  // Try to get existing result
  let result = await executeQueryOne(
    db,
    `
    SELECT
      id, registration_id, contest_id,
      best_bench, best_squat, best_deadlift,
      total_weight, coefficient_points,
      place_open, place_in_age_class, place_in_weight_class,
      is_disqualified, disqualification_reason,
      broke_record, record_type, calculated_at
    FROM results
    WHERE registration_id = ?
    `,
    [registrationId]
  );

  if (!result) {
    // Calculate result if it doesn't exist
    await calculateRegistrationResults(db, registrationId);
    result = await executeQueryOne(
      db,
      `
      SELECT
        id, registration_id, contest_id,
        best_bench, best_squat, best_deadlift,
        total_weight, coefficient_points,
        place_open, place_in_age_class, place_in_weight_class,
        is_disqualified, disqualification_reason,
        broke_record, record_type, calculated_at
      FROM results
      WHERE registration_id = ?
      `,
      [registrationId]
    );
  }

  if (!result) {
    return c.json({ data: null, error: 'Result not found', requestId: c.get('requestId') }, 404);
  }

  return c.json({
    data: convertKeysToCamelCase(result),
    error: null,
    requestId: c.get('requestId'),
  });
});

export default results;

// Helper functions

async function calculateRegistrationResults(db: D1Database, registrationId: string) {
  // Get registration details
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

  // Get best attempts for each lift
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

  const coefficientPoints = totalWeight * normalizedReshel * normalizedMc;

  const id = generateId();
  const now = getCurrentTimestamp();

  await executeMutation(
    db,
    `
    INSERT OR REPLACE INTO results (
      id, registration_id, contest_id,
      best_squat, best_bench, best_deadlift,
      total_weight, coefficient_points,
      calculated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      id, registrationId, registration.contest_id,
      bestSquat, bestBench, bestDeadlift,
      totalWeight, coefficientPoints, now
    ]
  );
}

async function updateAllRankings(db: D1Database, contestId: string) {
  // Update open rankings
  const openRankings = await executeQuery(
    db,
    `
    SELECT r.id, r.coefficient_points
    FROM results r
    JOIN registrations reg ON r.registration_id = reg.id
    WHERE r.contest_id = ? AND r.is_disqualified = false
    ORDER BY r.coefficient_points DESC, r.total_weight DESC, reg.bodyweight ASC, r.registration_id ASC
    `,
    [contestId]
  );

  for (let i = 0; i < openRankings.length; i++) {
    await executeMutation(
      db,
      'UPDATE results SET place_open = ? WHERE id = ?',
      [i + 1, openRankings[i].id]
    );
  }

  // Update age class rankings
  const ageCategories = await executeQuery(
    db,
    'SELECT DISTINCT age_category_id FROM registrations WHERE contest_id = ?',
    [contestId]
  );

  for (const category of ageCategories) {
    const ageRankings = await executeQuery(
      db,
      `
      SELECT r.id, r.coefficient_points
      FROM results r
      JOIN registrations reg ON r.registration_id = reg.id
      WHERE r.contest_id = ? AND reg.age_category_id = ? AND r.is_disqualified = false
      ORDER BY r.coefficient_points DESC, r.total_weight DESC, reg.bodyweight ASC, r.registration_id ASC
      `,
      [contestId, category.age_category_id]
    );

    for (let i = 0; i < ageRankings.length; i++) {
      await executeMutation(
        db,
        'UPDATE results SET place_in_age_class = ? WHERE id = ?',
        [i + 1, ageRankings[i].id]
      );
    }
  }

  // Update weight class rankings
  const weightClasses = await executeQuery(
    db,
    'SELECT DISTINCT weight_class_id FROM registrations WHERE contest_id = ?',
    [contestId]
  );

  for (const weightClass of weightClasses) {
    const weightRankings = await executeQuery(
      db,
      `
      SELECT r.id, r.coefficient_points
      FROM results r
      JOIN registrations reg ON r.registration_id = reg.id
      WHERE r.contest_id = ? AND reg.weight_class_id = ? AND r.is_disqualified = false
      ORDER BY r.coefficient_points DESC, r.total_weight DESC, reg.bodyweight ASC, r.registration_id ASC
      `,
      [contestId, weightClass.weight_class_id]
    );

    for (let i = 0; i < weightRankings.length; i++) {
      await executeMutation(
        db,
        'UPDATE results SET place_in_weight_class = ? WHERE id = ?',
        [i + 1, weightRankings[i].id]
      );
    }
  }
}

function exportToCsv(rankings: any[]): string {
  let csv = 'Place,Name,Best Squat,Best Bench,Best Deadlift,Total,Coefficient Points\n';

  for (const result of rankings) {
    csv += `${result.place_open || ''},${result.first_name} ${result.last_name},${result.best_squat || 0},${result.best_bench || 0},${result.best_deadlift || 0},${result.total_weight || 0},${result.coefficient_points || 0}\n`;
  }

  return csv;
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

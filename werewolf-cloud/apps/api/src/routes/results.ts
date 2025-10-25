import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { D1Database } from '@cloudflare/workers-types';
import type { WerewolfEnvironment } from '../env';
import { executeQuery, executeQueryOne, convertKeysToCamelCase, getCurrentTimestamp } from '../utils/database';
import { listContestTags, MANDATORY_TAG_LABEL } from '../utils/tags';
import { calculateRegistrationResults, updateAllRankings, parseLabelText, hasTag, compareResults } from '../services/results';

export const contestResults = new Hono<WerewolfEnvironment>();

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
  type: z.enum(['open', 'age', 'weight', 'tag']).default('open'),
  tag: z.string().trim().min(1).optional(),
  label: z.string().trim().min(1).optional(),
})), async (c) => {
  const db = c.env.DB;
  const contestId = c.req.param('contestId');
  const { type, tag, label } = c.req.valid('query');

  if (!contestId) {
    return c.json({ data: null, error: 'Contest ID is required', requestId: c.get('requestId') }, 400);
  }

  const requestedTag = tag ?? label ?? null;

  if (type === 'tag' && !requestedTag) {
    return c.json({ data: null, error: 'tag parameter is required for type=tag', requestId: c.get('requestId') }, 400);
  }

  if (requestedTag) {
    const tagRows = await listContestTags(db, contestId);
    const allowedTags = new Set(tagRows.map((row) => row.label));
    allowedTags.add(MANDATORY_TAG_LABEL);
    if (!allowedTags.has(requestedTag)) {
      return c.json({ data: null, error: 'Tag not configured for contest', requestId: c.get('requestId') }, 404);
    }
  }

  const rows = await executeQuery(
    db,
    `
    SELECT
      r.id, r.registration_id, r.contest_id,
      r.best_bench, r.best_squat, r.best_deadlift,
      r.total_weight, r.coefficient_points,
      r.squat_points, r.bench_points, r.deadlift_points,
      r.place_open, r.place_in_age_class, r.place_in_weight_class,
      r.is_disqualified, r.disqualification_reason,
      r.broke_record, r.record_type, r.calculated_at,
      c.first_name, c.last_name,
      ac.name AS age_category,
      wc.name AS weight_class,
      reg.bodyweight,
      COALESCE(reg.labels, '[]') AS labels
    FROM results r
    JOIN registrations reg ON r.registration_id = reg.id
    JOIN competitors c ON reg.competitor_id = c.id
    LEFT JOIN contest_age_categories ac ON reg.age_category_id = ac.id
    LEFT JOIN contest_weight_classes wc ON reg.weight_class_id = wc.id
    WHERE r.contest_id = ?
    `,
    [contestId]
  );

  const camel = convertKeysToCamelCase(rows) as any[];
  const enriched = camel.map((row) => ({
    ...row,
    labels: parseLabelText(row.labels),
  }));

  const notDisqualified = enriched.filter((row) => !row.isDisqualified);
  const filterTag = type === 'tag'
    ? requestedTag
    : requestedTag && requestedTag !== MANDATORY_TAG_LABEL
      ? requestedTag
      : null;

  const openCandidates = notDisqualified.filter((row) => hasTag(row.labels, MANDATORY_TAG_LABEL));
  const openFiltered = filterTag ? openCandidates.filter((row) => hasTag(row.labels, filterTag)) : openCandidates;
  const openSorted = [...openFiltered].sort((a, b) => {
    const placeA = a.placeOpen ?? 0;
    const placeB = b.placeOpen ?? 0;
    if (placeA && placeB && placeA !== placeB) {
      return placeA - placeB;
    }
    return compareResults(a, b);
  });

  let data: any[] = [];

  switch (type) {
    case 'open': {
      data = openSorted;
      break;
    }
    case 'age': {
      const ageGroups = new Map<string, any[]>();
      for (const row of openFiltered) {
        const key = row.ageCategory ?? 'Unassigned';
        const group = ageGroups.get(key) ?? [];
        group.push(row);
        ageGroups.set(key, group);
      }

      const sortedKeys = Array.from(ageGroups.keys()).sort((a, b) => a.localeCompare(b));
      const ageResults: any[] = [];
      for (const key of sortedKeys) {
        const group = ageGroups.get(key) ?? [];
        const sortedGroup = [...group].sort((a, b) => {
          const placeA = a.placeInAgeClass ?? 0;
          const placeB = b.placeInAgeClass ?? 0;
          if (placeA && placeB && placeA !== placeB) {
            return placeA - placeB;
          }
          return compareResults(a, b);
        });
        ageResults.push(...sortedGroup);
      }
      data = ageResults;
      break;
    }
    case 'weight': {
      const weightGroups = new Map<string, any[]>();
      for (const row of openFiltered) {
        const key = row.weightClass ?? 'Unassigned';
        const group = weightGroups.get(key) ?? [];
        group.push(row);
        weightGroups.set(key, group);
      }

      const sortedKeys = Array.from(weightGroups.keys()).sort((a, b) => a.localeCompare(b));
      const weightResults: any[] = [];
      for (const key of sortedKeys) {
        const group = weightGroups.get(key) ?? [];
        const sortedGroup = [...group].sort((a, b) => {
          const placeA = a.placeInWeightClass ?? 0;
          const placeB = b.placeInWeightClass ?? 0;
          if (placeA && placeB && placeA !== placeB) {
            return placeA - placeB;
          }
          return compareResults(a, b);
        });
        weightResults.push(...sortedGroup);
      }
      data = weightResults;
      break;
    }
    case 'tag': {
      const targetTag = requestedTag!;
      const tagged = notDisqualified.filter((row) => hasTag(row.labels, targetTag));
      const sortedTagged = [...tagged].sort(compareResults);
      data = sortedTagged.map((row, index) => ({
        ...row,
        placeOpen: index + 1,
      }));
      break;
    }
  }

  return c.json({
    data,
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
      r.squat_points, r.bench_points, r.deadlift_points,
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
      r.squat_points, r.bench_points, r.deadlift_points,
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
      squat_points, bench_points, deadlift_points,
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
        squat_points, bench_points, deadlift_points,
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

function exportToCsv(rankings: any[]): string {
  let csv = 'Place,Name,Best Squat,Best Bench,Best Deadlift,Total,Squat Points,Bench Points,Deadlift Points,Coefficient Points\n';

  for (const result of rankings) {
    csv += `${result.place_open || ''},${result.first_name} ${result.last_name},${result.best_squat || 0},${result.best_bench || 0},${result.best_deadlift || 0},${result.total_weight || 0},${result.squat_points || 0},${result.bench_points || 0},${result.deadlift_points || 0},${result.coefficient_points || 0}\n`;
  }

  return csv;
}

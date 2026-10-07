import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { WerewolfEnvironment } from '../env';
import { executeQuery, executeQueryOne, convertKeysToCamelCase, getCurrentTimestamp } from '../utils/database';
import { listContestAgeCategories, listContestWeightClasses } from '../utils/category-templates';
import { listContestTags, MANDATORY_TAG_LABEL } from '../utils/tags';
import { calculateRegistrationResults, updateAllRankings } from '../services/results';
import { computeTeamResults } from '@werewolf/domain/services/team-results';
import { getJson, putJson, invalidateResultsCache, publicResultsCacheKey } from '../utils/cache';
import { selectContestRegistrations } from '../services/registrations/reader';
import { loadExportRows, loadRankingRows, loadTeamRows } from '../services/results/rows';
import { buildIndividualRankings, buildTagRankings, toTeamResultInputs } from '../services/results/ranking';
import {
  buildAttemptLookup,
  buildSingleLiftExportRows,
  exportLegacyResultsCsv,
  resolveSingleLiftExportConfig,
  serialiseSingleLiftCsv,
  type AttemptExportRow,
} from '../services/results/csv';

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

  // Drop the cached rankings variants together with the public snapshot.
  await invalidateResultsCache(c.env.KV, contestId);

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

  if (requestedTag) {
    const tagRows = await listContestTags(db, contestId);
    const allowedTags = new Set(tagRows.map((row) => row.label));
    allowedTags.add(MANDATORY_TAG_LABEL);
    if (!allowedTags.has(requestedTag)) {
      return c.json({ data: null, error: 'Tag not configured for contest', requestId: c.get('requestId') }, 404);
    }
  }

  // Live rankings are never cached: an attempt changes them within seconds and
  // one shared entry would serve the previous tag filter to the next request.
  const rows = await loadRankingRows(db, contestId);

  if (type === 'tag') {
    if (!requestedTag) {
      return c.json({ data: null, error: 'tag parameter is required for type=tag', requestId: c.get('requestId') }, 400);
    }

    return c.json({
      data: buildTagRankings(rows, requestedTag),
      error: null,
      requestId: c.get('requestId'),
    });
  }

  const filterTag = requestedTag && requestedTag !== MANDATORY_TAG_LABEL ? requestedTag : null;
  const rankings = buildIndividualRankings(rows, { tag: filterTag });
  const data = type === 'open' ? rankings.open : type === 'age' ? rankings.age : rankings.weight;

  return c.json({ data, error: null, requestId: c.get('requestId') });
});

// GET /contests/:contestId/results/rankings/all - Get open, age, and weight in one call
contestResults.get('/rankings/all', async (c) => {
  const db = c.env.DB;
  const contestId = c.req.param('contestId');

  if (!contestId) {
    return c.json({ data: null, error: 'Contest ID is required', requestId: c.get('requestId') }, 400);
  }

  // Live bundle: always recomputed, never served from KV.
  const rows = await loadRankingRows(db, contestId);
  const bundle = buildIndividualRankings(rows);

  return c.json({ data: bundle, error: null, requestId: c.get('requestId') });
});

contestResults.get('/team', async (c) => {
  const db = c.env.DB;
  const contestId = c.req.param('contestId');

  if (!contestId) {
    return c.json({ data: null, error: 'Contest ID is required', requestId: c.get('requestId') }, 400);
  }

  const rows = await loadTeamRows(db, contestId);
  const teamResults = computeTeamResults(toTeamResultInputs(rows));

  return c.json({
    data: teamResults,
    error: null,
    requestId: c.get('requestId'),
  });
});

// POST /contests/:contestId/results/export - Export results
contestResults.post('/export', zValidator('json', z.object({
  format: z.enum(['csv', 'json']).default('csv'),
  lift: z.enum(['Bench', 'Deadlift', 'Squat']).optional(),
})), async (c) => {
  const db = c.env.DB;
  const contestId = c.req.param('contestId');
  const { format, lift } = c.req.valid('json');

  if (!contestId) {
    return c.json({ data: null, error: 'Contest ID is required', requestId: c.get('requestId') }, 400);
  }

  const contest = await executeQueryOne<{
    id: string;
    name: string;
    discipline: string | null;
    date: string | null;
  }>(
    db,
    'SELECT id, name, discipline, date FROM contests WHERE id = ?',
    [contestId]
  );

  if (!contest) {
    return c.json({ data: null, error: 'Contest not found', requestId: c.get('requestId') }, 404);
  }

  const rows = await loadExportRows(db, contestId);
  const singleLiftConfig = resolveSingleLiftExportConfig(lift ?? contest.discipline);

  if (singleLiftConfig) {
    const attemptRows = await executeQuery(
      db,
      `
      SELECT a.registration_id, a.attempt_number, a.weight, a.status
      FROM attempts a
      JOIN registrations reg ON a.registration_id = reg.id
      WHERE reg.contest_id = ? AND a.lift_type = ?
      ORDER BY a.registration_id, a.attempt_number ASC
      `,
      [contestId, singleLiftConfig.liftType]
    );

    const attemptLookup = buildAttemptLookup(convertKeysToCamelCase(attemptRows) as AttemptExportRow[]);
    const exportRows = buildSingleLiftExportRows({
      rows,
      attemptsByRegistration: attemptLookup,
      contestDate: contest.date,
      config: singleLiftConfig,
    });

    if (format === 'csv') {
      const csv = serialiseSingleLiftCsv(exportRows, singleLiftConfig);
      return c.text(csv, 200, { 'Content-Type': 'text/csv' });
    }

    return c.json({ data: exportRows, error: null, requestId: c.get('requestId') });
  }

  if (format === 'csv') {
    const csv = exportLegacyResultsCsv(rows);
    return c.text(csv, 200, { 'Content-Type': 'text/csv' });
  }

  return c.json({ data: rows, error: null, requestId: c.get('requestId') });
});

// GET /contests/:contestId/results/public-bundle - Get bundled data for public results page
contestResults.get('/public-bundle', async (c) => {
  const db = c.env.DB;
  const contestId = c.req.param('contestId');

  if (!contestId) {
    return c.json({ data: null, error: 'Contest ID is required', requestId: c.get('requestId') }, 400);
  }

  try {
    // Public pages tolerate a short staleness window, so this payload is the
    // one results view that is cached.
    const publicBundleKey = publicResultsCacheKey(contestId);
    const cached = await getJson<{
      contest: Record<string, unknown>;
      individual: { open: unknown[]; age: unknown[]; weight: unknown[] };
      team: unknown[];
      scoreboard: {
        registrations: unknown[];
        attempts: unknown[];
        referenceData: { weightClasses: unknown[]; ageCategories: unknown[] };
      };
      lastUpdated: string;
    }>(c.env.KV, publicBundleKey);
    if (cached) {
      return c.json({ data: cached, error: null, requestId: c.get('requestId') });
    }

    // Get contest basic info
    const contest = await executeQueryOne(
      db,
      `
      SELECT
        id, name, date, location, discipline, status,
        competition_type, organizer, notes, federation_rules,
        created_at, updated_at
      FROM contests
      WHERE id = ?
      `,
      [contestId]
    );

    if (!contest) {
      return c.json({ data: null, error: 'Contest not found', requestId: c.get('requestId') }, 404);
    }

    const [registrations, attemptRows, ageCategoriesRaw, weightClassesRaw] = await Promise.all([
      selectContestRegistrations(db, contestId),
      executeQuery(
        db,
        `
        SELECT
          a.id, a.registration_id, a.lift_type, a.attempt_number, a.weight,
          a.status, a.timestamp, a.judge1_decision, a.judge2_decision, a.judge3_decision,
          a.notes, a.created_at, a.updated_at,
          comp.first_name, comp.last_name,
          comp.first_name || ' ' || comp.last_name AS competitor_name
        FROM attempts a
        JOIN registrations r ON a.registration_id = r.id
        JOIN competitors comp ON r.competitor_id = comp.id
        WHERE r.contest_id = ?
        ORDER BY comp.last_name ASC, comp.first_name ASC,
          a.lift_type ASC, a.attempt_number ASC
        `,
        [contestId]
      ),
      listContestAgeCategories(db, contestId),
      listContestWeightClasses(db, contestId),
    ]);

    const attempts = convertKeysToCamelCase(attemptRows);
    const referenceData = {
      ageCategories: convertKeysToCamelCase(ageCategoriesRaw),
      weightClasses: convertKeysToCamelCase(weightClassesRaw),
    };

    const resultRows = await loadRankingRows(db, contestId);
    const teamRows = await loadTeamRows(db, contestId);
    const teamResults = computeTeamResults(toTeamResultInputs(teamRows));

    // Assemble the public bundle
    const publicBundle = {
      contest: convertKeysToCamelCase(contest),
      individual: buildIndividualRankings(resultRows),
      team: teamResults,
      scoreboard: {
        registrations,
        attempts,
        referenceData,
      },
      lastUpdated: getCurrentTimestamp(),
    };

    await putJson(c.env.KV, publicBundleKey, publicBundle, 60);

    return c.json({ data: publicBundle, error: null, requestId: c.get('requestId') });
  } catch (error) {
    console.error('Error in public-bundle endpoint:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return c.json({ data: null, error: errorMessage, requestId: c.get('requestId') }, 500);
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

  const result = await executeQueryOne(
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
    // Results are written by the attempt and registration flows; a read never
    // recalculates or persists.
    return c.json({ data: null, error: 'Result not found', requestId: c.get('requestId') }, 404);
  }

  return c.json({
    data: convertKeysToCamelCase(result),
    error: null,
    requestId: c.get('requestId'),
  });
});

export default results;

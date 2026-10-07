import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { D1Database } from '@cloudflare/workers-types';
import type { WerewolfEnvironment } from '../env';
import { executeQuery, executeQueryOne, convertKeysToCamelCase, getCurrentTimestamp } from '../utils/database';
import { listContestAgeCategories, listContestWeightClasses, seedContestCategories } from '../utils/category-templates';
import { listContestTags, MANDATORY_TAG_LABEL } from '../utils/tags';
import { calculateRegistrationResults, updateAllRankings, parseLabelText, hasTag, compareResults } from '../services/results';
import { computeTeamResults, type TeamResultInput } from '@werewolf/domain/services/team-results';
import { getJson, putJson, invalidatePrefix, rankingsCacheKey, rankingsBundlePrefix } from '../utils/cache';
import { mapRegistrationRow } from '../utils/registration-map';

export const contestResults = new Hono<WerewolfEnvironment>();

const REGISTRATION_LIFTS_JSON = `
      (
        SELECT json_group_array(lift_type)
        FROM (
          SELECT lift_type
          FROM registration_lifts rl
          WHERE rl.registration_id = r.id
          ORDER BY
            CASE rl.lift_type
              WHEN 'Squat' THEN 1
              WHEN 'Bench' THEN 2
              WHEN 'Deadlift' THEN 3
            END
        )
      ) AS lifts
`;

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

  // Invalidate rankings caches for this contest
  await invalidatePrefix(c.env.KV, rankingsBundlePrefix(contestId));

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

  const cacheVariant = (() => {
    if (type === 'tag') {
      const t = tag ?? label ?? '';
      return `tag:${t}`;
    }
    return type;
  })();

  // Try cache first (only for non-empty contestId)
  const cacheKey = rankingsCacheKey(contestId, cacheVariant);
  const cached = await getJson<any[]>(c.env.KV, cacheKey);
  if (cached) {
    return c.json({ data: cached, error: null, requestId: c.get('requestId') });
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
      c.gender,
      c.club,
      reg.competitor_id,
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

  // Put into KV with a tiny TTL to reduce hot-path pressure
  await putJson(c.env.KV, cacheKey, data, 2);

  return c.json({ data, error: null, requestId: c.get('requestId') });
});

// GET /contests/:contestId/results/rankings/all - Get open, age, and weight in one call
contestResults.get('/rankings/all', async (c) => {
  const db = c.env.DB;
  const contestId = c.req.param('contestId');

  if (!contestId) {
    return c.json({ data: null, error: 'Contest ID is required', requestId: c.get('requestId') }, 400);
  }

  // Try KV cache for bundle
  const bundleKey = rankingsCacheKey(contestId, 'bundle');
  const cached = await getJson<{ open: any[]; age: any[]; weight: any[] }>(c.env.KV, bundleKey);
  if (cached) {
    return c.json({ data: cached, error: null, requestId: c.get('requestId') });
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
      c.gender,
      c.club,
      reg.competitor_id,
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
  const openCandidates = notDisqualified.filter((row) => hasTag(row.labels, MANDATORY_TAG_LABEL));
  const openSorted = [...openCandidates].sort((a, b) => {
    const placeA = a.placeOpen ?? 0;
    const placeB = b.placeOpen ?? 0;
    if (placeA && placeB && placeA !== placeB) {
      return placeA - placeB;
    }
    return compareResults(a, b);
  });

  const ageGroups = new Map<string, any[]>();
  for (const row of openCandidates) {
    const key = row.ageCategory ?? 'Unassigned';
    const group = ageGroups.get(key) ?? [];
    group.push(row);
    ageGroups.set(key, group);
  }
  const ageKeys = Array.from(ageGroups.keys()).sort((a, b) => a.localeCompare(b));
  const ageResults: any[] = [];
  for (const key of ageKeys) {
    const group = ageGroups.get(key) ?? [];
    const sortedGroup = [...group].sort((a, b) => {
      const placeA = a.placeInAgeClass ?? 0;
      const placeB = b.placeInAgeClass ?? 0;
      if (placeA && placeB && placeA !== placeB) return placeA - placeB;
      return compareResults(a, b);
    });
    ageResults.push(...sortedGroup);
  }

  const weightGroups = new Map<string, any[]>();
  for (const row of openCandidates) {
    const key = row.weightClass ?? 'Unassigned';
    const group = weightGroups.get(key) ?? [];
    group.push(row);
    weightGroups.set(key, group);
  }
  const weightKeys = Array.from(weightGroups.keys()).sort((a, b) => a.localeCompare(b));
  const weightResults: any[] = [];
  for (const key of weightKeys) {
    const group = weightGroups.get(key) ?? [];
    const sortedGroup = [...group].sort((a, b) => {
      const placeA = a.placeInWeightClass ?? 0;
      const placeB = b.placeInWeightClass ?? 0;
      if (placeA && placeB && placeA !== placeB) return placeA - placeB;
      return compareResults(a, b);
    });
    weightResults.push(...sortedGroup);
  }

  const bundle = {
    open: openSorted,
    age: ageResults,
    weight: weightResults,
  };

  await putJson(c.env.KV, bundleKey, bundle, 2);
  return c.json({ data: bundle, error: null, requestId: c.get('requestId') });
});

contestResults.get('/team', async (c) => {
  const db = c.env.DB;
  const contestId = c.req.param('contestId');

  if (!contestId) {
    return c.json({ data: null, error: 'Contest ID is required', requestId: c.get('requestId') }, 400);
  }

  const rows = await executeQuery(
    db,
    `
    SELECT
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
    FROM results r
    JOIN registrations reg ON r.registration_id = reg.id
    JOIN competitors c ON reg.competitor_id = c.id
    JOIN contests contest ON reg.contest_id = contest.id
    LEFT JOIN contest_age_categories ac ON reg.age_category_id = ac.id
    LEFT JOIN contest_weight_classes wc ON reg.weight_class_id = wc.id
    WHERE r.contest_id = ?
    `,
    [contestId]
  );

  const camel = convertKeysToCamelCase(rows) as Array<{
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
    birthDate: string;
    contestDate: string;
    club: string | null;
    ageCategory: string | null;
    weightClass: string | null;
  }>;

  const inputs: TeamResultInput[] = [];

  function calculateAgeOnDate(birthDate: string | null | undefined, contestDate: string | null | undefined): number | null {
    if (!birthDate || !contestDate) return null;
    const b = new Date(birthDate);
    const c = new Date(contestDate);
    if (Number.isNaN(b.getTime()) || Number.isNaN(c.getTime())) return null;
    let age = c.getFullYear() - b.getFullYear();
    const m = c.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && c.getDate() < b.getDate())) {
      age -= 1;
    }
    return age;
  }

  for (const row of camel) {
    if (row.gender !== 'Male' && row.gender !== 'Female') {
      continue;
    }

    inputs.push({
      registrationId: row.registrationId,
      competitorId: row.competitorId,
      firstName: row.firstName,
      lastName: row.lastName,
      gender: row.gender,
      club: row.club,
      coefficientPoints: row.coefficientPoints,
      squatPoints: row.squatPoints,
      benchPoints: row.benchPoints,
      deadliftPoints: row.deadliftPoints,
      bestSquat: row.bestSquat,
      bestBench: row.bestBench,
      bestDeadlift: row.bestDeadlift,
      totalWeight: row.totalWeight,
      bodyweight: row.bodyweight,
      ageCategory: row.ageCategory,
      weightClass: row.weightClass,
      ageYears: calculateAgeOnDate(row.birthDate, row.contestDate),
      reshelCoefficient: row.reshelCoefficient,
      mcculloughCoefficient: row.mcculloughCoefficient,
      isDisqualified: Boolean(row.isDisqualified),
    });
  }

  const teamResults = computeTeamResults(inputs);

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

  const contest = await executeQueryOne(
    db,
    'SELECT id, name, discipline, date, competition_type FROM contests WHERE id = ?',
    [contestId]
  );

  if (!contest) {
    return c.json({ data: null, error: 'Contest not found', requestId: c.get('requestId') }, 404);
  }

  const rankings = await executeQuery(
    db,
    `
    SELECT
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
      COALESCE(reg.labels, '[]') AS labels,
      ac.name AS age_category,
      ac.min_age AS age_min,
      ac.max_age AS age_max,
      wc.name AS weight_class
    FROM results r
    JOIN registrations reg ON r.registration_id = reg.id
    JOIN competitors c ON reg.competitor_id = c.id
    LEFT JOIN contest_age_categories ac ON reg.age_category_id = ac.id
    LEFT JOIN contest_weight_classes wc ON reg.weight_class_id = wc.id
    WHERE r.contest_id = ?
    ORDER BY CASE WHEN r.place_open IS NULL THEN 1 ELSE 0 END, r.place_open ASC
    `,
    [contestId]
  );

  const requestedLift = lift ?? null;
  const singleLiftConfig = resolveSingleLiftExportConfig(requestedLift ?? contest.discipline);

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

    const normalisedRows = (convertKeysToCamelCase(rankings) as RawContestResultRow[]).map((row) => ({
      ...row,
      labels: parseLabelText(row.labels),
    }));

    const attemptLookup = buildAttemptLookup(convertKeysToCamelCase(attemptRows) as AttemptExportRow[]);
    const exportRows = buildSingleLiftExportRows({
      rows: normalisedRows,
      attemptsByRegistration: attemptLookup,
      contestDate: contest.date,
      contestType: contest.competition_type,
      config: singleLiftConfig,
    });

    if (format === 'csv') {
      const csv = serialiseSingleLiftCsv(exportRows, singleLiftConfig);
      return c.text(csv, 200, { 'Content-Type': 'text/csv' });
    }

    return c.json({ data: exportRows, error: null, requestId: c.get('requestId') });
  }

  if (format === 'csv') {
    const csv = exportLegacyResultsCsv(rankings);
    return c.text(csv, 200, { 'Content-Type': 'text/csv' });
  }

  return c.json({ data: convertKeysToCamelCase(rankings), error: null, requestId: c.get('requestId') });
});

// GET /contests/:contestId/results/public-bundle - Get bundled data for public results page
contestResults.get('/public-bundle', async (c) => {
  const db = c.env.DB;
  const contestId = c.req.param('contestId');

  if (!contestId) {
    return c.json({ data: null, error: 'Contest ID is required', requestId: c.get('requestId') }, 400);
  }

  try {
    // Try KV cache for public bundle (longer TTL for public access)
    const publicBundleKey = `public-results:${contestId}`;
    const cached = await getJson<{
      contest: any;
      individual: { open: any[]; age: any[]; weight: any[] };
      team: any[];
      scoreboard: {
        registrations: any[];
        attempts: any[];
        referenceData: { weightClasses: any[]; ageCategories: any[] };
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

  await seedContestCategories(db, contestId);

  const [registrationRows, attemptRows, ageCategoriesRaw, weightClassesRaw] = await Promise.all([
    executeQuery(
      db,
      `
      SELECT
        r.id, r.contest_id, r.competitor_id, r.age_category_id, r.weight_class_id,
        r.bodyweight, r.reshel_coefficient, r.mccullough_coefficient,
        r.rack_height_squat, r.rack_height_bench, r.created_at,
        r.flight_code, r.flight_order, COALESCE(r.labels, '[]') AS labels,
        ${REGISTRATION_LIFTS_JSON},
        c.first_name, c.last_name, c.gender, c.club, c.city, c.birth_date,
        cac.name AS age_category_name,
        cwc.name AS weight_class_name
      FROM registrations r
      JOIN competitors c ON r.competitor_id = c.id
      LEFT JOIN contest_age_categories cac ON r.age_category_id = cac.id
      LEFT JOIN contest_weight_classes cwc ON r.weight_class_id = cwc.id
      WHERE r.contest_id = ?
      ORDER BY
        CASE WHEN r.flight_code IS NULL THEN 1 ELSE 0 END,
        r.flight_code ASC,
        COALESCE(r.flight_order, 0) ASC,
        cac.sort_order ASC,
        cwc.sort_order ASC,
        c.last_name ASC,
        c.first_name ASC
      `,
      [contestId]
    ),
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

  const registrationsCamel = convertKeysToCamelCase(registrationRows) as any[];
  const registrations = registrationsCamel.map((row) => mapRegistrationRow(row));
  const attempts = convertKeysToCamelCase(attemptRows);
  const referenceData = {
    ageCategories: convertKeysToCamelCase(ageCategoriesRaw),
    weightClasses: convertKeysToCamelCase(weightClassesRaw),
  };

  // Get all individual results data (reuse existing bundle logic but with public cache)
  const bundleRows = await executeQuery(
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
      c.gender,
      c.club,
      reg.competitor_id,
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

  const camel = convertKeysToCamelCase(bundleRows) as any[];
  const enriched = camel.map((row) => ({
    ...row,
    labels: parseLabelText(row.labels),
  }));

  const notDisqualified = enriched.filter((row) => !row.isDisqualified);
  const openCandidates = notDisqualified.filter((row) => hasTag(row.labels, MANDATORY_TAG_LABEL));

  // Open results
  const openSorted = [...openCandidates].sort((a, b) => {
    const placeA = a.placeOpen ?? 0;
    const placeB = b.placeOpen ?? 0;
    if (placeA && placeB && placeA !== placeB) {
      return placeA - placeB;
    }
    return compareResults(a, b);
  });

  // Age results
  const ageGroups = new Map<string, any[]>();
  for (const row of openCandidates) {
    const key = row.ageCategory ?? 'Unassigned';
    const group = ageGroups.get(key) ?? [];
    group.push(row);
    ageGroups.set(key, group);
  }
  const ageKeys = Array.from(ageGroups.keys()).sort((a, b) => a.localeCompare(b));
  const ageResults: any[] = [];
  for (const key of ageKeys) {
    const group = ageGroups.get(key) ?? [];
    const sortedGroup = [...group].sort((a, b) => {
      const placeA = a.placeInAgeClass ?? 0;
      const placeB = b.placeInAgeClass ?? 0;
      if (placeA && placeB && placeA !== placeB) return placeA - placeB;
      return compareResults(a, b);
    });
    ageResults.push(...sortedGroup);
  }

  // Weight results
  const weightGroups = new Map<string, any[]>();
  for (const row of openCandidates) {
    const key = row.weightClass ?? 'Unassigned';
    const group = weightGroups.get(key) ?? [];
    group.push(row);
    weightGroups.set(key, group);
  }
  const weightKeys = Array.from(weightGroups.keys()).sort((a, b) => a.localeCompare(b));
  const weightResults: any[] = [];
  for (const key of weightKeys) {
    const group = weightGroups.get(key) ?? [];
    const sortedGroup = [...group].sort((a, b) => {
      const placeA = a.placeInWeightClass ?? 0;
      const placeB = b.placeInWeightClass ?? 0;
      if (placeA && placeB && placeA !== placeB) return placeA - placeB;
      return compareResults(a, b);
    });
    weightResults.push(...sortedGroup);
  }

  // Get team results
  const teamRows = await executeQuery(
    db,
    `
    SELECT
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
    FROM results r
    JOIN registrations reg ON r.registration_id = reg.id
    JOIN competitors c ON reg.competitor_id = c.id
    JOIN contests contest ON reg.contest_id = contest.id
    LEFT JOIN contest_age_categories ac ON reg.age_category_id = ac.id
    LEFT JOIN contest_weight_classes wc ON reg.weight_class_id = wc.id
    WHERE r.contest_id = ?
    `,
    [contestId]
  );

  const teamCamel = convertKeysToCamelCase(teamRows) as Array<{
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
    birthDate: string;
    contestDate: string;
    club: string | null;
    ageCategory: string | null;
    weightClass: string | null;
  }>;

  const teamInputs: TeamResultInput[] = [];

  function calculateAgeOnDate(birthDate: string | null | undefined, contestDate: string | null | undefined): number | null {
    if (!birthDate || !contestDate) return null;
    const b = new Date(birthDate);
    const c = new Date(contestDate);
    if (Number.isNaN(b.getTime()) || Number.isNaN(c.getTime())) return null;
    let age = c.getFullYear() - b.getFullYear();
    const m = c.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && c.getDate() < b.getDate())) {
      age -= 1;
    }
    return age;
  }

  for (const row of teamCamel) {
    if (row.gender !== 'Male' && row.gender !== 'Female') {
      continue;
    }

    teamInputs.push({
      registrationId: row.registrationId,
      competitorId: row.competitorId,
      firstName: row.firstName,
      lastName: row.lastName,
      gender: row.gender,
      club: row.club,
      coefficientPoints: row.coefficientPoints,
      squatPoints: row.squatPoints,
      benchPoints: row.benchPoints,
      deadliftPoints: row.deadliftPoints,
      bestSquat: row.bestSquat,
      bestBench: row.bestBench,
      bestDeadlift: row.bestDeadlift,
      totalWeight: row.totalWeight,
      bodyweight: row.bodyweight,
      ageCategory: row.ageCategory,
      weightClass: row.weightClass,
      ageYears: calculateAgeOnDate(row.birthDate, row.contestDate),
      reshelCoefficient: row.reshelCoefficient,
      mcculloughCoefficient: row.mcculloughCoefficient,
      isDisqualified: Boolean(row.isDisqualified),
    });
  }

  const teamResults = computeTeamResults(teamInputs);

  // Assemble the public bundle
  const publicBundle = {
    contest: convertKeysToCamelCase(contest),
    individual: {
      open: openSorted,
      age: ageResults,
      weight: weightResults,
    },
    team: teamResults,
    scoreboard: {
      registrations,
      attempts,
      referenceData,
    },
    lastUpdated: getCurrentTimestamp(),
  };

  // Cache with 10-second TTL for public pages (longer than 2s for admin)
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

type ContestResultExportRow = {
  registrationId: string;
  placeOpen: number | null;
  bestSquat: number | null;
  bestBench: number | null;
  bestDeadlift: number | null;
  totalWeight: number | null;
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
  ageCategory: string | null;
  ageMin: number | null;
  ageMax: number | null;
  weightClass: string | null;
  gender: string | null;
  labels: string[];
};

type RawContestResultRow = Omit<ContestResultExportRow, 'labels'> & { labels: unknown };

type AttemptExportRow = {
  registrationId: string;
  attemptNumber: number;
  weight: number | null;
  status: string | null;
};

type SingleLiftExportConfig = {
  liftType: 'Bench' | 'Deadlift' | 'Squat';
  prefix: 'BP' | 'DL' | 'SQ';
};

type SingleLiftExportRow = Record<string, string>;

type SingleLiftExportEntry = {
  row: SingleLiftExportRow;
  gender: string | null;
  ageCategory: string | null;
  ageMin: number | null;
  ageMax: number | null;
};

interface BuildSingleLiftExportRowsOptions {
  rows: ContestResultExportRow[];
  attemptsByRegistration: Map<string, AttemptExportRow[]>;
  contestDate: string | null;
  contestType: string | null;
  config: SingleLiftExportConfig;
}

function resolveSingleLiftExportConfig(discipline: unknown): SingleLiftExportConfig | null {
  if (typeof discipline !== 'string') {
    return null;
  }
  switch (discipline) {
    case 'Bench':
      return { liftType: 'Bench', prefix: 'BP' };
    case 'Deadlift':
      return { liftType: 'Deadlift', prefix: 'DL' };
    case 'Squat':
      return { liftType: 'Squat', prefix: 'SQ' };
    default:
      return null;
  }
}

function buildAttemptLookup(attempts: AttemptExportRow[]): Map<string, AttemptExportRow[]> {
  const lookup = new Map<string, AttemptExportRow[]>();
  for (const attempt of attempts) {
    if (!attempt.registrationId || typeof attempt.attemptNumber !== 'number') {
      continue;
    }
    const key = attempt.registrationId;
    const bucket = lookup.get(key) ?? [];
    const index = Math.min(Math.max(attempt.attemptNumber - 1, 0), 3);
    bucket[index] = attempt;
    lookup.set(key, bucket);
  }
  return lookup;
}

function buildSingleLiftExportRows(options: BuildSingleLiftExportRowsOptions): SingleLiftExportEntry[] {
  const { rows, attemptsByRegistration, contestDate, contestType, config } = options;
  return rows.map((row) => {
    const attempts = attemptsByRegistration.get(row.registrationId) ?? [];
    const place = Boolean(row.isDisqualified) ? 'OUT' : (row.placeOpen ?? '').toString();
    const bodyweight = typeof row.bodyweight === 'number' ? row.bodyweight : null;
    const reshelCoefficient = typeof row.reshelCoefficient === 'number' ? row.reshelCoefficient : 1;
    const mcculloughCoefficient = typeof row.mcculloughCoefficient === 'number' ? row.mcculloughCoefficient : 1;
    const bestLift = getBestLiftValue(row, config);
    const reshelPoints = bestLift * reshelCoefficient;
    const points = getLiftPointsValue(row, config);
    const mccPoints = points ?? reshelPoints * mcculloughCoefficient;
    const age = resolveAgeOnContestDate(row.birthDate, contestDate);
    const division = deriveDivisionLabel(row.labels, contestType);
    const attemptStrings = [0, 1, 2, 3].map((index) => formatAttemptValue(attempts[index]));

    const exportRow = {
      Place: place === 'NaN' ? '' : place,
      Name: row.firstName ?? '',
      Surname: row.lastName ?? '',
      Country: '',
      Age: age !== null ? formatDecimal(age, 0) : '',
      Weight: bodyweight !== null ? formatDecimal(bodyweight, 2) : '',
      'Age Class': row.ageCategory ?? '',
      'Weight Class': row.weightClass ?? '',
      Div: division,
      [`${config.prefix}1`]: attemptStrings[0],
      [`${config.prefix}2`]: attemptStrings[1],
      [`${config.prefix}3`]: attemptStrings[2],
      [`${config.prefix}4`]: attemptStrings[3],
      [`Total${config.prefix}`]: formatDecimal(bestLift, 2),
      [`Reshel${config.prefix}`]: formatDecimal(reshelPoints, 4),
      [`McCoulogh${config.prefix}`]: formatDecimal(mccPoints, 4),
    } as SingleLiftExportRow;

    return {
      row: exportRow,
      gender: row.gender ?? null,
      ageCategory: row.ageCategory ?? null,
      ageMin: typeof row.ageMin === 'number' ? row.ageMin : null,
      ageMax: typeof row.ageMax === 'number' ? row.ageMax : null,
    };
  });
}

function serialiseSingleLiftCsv(entries: SingleLiftExportEntry[], config: SingleLiftExportConfig): string {
  const columns = createSingleLiftColumns(config.prefix);
  const header = columns.join(';');
  const lines: string[] = [];

  const groups = new Map<string, SingleLiftExportEntry[]>();

  for (const entry of entries) {
    const key = `${entry.gender ?? ''}|${entry.ageCategory ?? ''}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(entry);
  }

  const sortedKeys = Array.from(groups.keys()).sort((aKey, bKey) => {
    const a = groups.get(aKey)?.[0];
    const b = groups.get(bKey)?.[0];

    const sexRank = (gender: string | null | undefined) => {
      if (gender === 'Female') return 0;
      if (gender === 'Male') return 1;
      return 2;
    };

    const sexDiff = sexRank(a?.gender) - sexRank(b?.gender);
    if (sexDiff !== 0) return sexDiff;

    const aMin = a?.ageMin ?? Number.POSITIVE_INFINITY;
    const bMin = b?.ageMin ?? Number.POSITIVE_INFINITY;
    if (aMin !== bMin) return aMin - bMin;

    const aMax = a?.ageMax ?? Number.POSITIVE_INFINITY;
    const bMax = b?.ageMax ?? Number.POSITIVE_INFINITY;
    if (aMax !== bMax) return aMax - bMax;

    const aLabel = a?.ageCategory ?? '';
    const bLabel = b?.ageCategory ?? '';
    return aLabel.localeCompare(bLabel);
  });

  // Title row at top
  lines.push([escapeCsvValue(`${config.liftType.toUpperCase()} RESULTS`), ...Array(columns.length - 1).fill('')].join(';'));

  for (const key of sortedKeys) {
    const groupEntries = groups.get(key) ?? [];
    const sample = groupEntries[0];
    const genderLabel = sample?.gender === 'Male' ? 'MEN' : sample?.gender === 'Female' ? 'WOMEN' : 'ATHLETES';
    const ageLabel = sample?.ageCategory ?? 'Unassigned';
    const title = `${genderLabel} - ${ageLabel} RAW`;

    // Empty separator row
    lines.push('');
    // Title row in first column
    lines.push([escapeCsvValue(title), ...Array(columns.length - 1).fill('')].join(';'));
    // Header row
    lines.push(header);

    const sortedGroup = [...groupEntries].sort((a, b) => {
      const parseNum = (value: string | undefined) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
      };

      const aPlace = parseNum(a.row.Place);
      const bPlace = parseNum(b.row.Place);
      if (aPlace !== bPlace) return aPlace - bPlace;

      const totalKey = `Total${config.prefix}` as const;
      const aTotal = parseNum(a.row[totalKey]);
      const bTotal = parseNum(b.row[totalKey]);
      if (aTotal !== bTotal) return bTotal - aTotal;

      return (a.row.Surname ?? '').localeCompare(b.row.Surname ?? '');
    });

    let localPlace = 1;
    for (const entry of sortedGroup) {
      const placeValue = entry.row.Place === 'OUT' ? 'OUT' : String(localPlace++);
      lines.push(columns.map((column) => {
        if (column === 'Place') {
          return escapeCsvValue(placeValue);
        }
        return escapeCsvValue(entry.row[column] ?? '');
      }).join(';'));
    }
  }

  return lines.join('\n');
}

function createSingleLiftColumns(prefix: string): string[] {
  return [
    'Place',
    'Name',
    'Surname',
    'Country',
    'Age',
    'Weight',
    'Age Class',
    'Weight Class',
    'Div',
    `${prefix}1`,
    `${prefix}2`,
    `${prefix}3`,
    `${prefix}4`,
    `Total${prefix}`,
    `Reshel${prefix}`,
    `McCoulogh${prefix}`,
  ];
}

function getBestLiftValue(row: ContestResultExportRow, config: SingleLiftExportConfig): number {
  switch (config.liftType) {
    case 'Bench':
      return Number(row.bestBench ?? 0) || 0;
    case 'Deadlift':
      return Number(row.bestDeadlift ?? 0) || 0;
    case 'Squat':
      return Number(row.bestSquat ?? 0) || 0;
    default:
      return 0;
  }
}

function getLiftPointsValue(row: ContestResultExportRow, config: SingleLiftExportConfig): number | null {
  switch (config.liftType) {
    case 'Bench':
      return typeof row.benchPoints === 'number' ? row.benchPoints : null;
    case 'Deadlift':
      return typeof row.deadliftPoints === 'number' ? row.deadliftPoints : null;
    case 'Squat':
      return typeof row.squatPoints === 'number' ? row.squatPoints : null;
    default:
      return null;
  }
}

function formatAttemptValue(attempt?: AttemptExportRow): string {
  if (!attempt || attempt.weight === null || attempt.weight === undefined) {
    return '';
  }
  const weight = formatDecimal(attempt.weight, 2);
  if (!weight) {
    return '';
  }
  if (attempt.status === 'Failed') {
    return `-${weight}`;
  }
  return weight;
}

function formatDecimal(value: number, decimals: number): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '';
  }
  const fixed = value.toFixed(decimals);
  return fixed.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

function escapeCsvValue(value: string): string {
  if (value === null || value === undefined) {
    return '';
  }
  const stringValue = value.toString();
  if (/[";\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function deriveDivisionLabel(labels: readonly string[], contestType: string | null | undefined): string {
  // Export requirement: always emit RAW for division field
  return 'RAW';
}

function resolveAgeOnContestDate(birthDate: string | null | undefined, contestDate: string | null | undefined): number | null {
  if (!birthDate || !contestDate) {
    return null;
  }
  const birth = new Date(birthDate);
  const contest = new Date(contestDate);
  if (Number.isNaN(birth.getTime()) || Number.isNaN(contest.getTime())) {
    return null;
  }
  let age = contest.getFullYear() - birth.getFullYear();
  const monthDelta = contest.getMonth() - birth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && contest.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age;
}

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

function exportLegacyResultsCsv(rankings: any[]): string {
  let csv = 'Place;Name;Best Squat;Best Bench;Best Deadlift;Total;Squat Points;Bench Points;Deadlift Points;Coefficient Points\n';

  for (const result of rankings) {
    csv += `${escapeCsvValue(result.place_open || '')};${escapeCsvValue(`${result.first_name} ${result.last_name}`)};${escapeCsvValue(result.best_squat || 0)};${escapeCsvValue(result.best_bench || 0)};${escapeCsvValue(result.best_deadlift || 0)};${escapeCsvValue(result.total_weight || 0)};${escapeCsvValue(result.squat_points || 0)};${escapeCsvValue(result.bench_points || 0)};${escapeCsvValue(result.deadlift_points || 0)};${escapeCsvValue(result.coefficient_points || 0)}\n`;
  }

  return csv;
}

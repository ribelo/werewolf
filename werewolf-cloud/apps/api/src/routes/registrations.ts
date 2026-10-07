import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { D1Database } from '@cloudflare/workers-types';
import type { WerewolfEnvironment } from '../env';
import { executeQuery, executeQueryOne, executeMutation, generateId, getCurrentTimestamp } from '../utils/database';
import type { LiftType } from '@werewolf/domain';
import { registrationCreateSchema, registrationUpdateSchema } from '@werewolf/domain/models/registration';
import { determineAgeCategory, determineWeightClass } from '@werewolf/domain/services/coefficients';
import {
  contestLiftsFromRow,
  normaliseLiftList,
  liftsEqual,
  replaceRegistrationLifts,
  removeAttemptsForInactiveLifts,
  ensureLiftsForContest,
} from '../utils/lifts';
import { selectContestRegistrations, selectRegistration } from '../services/registrations/reader';
import { listContestTags, seedContestTags, MANDATORY_TAG_LABEL } from '../utils/tags';
import { getReshelCoefficient, getMcCulloughCoefficient } from '../services/coefficients';
import { getContestAgeDescriptors, getContestWeightDescriptors, seedContestCategories } from '../utils/category-templates';
import { publishEvent } from '../live/publish';
import { calculateRegistrationResults, updateAllRankings } from '../services/results';
import { invalidateResultsCache } from '../utils/cache';

export const contestRegistrations = new Hono<WerewolfEnvironment>();

function serialiseLabels(labels: readonly string[] | null | undefined): string {
  if (!labels || labels.length === 0) {
    return '[]';
  }
  return JSON.stringify(labels);
}


interface ContestTagDescriptor {
  label: string;
  order: number;
}

async function loadContestTagDescriptors(db: D1Database, contestId: string): Promise<ContestTagDescriptor[]> {
  await seedContestTags(db, contestId);
  const rows = await listContestTags(db, contestId);
  return rows.map((row, index) => ({
    label: row.label,
    order: index,
  }));
}

function normaliseLabelsForContest(
  labels: readonly string[] | undefined,
  descriptors: ContestTagDescriptor[],
  { defaultToMandatory }: { defaultToMandatory: boolean },
): string[] {
  const allowed = new Map(descriptors.map((descriptor) => [descriptor.label, descriptor.order] as const));
  const unique: string[] = [];

  for (const raw of labels ?? []) {
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (!value) continue;
    if (!allowed.has(value)) {
      throw new Error(`Unknown tag: ${value}`);
    }
    if (!unique.includes(value)) {
      unique.push(value);
    }
  }

  if (unique.length === 0 && defaultToMandatory && allowed.has(MANDATORY_TAG_LABEL)) {
    unique.push(MANDATORY_TAG_LABEL);
  }

  const ordered = [...unique].sort((a, b) => {
    const aOrder = allowed.get(a) ?? Number.MAX_SAFE_INTEGER;
    const bOrder = allowed.get(b) ?? Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) {
      return aOrder - bOrder;
    }
    return a.localeCompare(b);
  });

  return ordered;
}

const bulkFlightSchema = z.object({
  assignments: z
    .array(
      z.object({
        registrationId: z.string().uuid(),
        flightCode: z.string().min(1).nullable().optional(),
        flightOrder: z.number().int().nullable().optional(),
      })
    )
    .min(1),
});

const labelsSchema = z.object({
  labels: z.array(z.string()).default([]),
});

const FLIGHT_CODE_PATTERN = /^[A-Z]$/;

function normaliseFlightCode(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim().toUpperCase();
  if (trimmed.length === 0) {
    return null;
  }
  if (!FLIGHT_CODE_PATTERN.test(trimmed)) {
    return null;
  }
  return trimmed;
}

// POST /contests/:contestId/registrations - Create registration
contestRegistrations.post('/', zValidator('json', registrationCreateSchema), async (c) => {
  const db = c.env.DB;
  const contestId = c.req.param('contestId') as string;
  const input = c.req.valid('json');

  if (!input.competitorId) {
    return c.json({ data: null, error: 'competitorId is required', requestId: c.get('requestId') }, 400);
  }

  const competitorId = input.competitorId as string;

  // Get competitor data for coefficient calculations
  const competitor = await executeQueryOne(
    db,
    'SELECT gender, birth_date FROM competitors WHERE id = ?',
    [competitorId]
  );

  if (!competitor) {
    return c.json({ data: null, error: 'Competitor not found', requestId: c.get('requestId') }, 404);
  }

  // Get contest date
  const contest = await executeQueryOne(
    db,
    'SELECT date, discipline, competition_type FROM contests WHERE id = ?',
    [contestId]
  );

  if (!contest) {
    return c.json({ data: null, error: 'Contest not found', requestId: c.get('requestId') }, 404);
  }

  const contestLifts = contestLiftsFromRow(contest);
  const selectedLifts = ensureLiftsForContest(input.lifts, contestLifts);
  const bodyweight = typeof input.bodyweight === 'number' ? input.bodyweight : null;

  await seedContestCategories(db, contestId);

  const tagDescriptors = await loadContestTagDescriptors(db, contestId);
  let labels: string[];
  try {
    labels = normaliseLabelsForContest(input.labels, tagDescriptors, { defaultToMandatory: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid tags provided';
    return c.json({ data: null, error: message, requestId: c.get('requestId') }, 400);
  }

  const [ageDescriptors, weightDescriptors] = await Promise.all([
    getContestAgeDescriptors(db, contestId),
    getContestWeightDescriptors(db, contestId),
  ]);

  const [reshelCoefficient, mcculloughCoefficient] = await Promise.all([
    bodyweight !== null ? getReshelCoefficient(db, competitor.gender, bodyweight) : Promise.resolve(null),
    getMcCulloughCoefficient(db, competitor.birth_date, contest.date),
  ]);

  const resolvedAgeCode = determineAgeCategory(competitor.birth_date, contest.date, ageDescriptors);
  const ageCategory = ageDescriptors.find((descriptor) => descriptor.code === resolvedAgeCode) ?? ageDescriptors[0];

  let weightClassId: string | null = null;
  if (typeof input.weightClassId === 'string' && input.weightClassId.length > 0) {
    const providedWeightClass = weightDescriptors.find((descriptor) => descriptor.id === input.weightClassId);
    if (!providedWeightClass) {
      return c.json({ data: null, error: 'Invalid weight class selection', requestId: c.get('requestId') }, 400);
    }
    weightClassId = providedWeightClass.id;
  } else if (bodyweight !== null && weightDescriptors.length > 0) {
    const resolvedWeightCode = determineWeightClass(bodyweight, competitor.gender, weightDescriptors);
    const descriptor = weightDescriptors.find((entry) => entry.code === resolvedWeightCode) ?? weightDescriptors[0] ?? null;
    weightClassId = descriptor?.id ?? null;
  }

  if (!ageCategory) {
    return c.json({ data: null, error: 'Contest categories not configured', requestId: c.get('requestId') }, 400);
  }

  const id = generateId();
  const now = getCurrentTimestamp();

  await executeMutation(
    db,
    `
    INSERT INTO registrations (
      id, contest_id, competitor_id, age_category_id, weight_class_id,
      bodyweight, reshel_coefficient, mccullough_coefficient,
      rack_height_squat, rack_height_bench, created_at,
      flight_code, flight_order, labels
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      id,
      contestId,
      competitorId,
      ageCategory.id,
      weightClassId,
      bodyweight,
      reshelCoefficient,
      mcculloughCoefficient,
      input.rackHeightSquat ?? null,
      input.rackHeightBench ?? null,
      now,
      normaliseFlightCode(input.flightCode) ?? 'A',
      input.flightOrder ?? null,
      serialiseLabels(labels),
    ]
  );

  await replaceRegistrationLifts(db, id, selectedLifts);

  const registrationData = await selectRegistration(db, id);

  if (registrationData) {
    await publishEvent(c.env, contestId, {
      type: 'registration.upserted',
      payload: registrationData,
    });
  }

  return c.json({
    data: registrationData,
    error: null,
    requestId: c.get('requestId'),
  }, 201);
});

contestRegistrations.post('/bulk-flight', zValidator('json', bulkFlightSchema), async (c) => {
  const db = c.env.DB;
  const contestId = c.req.param('contestId');
  const { assignments } = c.req.valid('json');

  const sanitized = [];
  for (const entry of assignments) {
    const normalizedCode =
      entry.flightCode === null || entry.flightCode === undefined
        ? 'A'
        : normaliseFlightCode(entry.flightCode);

    if (!normalizedCode) {
      return c.json(
        { data: null, error: 'Invalid flight code', requestId: c.get('requestId') },
        400
      );
    }

    const normalizedOrder =
      entry.flightOrder === null || entry.flightOrder === undefined
        ? null
        : Number.isFinite(entry.flightOrder)
          ? entry.flightOrder
          : null;

    sanitized.push({
      registrationId: entry.registrationId,
      flightCode: normalizedCode,
      flightOrder: normalizedOrder,
    });
  }

  let updated = 0;

  for (const entry of sanitized) {
    const result = await executeMutation(
      db,
      `UPDATE registrations SET flight_code = ?, flight_order = ? WHERE id = ? AND contest_id = ?`,
      [entry.flightCode, entry.flightOrder, entry.registrationId, contestId]
    );
    updated += result.changes ?? 0;
  }

  return c.json({
    data: { updated },
    error: null,
    requestId: c.get('requestId'),
  });
});

// GET /contests/:contestId/registrations - List registrations for contest
contestRegistrations.get('/', async (c) => {
  const db = c.env.DB;
  const contestId = c.req.param('contestId') as string;

  const registrations = await selectContestRegistrations(db, contestId);

  return c.json({
    data: registrations,
    error: null,
    requestId: c.get('requestId'),
  });
});

const registrations = new Hono<WerewolfEnvironment>();

// GET /registrations/:registrationId - Get single registration
registrations.get('/:registrationId', async (c) => {
  const db = c.env.DB;
  const registrationId = c.req.param('registrationId');

  const registrationData = await selectRegistration(db, registrationId);

  if (!registrationData) {
    return c.json({ data: null, error: 'Registration not found', requestId: c.get('requestId') }, 404);
  }

  return c.json({
    data: registrationData,
    error: null,
    requestId: c.get('requestId'),
  });
});

// PATCH /registrations/:registrationId/labels - Replace labels array
registrations.patch('/:registrationId/labels', zValidator('json', labelsSchema), async (c) => {
  const db = c.env.DB;
  const registrationId = c.req.param('registrationId');
  const { labels } = c.req.valid('json');

  const existing = await executeQueryOne<{ contest_id: string }>(
    db,
    'SELECT contest_id FROM registrations WHERE id = ?',
    [registrationId]
  );

  if (!existing) {
    return c.json({ data: null, error: 'Registration not found', requestId: c.get('requestId') }, 404);
  }

  const tagDescriptors = await loadContestTagDescriptors(db, existing.contest_id);
  let normalised: string[];
  try {
    normalised = normaliseLabelsForContest(labels, tagDescriptors, { defaultToMandatory: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid tags provided';
    return c.json({ data: null, error: message, requestId: c.get('requestId') }, 400);
  }

  const result = await executeMutation(
    db,
    'UPDATE registrations SET labels = ? WHERE id = ?',
    [serialiseLabels(normalised), registrationId]
  );

  if (result.changes === 0) {
    return c.json({ data: null, error: 'Registration not found', requestId: c.get('requestId') }, 404);
  }

  await updateAllRankings(db, existing.contest_id);

  const updated = await selectRegistration(db, registrationId);
  if (updated) {
    await publishEvent(c.env, existing.contest_id, {
      type: 'registration.upserted',
      payload: updated,
    });
  }

  return c.json({
    data: { labels: normalised },
    error: null,
    requestId: c.get('requestId'),
  });
});

// PATCH /registrations/:registrationId - Update registration
registrations.patch('/:registrationId', zValidator('json', registrationUpdateSchema), async (c) => {
  const db = c.env.DB;
  const registrationId = c.req.param('registrationId');
  const input = c.req.valid('json');

  const existing = await executeQueryOne<{
    contest_id: string;
    competitor_id: string;
    bodyweight: number | null;
    weight_class_id: string | null;
  }>(
    db,
    'SELECT contest_id, competitor_id, bodyweight, weight_class_id FROM registrations WHERE id = ?',
    [registrationId]
  );

  if (!existing) {
    return c.json({ data: null, error: 'Registration not found', requestId: c.get('requestId') }, 404);
  }

  const nextContestId = input.contestId ?? existing.contest_id;
  const nextCompetitorId = input.competitorId ?? existing.competitor_id;
  const bodyweightProvided = Object.prototype.hasOwnProperty.call(input, 'bodyweight');
  const nextBodyweight = bodyweightProvided
    ? (typeof input.bodyweight === 'number' ? input.bodyweight : null)
    : existing.bodyweight;

  await seedContestCategories(db, nextContestId);

  const tagDescriptors = await loadContestTagDescriptors(db, nextContestId);
  let nextLabels: string[] | null = null;
  if (input.labels !== undefined) {
    try {
      nextLabels = normaliseLabelsForContest(input.labels, tagDescriptors, { defaultToMandatory: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid tags provided';
      return c.json({ data: null, error: message, requestId: c.get('requestId') }, 400);
    }
  }

  const competitor = await executeQueryOne(
    db,
    'SELECT gender, birth_date FROM competitors WHERE id = ?',
    [nextCompetitorId]
  );
  if (!competitor) {
    return c.json({ data: null, error: 'Competitor not found', requestId: c.get('requestId') }, 404);
  }

  const contest = await executeQueryOne(
    db,
    'SELECT date, discipline, competition_type FROM contests WHERE id = ?',
    [nextContestId]
  );
  if (!contest) {
    return c.json({ data: null, error: 'Contest not found', requestId: c.get('requestId') }, 404);
  }

  const contestLifts = contestLiftsFromRow(contest);

  const currentLiftRows = await executeQuery<{ lift_type: LiftType }>(
    db,
    'SELECT lift_type FROM registration_lifts WHERE registration_id = ?',
    [registrationId]
  );
  const currentLifts = normaliseLiftList(
    currentLiftRows.map((row) => row.lift_type as LiftType)
  );

  const requestedLifts = input.lifts ?? currentLifts;
  const nextLifts = ensureLiftsForContest(requestedLifts, contestLifts);

  const liftsChanged = !liftsEqual(currentLifts, nextLifts);

  const [ageDescriptors, weightDescriptors] = await Promise.all([
    getContestAgeDescriptors(db, nextContestId),
    getContestWeightDescriptors(db, nextContestId),
  ]);

  let ageCategory: (typeof ageDescriptors)[number] | undefined;
  if (input.ageCategoryId) {
    ageCategory = ageDescriptors.find((descriptor) => descriptor.id === input.ageCategoryId);
    if (!ageCategory) {
      return c.json({ data: null, error: 'Invalid age category selection', requestId: c.get('requestId') }, 400);
    }
  } else {
    const resolvedAgeCode = determineAgeCategory(competitor.birth_date, contest.date, ageDescriptors);
    ageCategory = ageDescriptors.find((descriptor) => descriptor.code === resolvedAgeCode) ?? ageDescriptors[0];
  }

  let weightClassId: string | null = existing.weight_class_id ?? null;
  if (typeof input.weightClassId === 'string' && input.weightClassId.length > 0) {
    const provided = weightDescriptors.find((descriptor) => descriptor.id === input.weightClassId);
    if (!provided) {
      return c.json({ data: null, error: 'Invalid weight class selection', requestId: c.get('requestId') }, 400);
    }
    weightClassId = provided.id;
  } else if (bodyweightProvided && nextBodyweight === null) {
    weightClassId = null;
  } else if (nextBodyweight !== null && weightDescriptors.length > 0) {
    const resolvedWeightCode = determineWeightClass(nextBodyweight, competitor.gender, weightDescriptors);
    const descriptor = weightDescriptors.find((entry) => entry.code === resolvedWeightCode) ?? weightDescriptors[0] ?? null;
    weightClassId = descriptor?.id ?? null;
  }

  if (!ageCategory) {
    return c.json({ data: null, error: 'Contest categories not configured', requestId: c.get('requestId') }, 400);
  }

  const [recalculatedReshel, recalculatedMcCullough] = await Promise.all([
    nextBodyweight !== null
      ? getReshelCoefficient(db, competitor.gender, nextBodyweight)
      : Promise.resolve(null),
    getMcCulloughCoefficient(db, competitor.birth_date, contest.date),
  ]);

  const updates: string[] = [];
  const params: unknown[] = [];

  if (input.contestId !== undefined) {
    updates.push('contest_id = ?');
    params.push(nextContestId);
  }
  if (input.competitorId !== undefined) {
    updates.push('competitor_id = ?');
    params.push(nextCompetitorId);
  }
  if (bodyweightProvided) {
    updates.push('bodyweight = ?');
    params.push(nextBodyweight);
  }
  if (nextLifts.includes('Squat')) {
    if (input.rackHeightSquat !== undefined) {
      updates.push('rack_height_squat = ?');
      params.push(input.rackHeightSquat);
    }
  } else {
    updates.push('rack_height_squat = ?');
    params.push(null);
  }

  if (nextLifts.includes('Bench')) {
    if (input.rackHeightBench !== undefined) {
      updates.push('rack_height_bench = ?');
      params.push(input.rackHeightBench);
    }
  } else {
    updates.push('rack_height_bench = ?');
    params.push(null);
  }
  if (input.flightCode !== undefined) {
    updates.push('flight_code = ?');
    params.push(input.flightCode ?? null);
  }
  if (input.flightOrder !== undefined) {
    updates.push('flight_order = ?');
    params.push(input.flightOrder ?? null);
  }
  if (input.labels !== undefined) {
    updates.push('labels = ?');
    params.push(serialiseLabels(nextLabels));
  }

  updates.push('age_category_id = ?');
  params.push(ageCategory.id);

  updates.push('weight_class_id = ?');
  params.push(weightClassId);

  const nextReshel =
    input.reshelCoefficient !== undefined
      ? input.reshelCoefficient
      : recalculatedReshel;
  const nextMcCullough =
    input.mcculloughCoefficient !== undefined
      ? input.mcculloughCoefficient
      : recalculatedMcCullough;

  updates.push('reshel_coefficient = ?');
  params.push(nextReshel);

  updates.push('mccullough_coefficient = ?');
  params.push(nextMcCullough);

  if (updates.length === 0) {
    return c.json({ data: null, error: 'No fields to update', requestId: c.get('requestId') }, 400);
  }

  params.push(registrationId);

  await executeMutation(
    db,
    `UPDATE registrations SET ${updates.join(', ')} WHERE id = ?`,
    params
  );

  if (liftsChanged || input.lifts !== undefined || input.contestId !== undefined) {
    await replaceRegistrationLifts(db, registrationId, nextLifts);
    await removeAttemptsForInactiveLifts(c.env, nextContestId, db, registrationId, nextLifts);
  }

  await calculateRegistrationResults(db, registrationId);
  const affectedContestIds = new Set<string>([existing.contest_id, nextContestId]);
  for (const contestIdentifier of affectedContestIds) {
    await updateAllRankings(db, contestIdentifier);
    await invalidateResultsCache(c.env.KV, contestIdentifier);
  }

  const registrationData = await selectRegistration(db, registrationId);

  if (!registrationData) {
    return c.json({ data: null, error: 'Registration not found', requestId: c.get('requestId') }, 404);
  }

  if (existing.contest_id !== nextContestId) {
    // The registration left the source room: tell its clients to drop the row.
    await publishEvent(c.env, existing.contest_id, {
      type: 'registration.deleted',
      payload: { registrationId },
    });
  }

  await publishEvent(c.env, nextContestId, {
    type: 'registration.upserted',
    payload: registrationData,
  });

  return c.json({
    data: registrationData,
    error: null,
    requestId: c.get('requestId'),
  });
});

// DELETE /registrations/:registrationId - Delete registration
registrations.delete('/:registrationId', async (c) => {
  const db = c.env.DB;
  const registrationId = c.req.param('registrationId');

  const existing = await executeQueryOne<{ contest_id: string }>(
    db,
    'SELECT contest_id FROM registrations WHERE id = ?',
    [registrationId]
  );

  if (!existing) {
    return c.json({ data: null, error: 'Registration not found', requestId: c.get('requestId') }, 404);
  }

  const result = await executeMutation(
    db,
    'DELETE FROM registrations WHERE id = ?',
    [registrationId]
  );

  if ((result.changes ?? 0) === 0) {
    return c.json({ data: null, error: 'Registration not found', requestId: c.get('requestId') }, 404);
  }

  await executeMutation(
    db,
    'DELETE FROM results WHERE registration_id = ?',
    [registrationId]
  );
  await updateAllRankings(db, existing.contest_id);
  await invalidateResultsCache(c.env.KV, existing.contest_id);

  await publishEvent(c.env, existing.contest_id, {
    type: 'registration.deleted',
    payload: { registrationId },
  });

  return c.json({
    data: { success: true },
    error: null,
    requestId: c.get('requestId'),
  });
});

export default registrations;

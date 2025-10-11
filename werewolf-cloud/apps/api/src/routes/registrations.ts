import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { WerewolfEnvironment } from '../env';
import { executeQuery, executeQueryOne, executeMutation, generateId, getCurrentTimestamp, convertKeysToCamelCase } from '../utils/database';
import { registrationSchema, registrationCreateSchema, registrationUpdateSchema } from '@werewolf/domain/models/registration';
import { determineAgeCategory, determineWeightClass } from '@werewolf/domain/services/coefficients';
import { getReshelCoefficient, getMcCulloughCoefficient } from '../services/coefficients';
import { getContestAgeDescriptors, getContestWeightDescriptors, seedContestCategories } from '../utils/category-templates';

export const contestRegistrations = new Hono<WerewolfEnvironment>();

function serialiseLabels(labels: unknown): string {
  if (Array.isArray(labels)) {
    return JSON.stringify(labels);
  }
  return '[]';
}

function parseLabels(input: unknown): string[] {
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
    'SELECT date FROM contests WHERE id = ?',
    [contestId]
  );

  if (!contest) {
    return c.json({ data: null, error: 'Contest not found', requestId: c.get('requestId') }, 404);
  }

  await seedContestCategories(db, contestId);

  const [ageDescriptors, weightDescriptors] = await Promise.all([
    getContestAgeDescriptors(db, contestId),
    getContestWeightDescriptors(db, contestId),
  ]);

  const [reshelCoefficient, mcculloughCoefficient] = await Promise.all([
    getReshelCoefficient(db, competitor.gender, input.bodyweight),
    getMcCulloughCoefficient(db, competitor.birth_date, contest.date),
  ]);

  const resolvedAgeCode = determineAgeCategory(competitor.birth_date, contest.date, ageDescriptors);
  const ageCategory = ageDescriptors.find((descriptor) => descriptor.code === resolvedAgeCode) ?? ageDescriptors[0];

  const resolvedWeightCode = determineWeightClass(input.bodyweight, competitor.gender, weightDescriptors);
  const weightClass = weightDescriptors.find((descriptor) => descriptor.code === resolvedWeightCode) ?? weightDescriptors[0];

  if (!ageCategory || !weightClass) {
    return c.json({ data: null, error: 'Contest categories not configured', requestId: c.get('requestId') }, 400);
  }

  const id = generateId();
  const now = getCurrentTimestamp();

  await executeMutation(
    db,
    `
    INSERT INTO registrations (
      id, contest_id, competitor_id, age_category_id, weight_class_id,
      equipment_m, equipment_sm, equipment_t, bodyweight, lot_number,
      personal_record_at_entry, reshel_coefficient, mccullough_coefficient,
      rack_height_squat, rack_height_bench, created_at,
      flight_code, flight_order, labels
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      id,
      contestId,
      competitorId,
      ageCategory.id,
      weightClass.id,
      input.equipmentM || false,
      input.equipmentSm || false,
      input.equipmentT || false,
      input.bodyweight,
      input.lotNumber || null,
      input.personalRecordAtEntry || null,
      reshelCoefficient,
      mcculloughCoefficient,
      input.rackHeightSquat || null,
      input.rackHeightBench || null,
      now,
      normaliseFlightCode(input.flightCode) ?? 'A',
      input.flightOrder ?? null,
      serialiseLabels(input.labels),
    ]
  );

  const registration = await executeQueryOne(
    db,
    `
    SELECT
      r.id, r.contest_id, r.competitor_id, r.age_category_id, r.weight_class_id,
      r.equipment_m, r.equipment_sm, r.equipment_t, r.bodyweight, r.lot_number,
      r.personal_record_at_entry, r.reshel_coefficient, r.mccullough_coefficient,
      r.rack_height_squat, r.rack_height_bench, r.created_at,
      r.flight_code, r.flight_order, COALESCE(r.labels, '[]') AS labels,
      cac.name AS age_category_name,
      cwc.name AS weight_class_name,
      c.club,
      c.city,
      c.birth_date,
      c.competition_order
    FROM registrations r
    JOIN competitors c ON r.competitor_id = c.id
    LEFT JOIN contest_age_categories cac ON r.age_category_id = cac.id
    LEFT JOIN contest_weight_classes cwc ON r.weight_class_id = cwc.id
    WHERE r.id = ?
    `,
    [id]
  );

  const registrationData = registration ? convertKeysToCamelCase(registration) : null;
  if (registrationData) {
    registrationData.labels = parseLabels(registrationData.labels);
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
  const contestId = c.req.param('contestId');

  const registrations = await executeQuery(
    db,
    `
    SELECT
      r.id, r.contest_id, r.competitor_id, r.age_category_id, r.weight_class_id,
      r.equipment_m, r.equipment_sm, r.equipment_t, r.bodyweight, r.lot_number,
      r.personal_record_at_entry, r.reshel_coefficient, r.mccullough_coefficient,
      r.rack_height_squat, r.rack_height_bench, r.created_at,
      r.flight_code, r.flight_order, COALESCE(r.labels, '[]') AS labels,
      c.first_name, c.last_name, c.gender, c.club, c.city, c.birth_date, c.competition_order,
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
      COALESCE(r.flight_order, c.competition_order, 0) ASC,
      r.lot_number ASC,
      cac.sort_order ASC,
      cwc.sort_order ASC,
      c.last_name ASC,
      c.first_name ASC
    `,
    [contestId]
  );

  const camel = convertKeysToCamelCase(registrations) as any[];
  const enriched = camel.map((row) => ({
    ...row,
    labels: parseLabels(row.labels),
  }));

  return c.json({
    data: enriched,
    error: null,
    requestId: c.get('requestId'),
  });
});

const registrations = new Hono<WerewolfEnvironment>();

// GET /registrations/:registrationId - Get single registration
registrations.get('/:registrationId', async (c) => {
  const db = c.env.DB;
  const registrationId = c.req.param('registrationId');

  const registration = await executeQueryOne(
    db,
    `
    SELECT
      r.id, r.contest_id, r.competitor_id, r.age_category_id, r.weight_class_id,
      r.equipment_m, r.equipment_sm, r.equipment_t, r.bodyweight, r.lot_number,
      r.personal_record_at_entry, r.reshel_coefficient, r.mccullough_coefficient,
      r.rack_height_squat, r.rack_height_bench, r.created_at,
      r.flight_code, r.flight_order, COALESCE(r.labels, '[]') AS labels,
      c.first_name, c.last_name, c.gender, c.birth_date, c.club, c.city, c.competition_order,
      cac.name AS age_category_name,
      cwc.name AS weight_class_name
    FROM registrations r
    JOIN competitors c ON r.competitor_id = c.id
    LEFT JOIN contest_age_categories cac ON r.age_category_id = cac.id
    LEFT JOIN contest_weight_classes cwc ON r.weight_class_id = cwc.id
    WHERE r.id = ?
    `,
    [registrationId]
  );

  if (!registration) {
    return c.json({ data: null, error: 'Registration not found', requestId: c.get('requestId') }, 404);
  }

  const registrationData = convertKeysToCamelCase(registration);
  registrationData.labels = parseLabels(registrationData.labels);

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

  const result = await executeMutation(
    db,
    'UPDATE registrations SET labels = ? WHERE id = ?',
    [serialiseLabels(labels), registrationId]
  );

  if (result.changes === 0) {
    return c.json({ data: null, error: 'Registration not found', requestId: c.get('requestId') }, 404);
  }

  return c.json({
    data: { labels },
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
    bodyweight: number;
  }>(
    db,
    'SELECT contest_id, competitor_id, bodyweight FROM registrations WHERE id = ?',
    [registrationId]
  );

  if (!existing) {
    return c.json({ data: null, error: 'Registration not found', requestId: c.get('requestId') }, 404);
  }

  const nextContestId = input.contestId ?? existing.contest_id;
  const nextCompetitorId = input.competitorId ?? existing.competitor_id;
  const nextBodyweight = input.bodyweight ?? existing.bodyweight;

  await seedContestCategories(db, nextContestId);

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
    'SELECT date FROM contests WHERE id = ?',
    [nextContestId]
  );
  if (!contest) {
    return c.json({ data: null, error: 'Contest not found', requestId: c.get('requestId') }, 404);
  }

  const [ageDescriptors, weightDescriptors] = await Promise.all([
    getContestAgeDescriptors(db, nextContestId),
    getContestWeightDescriptors(db, nextContestId),
  ]);

  const resolvedAgeCode = input.ageCategoryId
    ? ageDescriptors.find((descriptor) => descriptor.id === input.ageCategoryId)?.code ?? undefined
    : determineAgeCategory(competitor.birth_date, contest.date, ageDescriptors);
  const ageCategory = ageDescriptors.find((descriptor) => descriptor.code === resolvedAgeCode) ?? ageDescriptors[0];

  const resolvedWeightCode = input.weightClassId
    ? weightDescriptors.find((descriptor) => descriptor.id === input.weightClassId)?.code ?? undefined
    : determineWeightClass(nextBodyweight, competitor.gender, weightDescriptors);
  const weightClass = weightDescriptors.find((descriptor) => descriptor.code === resolvedWeightCode) ?? weightDescriptors[0];

  if (!ageCategory || !weightClass) {
    return c.json({ data: null, error: 'Contest categories not configured', requestId: c.get('requestId') }, 400);
  }

  const [recalculatedReshel, recalculatedMcCullough] = await Promise.all([
    getReshelCoefficient(db, competitor.gender, nextBodyweight),
    getMcCulloughCoefficient(db, competitor.birth_date, contest.date),
  ]);

  const updates: string[] = [];
  const params: any[] = [];

  if (input.contestId !== undefined) {
    updates.push('contest_id = ?');
    params.push(nextContestId);
  }
  if (input.competitorId !== undefined) {
    updates.push('competitor_id = ?');
    params.push(nextCompetitorId);
  }
  if (input.equipmentM !== undefined) {
    updates.push('equipment_m = ?');
    params.push(input.equipmentM);
  }
  if (input.equipmentSm !== undefined) {
    updates.push('equipment_sm = ?');
    params.push(input.equipmentSm);
  }
  if (input.equipmentT !== undefined) {
    updates.push('equipment_t = ?');
    params.push(input.equipmentT);
  }
  if (input.bodyweight !== undefined) {
    updates.push('bodyweight = ?');
    params.push(nextBodyweight);
  }
  if (input.lotNumber !== undefined) {
    updates.push('lot_number = ?');
    params.push(input.lotNumber);
  }
  if (input.personalRecordAtEntry !== undefined) {
    updates.push('personal_record_at_entry = ?');
    params.push(input.personalRecordAtEntry);
  }
  if (input.rackHeightSquat !== undefined) {
    updates.push('rack_height_squat = ?');
    params.push(input.rackHeightSquat);
  }
  if (input.rackHeightBench !== undefined) {
    updates.push('rack_height_bench = ?');
    params.push(input.rackHeightBench);
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
    params.push(serialiseLabels(input.labels));
  }

  updates.push('age_category_id = ?');
  params.push(ageCategory.id);

  updates.push('weight_class_id = ?');
  params.push(weightClass.id);

  const nextReshel = input.reshelCoefficient ?? recalculatedReshel;
  const nextMcCullough = input.mcculloughCoefficient ?? recalculatedMcCullough;

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

  const registration = await executeQueryOne(
    db,
    `
    SELECT
      r.id, r.contest_id, r.competitor_id, r.age_category_id, r.weight_class_id,
      r.equipment_m, r.equipment_sm, r.equipment_t, r.bodyweight, r.lot_number,
      r.personal_record_at_entry, r.reshel_coefficient, r.mccullough_coefficient,
      r.rack_height_squat, r.rack_height_bench, r.created_at,
      r.flight_code, r.flight_order, COALESCE(r.labels, '[]') AS labels,
      c.first_name, c.last_name, c.gender, c.birth_date, c.club, c.city, c.competition_order,
      cac.name AS age_category_name,
      cwc.name AS weight_class_name
    FROM registrations r
    JOIN competitors c ON r.competitor_id = c.id
    LEFT JOIN contest_age_categories cac ON r.age_category_id = cac.id
    LEFT JOIN contest_weight_classes cwc ON r.weight_class_id = cwc.id
    WHERE r.id = ?
    `,
    [registrationId]
  );

  if (!registration) {
    return c.json({ data: null, error: 'Registration not found', requestId: c.get('requestId') }, 404);
  }

  const registrationData = convertKeysToCamelCase(registration);
  registrationData.labels = parseLabels(registrationData.labels);

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

  const result = await executeMutation(
    db,
    'DELETE FROM registrations WHERE id = ?',
    [registrationId]
  );

  if (result.changes === 0) {
    return c.json({ data: null, error: 'Registration not found', requestId: c.get('requestId') }, 404);
  }

  return c.json({
    data: { success: true },
    error: null,
    requestId: c.get('requestId'),
  });
});

export default registrations;

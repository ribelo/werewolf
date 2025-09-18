import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { WerewolfEnvironment } from '../env';
import { executeQuery, executeQueryOne, executeMutation, generateId, getCurrentTimestamp, convertKeysToCamelCase } from '../utils/database';
import { registrationSchema, registrationCreateSchema, registrationUpdateSchema } from '@werewolf/domain/models/registration';
import { calculateReshelCoefficient, calculateMcCulloughCoefficient, determineAgeCategory, determineWeightClass } from '@werewolf/domain/services/coefficients';

export const contestRegistrations = new Hono<WerewolfEnvironment>();

// POST /contests/:contestId/registrations - Create registration
contestRegistrations.post('/', zValidator('json', registrationCreateSchema), async (c) => {
  const db = c.env.DB;
  const contestId = c.req.param('contestId');
  const input = c.req.valid('json');

  // Get competitor data for coefficient calculations
  const competitor = await executeQueryOne(
    db,
    'SELECT gender, birth_date FROM competitors WHERE id = ?',
    [input.competitorId]
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

  // Calculate coefficients
  const reshelCoefficient = calculateReshelCoefficient(input.bodyweight, competitor.gender);
  const mcculloughCoefficient = calculateMcCulloughCoefficient(competitor.birth_date, contest.date);

  // Auto-determine categories
  const ageCategoryId = determineAgeCategory(competitor.birth_date, contest.date);
  const weightClassId = determineWeightClass(input.bodyweight, competitor.gender);

  const id = generateId();
  const now = getCurrentTimestamp();

  await executeMutation(
    db,
    `
    INSERT INTO registrations (
      id, contest_id, competitor_id, age_category_id, weight_class_id,
      equipment_m, equipment_sm, equipment_t, bodyweight, lot_number,
      personal_record_at_entry, reshel_coefficient, mccullough_coefficient,
      rack_height_squat, rack_height_bench, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      id,
      contestId,
      input.competitorId,
      ageCategoryId,
      weightClassId,
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
    ]
  );

  const registration = await executeQueryOne(
    db,
    `
    SELECT
      id, contest_id, competitor_id, age_category_id, weight_class_id,
      equipment_m, equipment_sm, equipment_t, bodyweight, lot_number,
      personal_record_at_entry, reshel_coefficient, mccullough_coefficient,
      rack_height_squat, rack_height_bench, created_at
    FROM registrations
    WHERE id = ?
    `,
    [id]
  );

  return c.json({
    data: convertKeysToCamelCase(registration),
    error: null,
    requestId: c.get('requestId'),
  }, 201);
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
      c.first_name, c.last_name, c.gender
    FROM registrations r
    JOIN competitors c ON r.competitor_id = c.id
    WHERE r.contest_id = ?
    ORDER BY r.lot_number ASC, c.last_name ASC
    `,
    [contestId]
  );

  return c.json({
    data: convertKeysToCamelCase(registrations),
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
      c.first_name, c.last_name, c.gender, c.birth_date
    FROM registrations r
    JOIN competitors c ON r.competitor_id = c.id
    WHERE r.id = ?
    `,
    [registrationId]
  );

  if (!registration) {
    return c.json({ data: null, error: 'Registration not found', requestId: c.get('requestId') }, 404);
  }

  return c.json({
    data: convertKeysToCamelCase(registration),
    error: null,
    requestId: c.get('requestId'),
  });
});

// PATCH /registrations/:registrationId - Update registration
registrations.patch('/:registrationId', zValidator('json', registrationUpdateSchema), async (c) => {
  const db = c.env.DB;
  const registrationId = c.req.param('registrationId');
  const input = c.req.valid('json');

  const updates: string[] = [];
  const params: any[] = [];

  if (input.contestId !== undefined) {
    updates.push('contest_id = ?');
    params.push(input.contestId);
  }
  if (input.competitorId !== undefined) {
    updates.push('competitor_id = ?');
    params.push(input.competitorId);
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
    params.push(input.bodyweight);
  }
  if (input.lotNumber !== undefined) {
    updates.push('lot_number = ?');
    params.push(input.lotNumber);
  }
  if (input.personalRecordAtEntry !== undefined) {
    updates.push('personal_record_at_entry = ?');
    params.push(input.personalRecordAtEntry);
  }
  if (input.reshelCoefficient !== undefined) {
    updates.push('reshel_coefficient = ?');
    params.push(input.reshelCoefficient);
  }
  if (input.mcculloughCoefficient !== undefined) {
    updates.push('mccullough_coefficient = ?');
    params.push(input.mcculloughCoefficient);
  }
  if (input.rackHeightSquat !== undefined) {
    updates.push('rack_height_squat = ?');
    params.push(input.rackHeightSquat);
  }
  if (input.rackHeightBench !== undefined) {
    updates.push('rack_height_bench = ?');
    params.push(input.rackHeightBench);
  }

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
      c.first_name, c.last_name, c.gender, c.birth_date
    FROM registrations r
    JOIN competitors c ON r.competitor_id = c.id
    WHERE r.id = ?
    `,
    [registrationId]
  );

  if (!registration) {
    return c.json({ data: null, error: 'Registration not found', requestId: c.get('requestId') }, 404);
  }

  return c.json({
    data: convertKeysToCamelCase(registration),
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

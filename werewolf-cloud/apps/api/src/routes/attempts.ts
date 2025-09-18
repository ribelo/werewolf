import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { WerewolfEnvironment } from '../env';
import { executeQuery, executeQueryOne, executeMutation, generateId, getCurrentTimestamp, convertKeysToCamelCase } from '../utils/database';
import { publishEvent } from '../live/publish';
import { attemptUpsertSchema, attemptResultUpdateSchema, attemptStatusSchema, liftTypeSchema } from '@werewolf/domain/models/attempt';

export const registrationAttempts = new Hono<WerewolfEnvironment>();

// POST /contests/:contestId/registrations/:registrationId/attempts - Upsert attempt
registrationAttempts.post('/', zValidator('json', attemptUpsertSchema), async (c) => {
  const db = c.env.DB;
  const contestId = c.req.param('contestId');
  const registrationId = c.req.param('registrationId');
  const input = c.req.valid('json');

  // Check if attempt already exists
  const existing = await executeQueryOne(
    db,
    `
    SELECT id FROM attempts
    WHERE registration_id = ? AND lift_type = ? AND attempt_number = ?
    `,
    [registrationId, input.liftType, input.attemptNumber]
  );

  let attemptId: string;
  if (existing) {
    attemptId = existing.id as string;
    // Update existing attempt
    await executeMutation(
      db,
      `
      UPDATE attempts
      SET weight = ?, updated_at = ?
      WHERE registration_id = ? AND lift_type = ? AND attempt_number = ?
      `,
      [input.weight, getCurrentTimestamp(), registrationId, input.liftType, input.attemptNumber]
    );
  } else {
    // Create new attempt
    const id = generateId();
    attemptId = id;
    await executeMutation(
      db,
      `
      INSERT INTO attempts (
        id, registration_id, lift_type, attempt_number, weight,
        status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'Pending', ?, ?)
      `,
      [id, registrationId, input.liftType, input.attemptNumber, input.weight, getCurrentTimestamp(), getCurrentTimestamp()]
    );
  }

  // Broadcast attempt upserted
  if (contestId) {
    await publishEvent(c.env, contestId, {
      type: 'attempt.upserted',
      payload: {
        attemptId,
        registrationId,
        liftType: input.liftType,
        attemptNumber: input.attemptNumber,
        weight: input.weight,
      },
    });
  }

  return c.json({
    data: { success: true },
    error: null,
    requestId: c.get('requestId'),
  });
});

// GET /contests/:contestId/registrations/:registrationId/attempts - List attempts for registration
registrationAttempts.get('/', async (c) => {
  const db = c.env.DB;
  const registrationId = c.req.param('registrationId');

  const attempts = await executeQuery(
    db,
    `
    SELECT
      id, registration_id, lift_type, attempt_number, weight,
      status, timestamp, judge1_decision, judge2_decision, judge3_decision,
      notes, created_at, updated_at
    FROM attempts
    WHERE registration_id = ?
    ORDER BY lift_type ASC, attempt_number ASC
    `,
    [registrationId]
  );

  return c.json({
    data: convertKeysToCamelCase(attempts),
    error: null,
    requestId: c.get('requestId'),
  });
});

export const contestAttempts = new Hono<WerewolfEnvironment>();

// GET /contests/:contestId/attempts - List all attempts for contest
contestAttempts.get('/', async (c) => {
  const db = c.env.DB;
  const contestId = c.req.param('contestId');

  const attempts = await executeQuery(
    db,
    `
    SELECT
      a.id, a.registration_id, a.lift_type, a.attempt_number, a.weight,
      a.status, a.timestamp, a.judge1_decision, a.judge2_decision, a.judge3_decision,
      a.notes, a.created_at, a.updated_at,
      c.first_name, c.last_name, r.lot_number
    FROM attempts a
    JOIN registrations r ON a.registration_id = r.id
    JOIN competitors c ON r.competitor_id = c.id
    WHERE r.contest_id = ?
    ORDER BY r.lot_number ASC, a.lift_type ASC, a.attempt_number ASC
    `,
    [contestId]
  );

  return c.json({
    data: convertKeysToCamelCase(attempts),
    error: null,
    requestId: c.get('requestId'),
  });
});

// GET /contests/:contestId/attempts/current - Get current attempt
contestAttempts.get('/current', async (c) => {
  const db = c.env.DB;
  const contestId = c.req.param('contestId');

  const currentLift = await executeQueryOne(
    db,
    `
    SELECT
      a.id, a.registration_id, a.lift_type, a.attempt_number, a.weight,
      a.status, a.timestamp, a.judge1_decision, a.judge2_decision, a.judge3_decision,
      a.notes, a.created_at, a.updated_at,
      c.first_name, c.last_name, r.lot_number, cl.rack_height
    FROM current_lifts cl
    JOIN attempts a ON cl.registration_id = a.registration_id
      AND cl.lift_type = a.lift_type
      AND cl.attempt_number = a.attempt_number
    JOIN registrations r ON a.registration_id = r.id
    JOIN competitors c ON r.competitor_id = c.id
    WHERE cl.contest_id = ? AND cl.is_active = true
    `,
    [contestId]
  );

  if (!currentLift) {
    return c.json({
      data: null,
      error: null,
      requestId: c.get('requestId'),
    });
  }

  return c.json({
    data: convertKeysToCamelCase(currentLift),
    error: null,
    requestId: c.get('requestId'),
  });
});

// PUT /contests/:contestId/attempts/current - Set current attempt
contestAttempts.put('/current', zValidator('json', z.object({
  attemptId: z.string().uuid(),
})), async (c) => {
  const db = c.env.DB;
  const contestId = c.req.param('contestId');
  const { attemptId } = c.req.valid('json');

  // Get attempt details
  const attempt = await executeQueryOne(
    db,
    `
    SELECT a.registration_id, a.lift_type, a.attempt_number, a.weight
    FROM attempts a
    JOIN registrations r ON a.registration_id = r.id
    WHERE a.id = ? AND r.contest_id = ?
    `,
    [attemptId, contestId]
  );

  if (!attempt) {
    return c.json({ data: null, error: 'Attempt not found', requestId: c.get('requestId') }, 404);
  }

  // Check contest state
  const contestState = await executeQueryOne(
    db,
    'SELECT status FROM contest_states WHERE contest_id = ?',
    [contestId]
  );

  if (!contestState || contestState.status !== 'InProgress') {
    return c.json({ data: null, error: 'Contest is not in progress', requestId: c.get('requestId') }, 400);
  }

  // Update current lift
  await executeMutation(
    db,
    `
    INSERT OR REPLACE INTO current_lifts (
      id, contest_id, registration_id, lift_type, attempt_number, weight,
      is_active, updated_at
    ) VALUES (1, ?, ?, ?, ?, ?, true, ?)
    `,
    [contestId, attempt.registration_id, attempt.lift_type, attempt.attempt_number, attempt.weight, getCurrentTimestamp()]
  );

  // Broadcast current attempt set
  if (contestId) {
    await publishEvent(c.env, contestId, {
      type: 'attempt.currentSet',
      payload: {
        attemptId,
        registrationId: attempt.registration_id,
        liftType: attempt.lift_type,
        attemptNumber: attempt.attempt_number,
        weight: attempt.weight,
      },
    });
  }

  return c.json({
    data: { success: true },
    error: null,
    requestId: c.get('requestId'),
  });
});

// GET /contests/:contestId/attempts/queue - Get next attempts in queue
contestAttempts.get('/queue', async (c) => {
  const db = c.env.DB;
  const contestId = c.req.param('contestId');

  // Get contest state
  const contestState = await executeQueryOne(
    db,
    'SELECT current_lift, current_round FROM contest_states WHERE contest_id = ?',
    [contestId]
  );

  if (!contestState || !contestState.current_lift) {
    return c.json({
      data: [],
      error: null,
      requestId: c.get('requestId'),
    });
  }

  const attempts = await executeQuery(
    db,
    `
    SELECT
      a.id, a.registration_id, a.lift_type, a.attempt_number, a.weight,
      a.status, a.timestamp, a.judge1_decision, a.judge2_decision, a.judge3_decision,
      a.notes, a.created_at, a.updated_at,
      c.first_name, c.last_name, r.lot_number
    FROM attempts a
    JOIN registrations r ON a.registration_id = r.id
    JOIN competitors c ON r.competitor_id = c.id
    WHERE r.contest_id = ? AND a.lift_type = ? AND a.attempt_number = ? AND a.status = 'Pending'
    ORDER BY r.lot_number ASC
    `,
    [contestId, contestState.current_lift, contestState.current_round]
  );

  return c.json({
    data: convertKeysToCamelCase(attempts),
    error: null,
    requestId: c.get('requestId'),
  });
});

const attempts = new Hono<WerewolfEnvironment>();

// PATCH /attempts/:attemptId/result - Update attempt result
attempts.patch('/:attemptId/result', zValidator('json', attemptResultUpdateSchema), async (c) => {
  const db = c.env.DB;
  const attemptId = c.req.param('attemptId');
  const input = c.req.valid('json');

  const updates: string[] = [];
  const params: any[] = [];

  updates.push('status = ?');
  params.push(input.status);

  if (input.judge1Decision !== undefined) {
    updates.push('judge1_decision = ?');
    params.push(input.judge1Decision);
  }
  if (input.judge2Decision !== undefined) {
    updates.push('judge2_decision = ?');
    params.push(input.judge2Decision);
  }
  if (input.judge3Decision !== undefined) {
    updates.push('judge3_decision = ?');
    params.push(input.judge3Decision);
  }
  if (input.notes !== undefined) {
    updates.push('notes = ?');
    params.push(input.notes);
  }

  updates.push('timestamp = ?');
  params.push(getCurrentTimestamp());

  updates.push('updated_at = ?');
  params.push(getCurrentTimestamp());

  params.push(attemptId);

  await executeMutation(
    db,
    `UPDATE attempts SET ${updates.join(', ')} WHERE id = ?`,
    params
  );

  // Find contestId to broadcast to appropriate room
  const contestRow = await executeQueryOne(
    db,
    `SELECT r.contest_id as contestId FROM attempts a JOIN registrations r ON a.registration_id = r.id WHERE a.id = ?`,
    [attemptId]
  );
  if (contestRow?.contestId) {
    await publishEvent(c.env, String(contestRow.contestId), {
      type: 'attempt.resultUpdated',
      payload: {
        attemptId,
        status: input.status,
        judge1Decision: input.judge1Decision,
        judge2Decision: input.judge2Decision,
        judge3Decision: input.judge3Decision,
        notes: input.notes,
      },
    });
  }

  return c.json({
    data: { success: true },
    error: null,
    requestId: c.get('requestId'),
  });
});

export default attempts;

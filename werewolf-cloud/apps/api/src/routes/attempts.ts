import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { WerewolfEnvironment } from '../env';
import type { Database } from '../utils/database';
import { executeQuery, executeQueryOne, executeMutation, generateId, getCurrentTimestamp, convertKeysToCamelCase } from '../utils/database';
import { publishEvent } from '../live/publish';
import { attemptUpsertSchema, attemptResultUpdateSchema, attemptStatusSchema, liftTypeSchema } from '@werewolf/domain/models/attempt';
import { getAttemptWithRelations, buildCurrentAttemptPayload } from '../services/attempts';

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

  // Broadcast attempt upserted with full attempt payload
  if (contestId) {
    const attemptRecord = await getAttemptWithRelations(db, attemptId, contestId);
    await publishEvent(c.env, contestId, {
      type: 'attempt.upserted',
      payload: attemptRecord ?? {
        attempt_id: attemptId,
        registration_id: registrationId,
        lift_type: input.liftType,
        attempt_number: input.attemptNumber,
        weight: input.weight,
        status: 'Pending',
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
      comp.first_name, comp.last_name, comp.competition_order, r.lot_number,
      comp.first_name || ' ' || comp.last_name AS competitor_name
    FROM attempts a
    JOIN registrations r ON a.registration_id = r.id
    JOIN competitors comp ON r.competitor_id = comp.id
    WHERE r.contest_id = ?
    ORDER BY comp.competition_order ASC, comp.last_name ASC, comp.first_name ASC,
      a.lift_type ASC, a.attempt_number ASC
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
      comp.first_name, comp.last_name, comp.competition_order, r.lot_number, cl.rack_height,
      comp.first_name || ' ' || comp.last_name AS competitor_name
    FROM current_lifts cl
    JOIN attempts a ON cl.registration_id = a.registration_id
      AND cl.lift_type = a.lift_type
      AND cl.attempt_number = a.attempt_number
    JOIN registrations r ON a.registration_id = r.id
    JOIN competitors comp ON r.competitor_id = comp.id
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

  const payload = currentLift.id ? await buildCurrentAttemptPayload(db, contestId, String(currentLift.id)) : null;

  return c.json({
    data: payload,
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
    SELECT a.registration_id, a.lift_type, a.attempt_number, a.weight,
      comp.first_name, comp.last_name, comp.competition_order
    FROM attempts a
    JOIN registrations r ON a.registration_id = r.id
    JOIN competitors comp ON r.competitor_id = comp.id
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

  if (!contestState) {
    await executeMutation(
      db,
      `INSERT INTO contest_states (contest_id, status, current_lift, current_round, updated_at)
       VALUES (?, 'InProgress', ?, ?, ?)` ,
      [contestId, attempt.lift_type, attempt.attempt_number, getCurrentTimestamp()]
    );
  } else if (contestState.status !== 'InProgress') {
    await executeMutation(
      db,
      `UPDATE contest_states
       SET status = 'InProgress', current_lift = ?, current_round = ?, updated_at = ?
       WHERE contest_id = ?`,
      [attempt.lift_type, attempt.attempt_number, getCurrentTimestamp(), contestId]
    );
  } else {
    await executeMutation(
      db,
      `UPDATE contest_states
       SET current_lift = ?, current_round = ?, updated_at = ?
       WHERE contest_id = ?`,
      [attempt.lift_type, attempt.attempt_number, getCurrentTimestamp(), contestId]
    );
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
    const payload = await buildCurrentAttemptPayload(db, contestId, attemptId);
    if (payload) {
      await publishEvent(c.env, contestId, {
        type: 'attempt.currentSet',
        payload,
      });
    } else {
      const fallback = await getAttemptWithRelations(db, attemptId, contestId);
      await publishEvent(c.env, contestId, {
        type: 'attempt.currentSet',
        payload: fallback ?? {
          attempt_id: attemptId,
          registration_id: attempt.registration_id,
          lift_type: attempt.lift_type,
          attempt_number: attempt.attempt_number,
          weight: attempt.weight,
        },
      });
    }
  }

  return c.json({
    data: { success: true },
    error: null,
    requestId: c.get('requestId'),
  });
});

// DELETE /contests/:contestId/attempts/current - Clear current attempt
contestAttempts.delete('/current', async (c) => {
  const db = c.env.DB;
  const contestId = c.req.param('contestId');

  const current = await executeQueryOne(
    db,
    `
    SELECT registration_id, lift_type, attempt_number
    FROM current_lifts
    WHERE contest_id = ? AND is_active = true
    `,
    [contestId]
  );

  if (!current) {
    return c.json({
      data: { success: true, cleared: false },
      error: null,
      requestId: c.get('requestId'),
    });
  }

  await executeMutation(
    db,
    `
    UPDATE current_lifts
    SET is_active = false,
        updated_at = ?,
        timer_start = NULL
    WHERE contest_id = ?
    `,
    [getCurrentTimestamp(), contestId]
  );

  await executeMutation(
    db,
    `
    UPDATE contest_states
    SET current_lift = NULL,
        current_round = 1,
        updated_at = ?
    WHERE contest_id = ?
    `,
    [getCurrentTimestamp(), contestId]
  );

  const attemptRow = await executeQueryOne<{ id: string }>(
    db,
    `
    SELECT id
    FROM attempts
    WHERE registration_id = ? AND lift_type = ? AND attempt_number = ?
    `,
    [current.registration_id, current.lift_type, current.attempt_number]
  );

  const attemptRecord = attemptRow?.id ? await getAttemptWithRelations(db, attemptRow.id, contestId) : null;

  if (contestId) {
    await publishEvent(c.env, contestId, {
      type: 'attempt.currentCleared',
      payload: attemptRecord ?? {
        attempt_id: attemptRow?.id ?? null,
        registration_id: current.registration_id,
        lift_type: current.lift_type,
        attempt_number: current.attempt_number,
      },
    });
  }

  return c.json({
    data: { success: true, cleared: true },
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
      comp.first_name, comp.last_name, comp.competition_order, r.lot_number,
      comp.first_name || ' ' || comp.last_name AS competitor_name
    FROM attempts a
    JOIN registrations r ON a.registration_id = r.id
    JOIN competitors comp ON r.competitor_id = comp.id
    WHERE r.contest_id = ? AND a.lift_type = ? AND a.attempt_number = ? AND a.status = 'Pending'
    ORDER BY comp.competition_order ASC, comp.last_name ASC, comp.first_name ASC
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
  const params: (string | number | null | boolean)[] = [];

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
  const contestId = contestRow?.contestId ? String(contestRow.contestId) : undefined;
  const updatedAttempt = await getAttemptWithRelations(db, attemptId, contestId);
  if (contestId) {
    await publishEvent(c.env, contestId, {
      type: 'attempt.resultUpdated',
      payload: updatedAttempt ?? {
        attempt_id: attemptId,
        status: input.status,
        judge1_decision: input.judge1Decision,
        judge2_decision: input.judge2Decision,
        judge3_decision: input.judge3Decision,
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

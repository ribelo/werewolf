import { Hono } from 'hono';
import type { Context } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { WerewolfEnvironment } from '../env';
import type { Database } from '../utils/database';
import { executeQuery, executeQueryOne, executeMutation, generateId, getCurrentTimestamp } from '../utils/database';
import { publishEvent } from '../live/publish';
import type { LiftType } from '@werewolf/domain/models/attempt';
import { attemptUpsertSchema, attemptResultUpdateSchema } from '@werewolf/domain/models/attempt';
import { ALL_LIFTS } from '@werewolf/domain/services/lifts';
import {
  ATTEMPT_PROJECTION_COLUMNS,
  CONTEST_ATTEMPT_COLUMNS,
  buildCurrentAttemptPayload,
  finalizeAttemptMutation,
  getAttemptWithRelations,
  listAttemptQueue,
  mapAttemptRows,
  mapContestAttemptRow,
  type AttemptRow,
  type ContestAttemptRow,
  type CurrentAttemptPayload,
} from '../services/attempts';
import { buildPlatePlan } from '../services/plate-plan';

const FLOAT_EPSILON = 1e-6;

/** Route params are optional to Hono's type system; the mount guarantees them. */
function missingIdentifiers(c: Context<WerewolfEnvironment>) {
  return c.json(
    {
      data: null,
      error: 'MISSING_IDENTIFIERS',
      requestId: c.get('requestId'),
    },
    400
  );
}

async function getRegistrationGender(
  db: Database,
  contestId: string,
  registrationId: string
): Promise<string | null | undefined> {
  const row = await executeQueryOne<{ gender: string | null }>(
    db,
    `
      SELECT c.gender
      FROM registrations r
      JOIN competitors c ON r.competitor_id = c.id
      WHERE r.id = ? AND r.contest_id = ?
    `,
    [registrationId, contestId]
  );

  if (!row) {
    return undefined;
  }

  return row.gender ?? null;
}

type AttemptWeightValidation =
  | { ok: true }
  | { ok: false; status?: number; error: string; details?: Record<string, unknown> };

/**
 * The plate planner is the single source of truth for loadable attempts: it
 * already loads the bar and both clamps for every target, so validation accepts
 * exactly what the published plate plan displays.
 */
async function validateAttemptWeight(
  db: Database,
  contestId: string,
  registrationId: string,
  weight: number
): Promise<AttemptWeightValidation> {
  if (!Number.isFinite(weight) || weight <= 0) {
    return {
      ok: false,
      error: 'INVALID_WEIGHT',
      details: { weight },
    };
  }

  const gender = await getRegistrationGender(db, contestId, registrationId);
  if (gender === undefined) {
    return {
      ok: false,
      status: 404,
      error: 'REGISTRATION_NOT_FOUND',
    };
  }

  const platePlan = await buildPlatePlan(db, contestId, weight, { gender: gender ?? null });
  const barWeight = platePlan.barWeight;
  const clampWeight = platePlan.clampWeight;
  const minimumWeight = barWeight + clampWeight;

  if (weight < minimumWeight - FLOAT_EPSILON) {
    return {
      ok: false,
      error: 'BELOW_BAR_WEIGHT',
      details: { weight, barWeight, clampWeight, minimumWeight },
    };
  }

  if (!platePlan.exact || Math.abs(platePlan.total - weight) > FLOAT_EPSILON) {
    return {
      ok: false,
      error: 'UNLOADABLE_WEIGHT',
      details: {
        weight,
        barWeight,
        clampWeight,
        increment: platePlan.increment,
        achievableWeight: platePlan.total,
      },
    };
  }

  return { ok: true };
}

export const registrationAttempts = new Hono<WerewolfEnvironment>();

// POST /contests/:contestId/registrations/:registrationId/attempts - Upsert attempt
registrationAttempts.post('/', zValidator('json', attemptUpsertSchema), async (c) => {
  const db = c.env.DB;
  const contestId = c.req.param('contestId');
  const registrationId = c.req.param('registrationId');
  const input = c.req.valid('json');

  if (!contestId || !registrationId) {
    return missingIdentifiers(c);
  }

  const activeLiftRows = await executeQuery<{ lift_type: LiftType }>(
    db,
    'SELECT lift_type FROM registration_lifts WHERE registration_id = ?',
    [registrationId]
  );
  const activeLifts = activeLiftRows.map((row) => row.lift_type).filter(Boolean);
  const allowedLifts: readonly LiftType[] = activeLifts.length > 0 ? activeLifts : ALL_LIFTS;
  if (!allowedLifts.includes(input.liftType)) {
    return c.json(
      {
        data: null,
        error: 'LIFT_NOT_REGISTERED',
        requestId: c.get('requestId'),
      },
      400
    );
  }

  const validation = await validateAttemptWeight(db, contestId, registrationId, input.weight);
  if (!validation.ok) {
    const response: Record<string, unknown> = {
      data: null,
      error: validation.error,
      requestId: c.get('requestId'),
    };
    if (validation.details) {
      response['details'] = validation.details;
    }
    const status = validation.status === 404 ? 404 : 400;
    return c.json(response, status);
  }

  // Check if attempt already exists
  const existing = await executeQueryOne<{ id: string }>(
    db,
    `
    SELECT id FROM attempts
    WHERE registration_id = ? AND lift_type = ? AND attempt_number = ?
    `,
    [registrationId, input.liftType, input.attemptNumber]
  );

  let attemptId: string;
  if (existing) {
    attemptId = existing.id;
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

  await finalizeAttemptMutation({
    env: c.env,
    db,
    contestId,
    registrationId,
    publish: async () => {
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

      // Refresh the display bundle when the edited attempt is the current one.
      const currentLift = await executeQueryOne<{ id: string }>(
        db,
        `SELECT id FROM current_lifts
         WHERE contest_id = ? AND registration_id = ?
         AND lift_type = ? AND attempt_number = ? AND is_active = true`,
        [contestId, registrationId, input.liftType, input.attemptNumber]
      );

      if (currentLift) {
        const bundle = await buildCurrentAttemptPayload(db, contestId, attemptId);
        if (bundle) {
          await publishEvent(c.env, contestId, {
            type: 'attempt.currentSet',
            payload: bundle,
          });
        }
      }
    },
  });

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

  const attempts = await executeQuery<AttemptRow>(
    db,
    `
    SELECT
      ${ATTEMPT_PROJECTION_COLUMNS}
    FROM attempts a
    WHERE a.registration_id = ?
    ORDER BY a.lift_type ASC, a.attempt_number ASC
    `,
    [registrationId]
  );

  return c.json({
    data: mapAttemptRows(attempts),
    error: null,
    requestId: c.get('requestId'),
  });
});

export const contestAttempts = new Hono<WerewolfEnvironment>();

// GET /contests/:contestId/attempts - List all attempts for contest
contestAttempts.get('/', async (c) => {
  const db = c.env.DB;
  const contestId = c.req.param('contestId');

  const attempts = await executeQuery<ContestAttemptRow>(
    db,
    `
    SELECT
      ${CONTEST_ATTEMPT_COLUMNS}
    FROM attempts a
    JOIN registrations r ON a.registration_id = r.id
    JOIN competitors comp ON r.competitor_id = comp.id
    WHERE r.contest_id = ?
    ORDER BY comp.last_name ASC, comp.first_name ASC,
      a.lift_type ASC, a.attempt_number ASC
    `,
    [contestId]
  );

  return c.json({
    data: attempts.map(mapContestAttemptRow),
    error: null,
    requestId: c.get('requestId'),
  });
});

// GET /contests/:contestId/attempts/current - Get current attempt
contestAttempts.get('/current', async (c) => {
  const db = c.env.DB;
  const contestId = c.req.param('contestId');
  if (!contestId) {
    return missingIdentifiers(c);
  }

  const currentLift = await executeQueryOne<{ id: string }>(
    db,
    `
    SELECT a.id
    FROM current_lifts cl
    JOIN attempts a ON cl.registration_id = a.registration_id
      AND cl.lift_type = a.lift_type
      AND cl.attempt_number = a.attempt_number
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

  const payload: CurrentAttemptPayload | null = await buildCurrentAttemptPayload(db, contestId, currentLift.id);

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
  if (!contestId) {
    return missingIdentifiers(c);
  }
  const { attemptId } = c.req.valid('json');

  // Get attempt details
  const attempt = await executeQueryOne<{
    registration_id: string;
    lift_type: LiftType;
    attempt_number: number;
    weight: number | null;
  }>(
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
  const contestState = await executeQueryOne<{ status: string }>(
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

  await finalizeAttemptMutation({
    env: c.env,
    db,
    contestId,
    registrationId: attempt.registration_id,
    publish: async () => {
      const payload = await buildCurrentAttemptPayload(db, contestId, attemptId);
      if (payload) {
        await publishEvent(c.env, contestId, {
          type: 'attempt.currentSet',
          payload,
        });
        return;
      }

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
    },
  });

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
  if (!contestId) {
    return missingIdentifiers(c);
  }

  const current = await executeQueryOne<{
    registration_id: string;
    lift_type: LiftType;
    attempt_number: number;
  }>(
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

  await finalizeAttemptMutation({
    env: c.env,
    db,
    contestId,
    registrationId: current.registration_id,
    publish: async () => {
      const attemptRecord = attemptRow?.id
        ? await getAttemptWithRelations(db, attemptRow.id, contestId)
        : null;

      await publishEvent(c.env, contestId, {
        type: 'attempt.currentCleared',
        payload: attemptRecord ?? {
          attempt_id: attemptRow?.id ?? null,
          registration_id: current.registration_id,
          lift_type: current.lift_type,
          attempt_number: current.attempt_number,
        },
      });
    },
  });

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
  if (!contestId) {
    return missingIdentifiers(c);
  }

  // Get contest state
  const contestState = await executeQueryOne<{ current_lift: string | null; current_round: number | null }>(
    db,
    'SELECT current_lift, current_round FROM contest_states WHERE contest_id = ?',
    [contestId]
  );

  const contestMeta = await executeQueryOne<{ active_flight: string | null }>(
    db,
    'SELECT active_flight FROM contests WHERE id = ?',
    [contestId]
  );

  const activeFlight = contestMeta?.active_flight ?? null;

  if (!contestState || !contestState.current_lift) {
    return c.json({
      data: [],
      error: null,
      requestId: c.get('requestId'),
    });
  }

  const queue = await listAttemptQueue(db, contestId, {
    liftType: contestState.current_lift,
    attemptNumber: contestState.current_round,
    flightCode: activeFlight,
  });

  return c.json({
    data: queue,
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

  const mutation = await executeMutation(
    db,
    `UPDATE attempts SET ${updates.join(', ')} WHERE id = ?`,
    params
  );

  if (mutation.changes === 0) {
    return c.json(
      {
        data: null,
        error: 'ATTEMPT_NOT_FOUND',
        requestId: c.get('requestId'),
      },
      404
    );
  }

  // Find contestId to broadcast to appropriate room
  const contestRow = await executeQueryOne<{ contestId: string; registrationId: string }>(
    db,
    `SELECT r.contest_id as contestId, a.registration_id as registrationId FROM attempts a JOIN registrations r ON a.registration_id = r.id WHERE a.id = ?`,
    [attemptId]
  );

  if (contestRow) {
    const contestId = String(contestRow.contestId);
    const registrationId = String(contestRow.registrationId);

    await finalizeAttemptMutation({
      env: c.env,
      db,
      contestId,
      registrationId,
      publish: async () => {
        const updatedAttempt = await getAttemptWithRelations(db, attemptId, contestId);
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

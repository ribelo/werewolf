import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { LiftType } from '@werewolf/domain';
import type { WerewolfEnvironment, WerewolfBindings } from '../env';
import { executeQuery, executeQueryOne, executeMutation, generateId, getCurrentTimestamp, convertKeysToCamelCase } from '../utils/database';
import { DEFAULT_PLATE_SET, getPlateColor } from '../utils/settings-helpers';
import { seedContestCategories } from '../utils/category-templates';
import { publishEvent } from '../live/publish';
import {
  contestLiftsFromRow,
  ensureLiftsForContest,
  normaliseLiftList,
  liftsEqual,
  replaceRegistrationLifts,
  removeAttemptsForInactiveLifts,
} from '../utils/lifts';
import { mapRegistrationRow } from '../utils/registration-map';
import { contestSchema, contestCreateSchema, contestUpdateSchema, contestStatusSchema } from '@werewolf/domain/models/contest';

const activeFlightSchema = z.object({
  activeFlight: z.string().min(1).nullable().optional(),
});

const contests = new Hono<WerewolfEnvironment>();

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

// GET /contests - List all contests
contests.get('/', async (c) => {
  const db = c.env.DB;

  const contests = await executeQuery(
    db,
    `
    SELECT
      id,
      name,
      date,
      location,
      discipline,
      status,
      federation_rules,
      competition_type,
      organizer,
      notes,
      is_archived,
      created_at,
      updated_at,
      mens_bar_weight,
      womens_bar_weight,
      clamp_weight,
      active_flight
    FROM contests
    ORDER BY date DESC
    `
  );

  return c.json({
    data: convertKeysToCamelCase(contests),
    error: null,
    requestId: c.get('requestId'),
  });
});

// POST /contests - Create new contest
contests.post('/', zValidator('json', contestCreateSchema), async (c) => {
  const db = c.env.DB;
  const input = c.req.valid('json');

  const id = generateId();
  const now = getCurrentTimestamp();

  await executeMutation(
    db,
    `
    INSERT INTO contests (
      id, name, date, location, discipline, status,
      federation_rules, competition_type, organizer, notes,
      is_archived, created_at, updated_at,
      mens_bar_weight, womens_bar_weight, clamp_weight, active_flight
    ) VALUES (?, ?, ?, ?, ?, 'Setup', ?, ?, ?, ?, false, ?, ?, 20, 15, 2.5, NULL)
    `,
    [
      id,
      input.name,
      input.date,
      input.location,
      input.discipline,
      input.federationRules || null,
      input.competitionType || null,
      input.organizer || null,
      input.notes || null,
      now,
      now,
    ]
  );

  // Create default plate sets for the contest
  await createDefaultPlateSets(db, id);
  await seedContestCategories(db, id);

  const contest = await executeQueryOne(
    db,
    `
    SELECT
      id, name, date, location, discipline, status,
      federation_rules, competition_type, organizer, notes,
      is_archived, created_at, updated_at,
      mens_bar_weight, womens_bar_weight, clamp_weight, active_flight
    FROM contests
    WHERE id = ?
    `,
    [id]
  );

  return c.json({
    data: convertKeysToCamelCase(contest),
    error: null,
    requestId: c.get('requestId'),
  }, 201);
});

// GET /contests/:contestId - Get single contest
contests.get('/:contestId', async (c) => {
  const db = c.env.DB;
  const contestId = c.req.param('contestId');

  const contest = await executeQueryOne(
    db,
    `
    SELECT
      id, name, date, location, discipline, status,
      federation_rules, competition_type, organizer, notes,
      is_archived, created_at, updated_at,
      mens_bar_weight, womens_bar_weight, clamp_weight, active_flight
    FROM contests
    WHERE id = ?
    `,
    [contestId]
  );

  if (!contest) {
    return c.json({ data: null, error: 'Contest not found', requestId: c.get('requestId') }, 404);
  }

  return c.json({
    data: convertKeysToCamelCase(contest),
    error: null,
    requestId: c.get('requestId'),
  });
});

// PATCH /contests/:contestId - Update contest
contests.patch('/:contestId', zValidator('json', contestUpdateSchema), async (c) => {
  const db = c.env.DB;
  const contestId = c.req.param('contestId');
  const input = c.req.valid('json');

  const existingContest = await executeQueryOne(
    db,
    `
    SELECT
      id, name, date, location, discipline, status,
      federation_rules, competition_type, organizer, notes,
      is_archived, created_at, updated_at,
      mens_bar_weight, womens_bar_weight, clamp_weight, active_flight
    FROM contests
    WHERE id = ?
    `,
    [contestId]
  );

  if (!existingContest) {
    return c.json({ data: null, error: 'Contest not found', requestId: c.get('requestId') }, 404);
  }

  // Build dynamic update query
  const updates: string[] = [];
  const params: any[] = [];

  if (input.name !== undefined) {
    updates.push('name = ?');
    params.push(input.name);
  }
  if (input.date !== undefined) {
    updates.push('date = ?');
    params.push(input.date);
  }
  if (input.location !== undefined) {
    updates.push('location = ?');
    params.push(input.location);
  }
  if (input.discipline !== undefined) {
    updates.push('discipline = ?');
    params.push(input.discipline);
  }
  if (input.status !== undefined) {
    updates.push('status = ?');
    params.push(input.status);
  }
  if (input.federationRules !== undefined) {
    updates.push('federation_rules = ?');
    params.push(input.federationRules);
  }
  if (input.competitionType !== undefined) {
    updates.push('competition_type = ?');
    params.push(input.competitionType);
  }
  if (input.organizer !== undefined) {
    updates.push('organizer = ?');
    params.push(input.organizer);
  }
  if (input.notes !== undefined) {
    updates.push('notes = ?');
    params.push(input.notes);
  }
  if (input.isArchived !== undefined) {
    updates.push('is_archived = ?');
    params.push(input.isArchived);
  }
  if (input.mensBarWeight !== undefined) {
    updates.push('mens_bar_weight = ?');
    params.push(input.mensBarWeight);
  }
  if (input.womensBarWeight !== undefined) {
    updates.push('womens_bar_weight = ?');
    params.push(input.womensBarWeight);
  }
  if (input.clampWeight !== undefined) {
    updates.push('clamp_weight = ?');
    params.push(input.clampWeight);
  }
  if (input.activeFlight !== undefined) {
    updates.push('active_flight = ?');
    params.push(input.activeFlight ?? null);
  }

  if (updates.length === 0) {
    return c.json({ data: null, error: 'No fields to update', requestId: c.get('requestId') }, 400);
  }

  updates.push('updated_at = ?');
  params.push(getCurrentTimestamp());
  params.push(contestId);

  await executeMutation(
    db,
    `UPDATE contests SET ${updates.join(', ')} WHERE id = ?`,
    params
  );

  const contest = await executeQueryOne(
    db,
    `
    SELECT
      id, name, date, location, discipline, status,
      federation_rules, competition_type, organizer, notes,
      is_archived, created_at, updated_at,
      mens_bar_weight, womens_bar_weight, clamp_weight, active_flight
    FROM contests
    WHERE id = ?
    `,
    [contestId]
  );

  if (!contest) {
    return c.json({ data: null, error: 'Contest not found', requestId: c.get('requestId') }, 404);
  }

  const previousLifts = contestLiftsFromRow(existingContest);
  const nextLifts = contestLiftsFromRow(contest);

  if (!liftsEqual(previousLifts, nextLifts)) {
    await syncContestRegistrationsForLifts(c.env, db, contestId, nextLifts as LiftType[]);
  }

  return c.json({
    data: convertKeysToCamelCase(contest),
    error: null,
    requestId: c.get('requestId'),
  });
});

contests.patch('/:contestId/active-flight', zValidator('json', activeFlightSchema), async (c) => {
  const db = c.env.DB;
  const contestId = c.req.param('contestId');
  const { activeFlight } = c.req.valid('json');

  const now = getCurrentTimestamp();

  const result = await executeMutation(
    db,
    'UPDATE contests SET active_flight = ?, updated_at = ? WHERE id = ?',
    [activeFlight ?? null, now, contestId]
  );

  if (result.changes === 0) {
    return c.json({ data: null, error: 'Contest not found', requestId: c.get('requestId') }, 404);
  }

  const contest = await executeQueryOne(
    db,
    `
    SELECT
      id, active_flight
    FROM contests
    WHERE id = ?
    `,
    [contestId]
  );

  return c.json({
    data: convertKeysToCamelCase(contest),
    error: null,
    requestId: c.get('requestId'),
  });
});

// DELETE /contests/:contestId - Delete contest
contests.delete('/:contestId', async (c) => {
  const db = c.env.DB;
  const contestId = c.req.param('contestId');

  const result = await executeMutation(
    db,
    'DELETE FROM contests WHERE id = ?',
    [contestId]
  );

  if (result.changes === 0) {
    return c.json({ data: null, error: 'Contest not found', requestId: c.get('requestId') }, 404);
  }

  return c.json({
    data: { success: true },
    error: null,
    requestId: c.get('requestId'),
  });
});

// GET /contests/:contestId/state - Get contest state
contests.get('/:contestId/state', async (c) => {
  const db = c.env.DB;
  const contestId = c.req.param('contestId');

  const state = await executeQueryOne(
    db,
    `
    SELECT
      contest_id,
      status,
      current_lift,
      current_round
    FROM contest_states
    WHERE contest_id = ?
    `,
    [contestId]
  );

  if (!state) {
    // Return default state if none exists
    return c.json({
      data: {
        contestId: contestId,
        status: 'Setup',
        currentLift: null,
        currentRound: 1,
      },
      error: null,
      requestId: c.get('requestId'),
    });
  }

  return c.json({
    data: convertKeysToCamelCase(state),
    error: null,
    requestId: c.get('requestId'),
  });
});

// PUT /contests/:contestId/state - Update contest state
contests.put('/:contestId/state', zValidator('json', z.object({
  status: contestStatusSchema.optional(),
  currentLift: z.enum(['Bench', 'Squat', 'Deadlift']).nullable().optional(),
  currentRound: z.number().int().min(1).optional(),
})), async (c) => {
  const db = c.env.DB;
  const contestId = c.req.param('contestId');
  const input = c.req.valid('json');

  // Check if state exists
  const existing = await executeQueryOne(
    db,
    'SELECT contest_id FROM contest_states WHERE contest_id = ?',
    [contestId]
  );

  if (!existing) {
    // Create new state
    await executeMutation(
      db,
      `
      INSERT INTO contest_states (contest_id, status, current_lift, current_round)
      VALUES (?, ?, ?, ?)
      `,
      [
        contestId,
        input.status || 'Setup',
        input.currentLift || null,
        input.currentRound || 1,
      ]
    );
  } else {
    // Update existing state
    const updates: string[] = [];
    const params: any[] = [];

    if (input.status !== undefined) {
      updates.push('status = ?');
      params.push(input.status);
    }
    if (input.currentLift !== undefined) {
      updates.push('current_lift = ?');
      params.push(input.currentLift);
    }
    if (input.currentRound !== undefined) {
      updates.push('current_round = ?');
      params.push(input.currentRound);
    }

    if (updates.length > 0) {
      params.push(contestId);
      await executeMutation(
        db,
        `UPDATE contest_states SET ${updates.join(', ')} WHERE contest_id = ?`,
        params
      );
    }
  }

  const state = await executeQueryOne(
    db,
    `
    SELECT
      contest_id,
      status,
      current_lift,
      current_round
    FROM contest_states
    WHERE contest_id = ?
    `,
    [contestId]
  );

  return c.json({
    data: convertKeysToCamelCase(state),
    error: null,
    requestId: c.get('requestId'),
  });
});

export default contests;

async function syncContestRegistrationsForLifts(
  env: WerewolfBindings,
  db: D1Database,
  contestId: string,
  contestLifts: LiftType[],
) {
  const registrations = await executeQuery<{
    id: string;
    rack_height_squat: number | null;
    rack_height_bench: number | null;
  }>(
    db,
    `SELECT id, rack_height_squat, rack_height_bench FROM registrations WHERE contest_id = ?`,
    [contestId]
  );

  if (registrations.length === 0) {
    return;
  }

  for (const registration of registrations) {
    const currentLiftRows = await executeQuery<{ lift_type: LiftType }>(
      db,
      'SELECT lift_type FROM registration_lifts WHERE registration_id = ?',
      [registration.id]
    );
    const currentLifts = normaliseLiftList(currentLiftRows.map((row) => row.lift_type as LiftType));
    const nextLifts = ensureLiftsForContest(currentLifts, contestLifts);

    const liftsChanged = !liftsEqual(currentLifts, nextLifts);

    const rackUpdates: string[] = [];
    const rackParams: any[] = [];

    if (!nextLifts.includes('Squat') && registration.rack_height_squat !== null) {
      rackUpdates.push('rack_height_squat = NULL');
    }
    if (!nextLifts.includes('Bench') && registration.rack_height_bench !== null) {
      rackUpdates.push('rack_height_bench = NULL');
    }

    if (liftsChanged) {
      await replaceRegistrationLifts(db, registration.id, nextLifts);
    }

    if (rackUpdates.length > 0) {
      rackUpdates.push('updated_at = ?');
      rackParams.push(getCurrentTimestamp());
      rackParams.push(registration.id);
      await executeMutation(
        db,
        `UPDATE registrations SET ${rackUpdates.join(', ')} WHERE id = ?`,
        rackParams
      );
    }

    if (liftsChanged || rackUpdates.length > 0) {
      await removeAttemptsForInactiveLifts(env, contestId, db, registration.id, nextLifts);

      const refreshed = await executeQueryOne(
        db,
        `
        SELECT
          r.id, r.contest_id, r.competitor_id, r.age_category_id, r.weight_class_id,
          r.bodyweight, r.reshel_coefficient, r.mccullough_coefficient,
          r.rack_height_squat, r.rack_height_bench, r.created_at,
          r.flight_code, r.flight_order, COALESCE(r.labels, '[]') AS labels,
          ${REGISTRATION_LIFTS_JSON},
          c.first_name, c.last_name, c.gender, c.birth_date, c.club, c.city,
          cac.name AS age_category_name,
          cwc.name AS weight_class_name
        FROM registrations r
        JOIN competitors c ON r.competitor_id = c.id
        LEFT JOIN contest_age_categories cac ON r.age_category_id = cac.id
        LEFT JOIN contest_weight_classes cwc ON r.weight_class_id = cwc.id
        WHERE r.id = ?
        `,
        [registration.id]
      );

      if (refreshed) {
        const payload = mapRegistrationRow(convertKeysToCamelCase(refreshed));
        await publishEvent(env, contestId, {
          type: 'registration.upserted',
          payload,
        });
      }
    }
  }
}

// Helper function to create default plate sets
async function createDefaultPlateSets(db: D1Database, contestId: string) {
  const defaultPlates = loadPlateSetFromSettings();

  for (const plate of defaultPlates) {
    try {
      await executeMutation(
        db,
        `
        INSERT INTO plate_sets (contest_id, plate_weight, quantity, color)
        VALUES (?, ?, ?, ?)
        `,
        [contestId, plate.weight, plate.quantity, plate.color ?? getPlateColor(plate.weight)]
      );
    } catch (error) {
      console.warn(`Failed to create plate set for ${plate.weight}kg:`, error);
    }
  }
}

function loadPlateSetFromSettings() {
  return DEFAULT_PLATE_SET.map((plate) => ({ ...plate }));
}

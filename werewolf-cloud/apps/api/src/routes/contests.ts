import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { WerewolfEnvironment } from '../env';
import { executeQuery, executeQueryOne, executeMutation, generateId, getCurrentTimestamp, convertKeysToCamelCase } from '../utils/database';
import { sanitizePlateSet, DEFAULT_PLATE_SET, getPlateColor, sanitizeSettings } from '../utils/settings-helpers';
import { contestSchema, contestCreateSchema, contestUpdateSchema, contestStatusSchema } from '@werewolf/domain/models/contest';

const contests = new Hono<WerewolfEnvironment>();

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
      bar_weight
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
      mens_bar_weight, womens_bar_weight, bar_weight
    ) VALUES (?, ?, ?, ?, ?, 'Setup', ?, ?, ?, ?, false, ?, ?, 20, 15, 20)
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

  const contest = await executeQueryOne(
    db,
    `
    SELECT
      id, name, date, location, discipline, status,
      federation_rules, competition_type, organizer, notes,
      is_archived, created_at, updated_at,
      mens_bar_weight, womens_bar_weight, bar_weight
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
      mens_bar_weight, womens_bar_weight, bar_weight
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
      mens_bar_weight, womens_bar_weight, bar_weight
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

// Helper function to create default plate sets
async function createDefaultPlateSets(db: D1Database, contestId: string) {
  const defaultPlates = await loadPlateSetFromSettings(db);

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

async function loadPlateSetFromSettings(db: D1Database) {
  const row = await executeQueryOne(db, 'SELECT data FROM settings WHERE id = 1');

  if (!row) {
    return DEFAULT_PLATE_SET.map((plate) => ({ ...plate }));
  }

  try {
    const settingsData = sanitizeSettings(JSON.parse(row.data));
    const plateSet = sanitizePlateSet(settingsData.competition.defaultPlateSet);
    return plateSet.map((plate) => ({ ...plate }));
  } catch (error) {
    console.warn('Failed to parse default plate set from settings:', error);
    return DEFAULT_PLATE_SET.map((plate) => ({ ...plate }));
  }
}

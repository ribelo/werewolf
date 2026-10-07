import { Hono } from 'hono';
import type { Context } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { WerewolfEnvironment } from '../env';
import type { Database } from '../utils/database';
import { executeQuery, executeQueryOne, executeMutation, convertKeysToCamelCase } from '../utils/database';
import { buildPlatePlan } from '../services/plate-plan';
import { defaultPlateColor } from '@werewolf/domain/services/plate-plan';

const plateSets = new Hono<WerewolfEnvironment>();

async function contestExists(db: Database, contestId: string): Promise<boolean> {
  const contest = await executeQueryOne<{ id: string }>(
    db,
    'SELECT id FROM contests WHERE id = ?',
    [contestId]
  );
  return contest !== null;
}

const contestNotFound = (c: Context<WerewolfEnvironment>) =>
  c.json({ data: null, error: 'Contest not found', requestId: c.get('requestId') }, 404);

// POST /contests/:contestId/platesets - Create plate set
plateSets.post('/', zValidator('json', z.object({
  plateWeight: z.number().positive(),
  quantity: z.number().int().nonnegative(),
  color: z.string().optional(),
})), async (c) => {
  const db = c.env.DB;
  const contestId = c.req.param('contestId') ?? '';
  const { plateWeight, quantity, color } = c.req.valid('json');

  if (!(await contestExists(db, contestId))) {
    return contestNotFound(c);
  }

  await executeMutation(
    db,
    `
    INSERT OR REPLACE INTO plate_sets (contest_id, plate_weight, quantity, color)
    VALUES (?, ?, ?, ?)
    `,
    [contestId, plateWeight, quantity, color || defaultPlateColor(plateWeight)]
  );

  return c.json({
    data: { success: true },
    error: null,
    requestId: c.get('requestId'),
  });
});

// GET /contests/:contestId/platesets - List plate sets
plateSets.get('/', async (c) => {
  const db = c.env.DB;
  const contestId = c.req.param('contestId') ?? '';

  if (!(await contestExists(db, contestId))) {
    return contestNotFound(c);
  }

  const plateSets = await executeQuery(
    db,
    `
    SELECT contest_id, plate_weight, quantity, color
    FROM plate_sets
    WHERE contest_id = ?
    ORDER BY plate_weight DESC
    `,
    [contestId]
  );

  return c.json({
    data: convertKeysToCamelCase(plateSets),
    error: null,
    requestId: c.get('requestId'),
  });
});

const hexColor = /^#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

// PATCH /contests/:contestId/platesets/:plateWeight - Update plate quantity or color
plateSets.patch('/:plateWeight', zValidator('json', z.object({
  quantity: z.number().int().nonnegative().optional(),
  color: z.string().regex(hexColor).optional(),
}).refine((payload) => payload.quantity !== undefined || payload.color !== undefined, {
  message: 'No fields to update',
})), async (c) => {
  const db = c.env.DB;
  const contestId = c.req.param('contestId') ?? '';
  const plateWeight = parseFloat(c.req.param('plateWeight'));
  const { quantity, color } = c.req.valid('json');

  if (!(await contestExists(db, contestId))) {
    return contestNotFound(c);
  }

  const updates: string[] = [];
  const params: (number | string)[] = [];

  if (quantity !== undefined) {
    updates.push('quantity = ?');
    params.push(quantity);
  }

  if (color !== undefined) {
    updates.push('color = ?');
    params.push(color);
  }

  if (updates.length === 0) {
    return c.json({ data: null, error: 'No fields to update', requestId: c.get('requestId') }, 400);
  }

  await executeMutation(
    db,
    `
    UPDATE plate_sets
    SET ${updates.join(', ')}
    WHERE contest_id = ? AND plate_weight = ?
    `,
    [...params, contestId, plateWeight]
  );

  return c.json({
    data: { success: true },
    error: null,
    requestId: c.get('requestId'),
  });
});

// DELETE /contests/:contestId/platesets/:plateWeight - Delete plate set
plateSets.delete('/:plateWeight', async (c) => {
  const db = c.env.DB;
  const contestId = c.req.param('contestId') ?? '';
  const plateWeight = parseFloat(c.req.param('plateWeight'));

  if (!(await contestExists(db, contestId))) {
    return contestNotFound(c);
  }

  const result = await executeMutation(
    db,
    'DELETE FROM plate_sets WHERE contest_id = ? AND plate_weight = ?',
    [contestId, plateWeight]
  );

  if (result.changes === 0) {
    return c.json({ data: null, error: 'Plate set not found', requestId: c.get('requestId') }, 404);
  }

  return c.json({
    data: { success: true },
    error: null,
    requestId: c.get('requestId'),
  });
});

// POST /contests/:contestId/platesets/calculate - Calculate plates for weight
plateSets.post('/calculate', zValidator('json', z.object({
  targetWeight: z.number().positive(),
  barWeight: z.number().positive().optional(),
})), async (c) => {
  const db = c.env.DB;
  const contestId = c.req.param('contestId') ?? '';
  const { targetWeight, barWeight } = c.req.valid('json');

  if (!(await contestExists(db, contestId))) {
    return contestNotFound(c);
  }

  const plan = await buildPlatePlan(db, contestId, targetWeight, { barWeightOverride: barWeight ?? null });

  return c.json({
    data: {
      plates: convertKeysToCamelCase(plan.plates),
      totalLoaded: plan.total,
      exact: plan.exact,
      increment: plan.increment,
      barWeight: plan.barWeight,
      weightToLoad: plan.weightToLoad,
      targetWeight: plan.targetWeight,
      clampWeight: plan.clampWeight,
      clampWeightPerClamp: plan.clampWeightPerClamp,
    },
    error: null,
    requestId: c.get('requestId'),
  });
});

// GET /contests/:contestId/barweights - Get bar weights
plateSets.get('/barweights', async (c) => {
  const db = c.env.DB;
  const contestId = c.req.param('contestId') ?? '';

  const contest = await executeQueryOne(
    db,
    'SELECT mens_bar_weight, womens_bar_weight, clamp_weight FROM contests WHERE id = ?',
    [contestId]
  );

  if (!contest) {
    return contestNotFound(c);
  }

  return c.json({
    data: {
      mensBarWeight: contest.mens_bar_weight,
      womensBarWeight: contest.womens_bar_weight,
      clampWeight: contest.clamp_weight,
    },
    error: null,
    requestId: c.get('requestId'),
  });
});

// PUT /contests/:contestId/barweights - Update bar weights
plateSets.put('/barweights', zValidator('json', z.object({
  mensBarWeight: z.number().positive().optional(),
  womensBarWeight: z.number().positive().optional(),
  clampWeight: z.number().positive().optional(),
})), async (c) => {
  const db = c.env.DB;
  const contestId = c.req.param('contestId') ?? '';
  const { mensBarWeight, womensBarWeight, clampWeight } = c.req.valid('json');

  if (!(await contestExists(db, contestId))) {
    return contestNotFound(c);
  }

  const updates: string[] = [];
  const params: (number | string)[] = [];

  if (mensBarWeight !== undefined) {
    updates.push('mens_bar_weight = ?');
    params.push(mensBarWeight);
  }
  if (womensBarWeight !== undefined) {
    updates.push('womens_bar_weight = ?');
    params.push(womensBarWeight);
  }
  if (clampWeight !== undefined) {
    updates.push('clamp_weight = ?');
    params.push(clampWeight);
  }

  if (updates.length === 0) {
    return c.json({ data: null, error: 'No fields to update', requestId: c.get('requestId') }, 400);
  }

  params.push(contestId);

  await executeMutation(
    db,
    `UPDATE contests SET ${updates.join(', ')} WHERE id = ?`,
    params
  );

  return c.json({
    data: { success: true },
    error: null,
    requestId: c.get('requestId'),
  });
});

// GET /contests/:contestId/platesets/colors - Get plate colors
plateSets.get('/colors', async (c) => {
  const db = c.env.DB;
  const contestId = c.req.param('contestId') ?? '';

  if (!(await contestExists(db, contestId))) {
    return contestNotFound(c);
  }

  const colors = await executeQuery(
    db,
    `
    SELECT DISTINCT plate_weight, color
    FROM plate_sets
    WHERE contest_id = ?
    ORDER BY plate_weight DESC
    `,
    [contestId]
  );

  return c.json({
    data: convertKeysToCamelCase(colors),
    error: null,
    requestId: c.get('requestId'),
  });
});

export default plateSets;

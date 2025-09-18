import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { WerewolfEnvironment } from '../env';
import { executeQuery, executeQueryOne, executeMutation, getCurrentTimestamp, convertKeysToCamelCase } from '../utils/database';

const plateSets = new Hono<WerewolfEnvironment>();

// POST /contests/:contestId/platesets - Create plate set
plateSets.post('/', zValidator('json', z.object({
  plateWeight: z.number().positive(),
  quantity: z.number().int().nonnegative(),
  color: z.string().optional(),
})), async (c) => {
  const db = c.env.DB;
  const contestId = c.req.param('contestId');
  const { plateWeight, quantity, color } = c.req.valid('json');

  await executeMutation(
    db,
    `
    INSERT OR REPLACE INTO plate_sets (contest_id, plate_weight, quantity, color)
    VALUES (?, ?, ?, ?)
    `,
    [contestId, plateWeight, quantity, color || getDefaultPlateColor(plateWeight)]
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
  const contestId = c.req.param('contestId');

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

// PATCH /contests/:contestId/platesets/:plateWeight - Update plate quantity
plateSets.patch('/:plateWeight', zValidator('json', z.object({
  quantity: z.number().int().nonnegative(),
})), async (c) => {
  const db = c.env.DB;
  const contestId = c.req.param('contestId');
  const plateWeight = parseFloat(c.req.param('plateWeight'));
  const { quantity } = c.req.valid('json');

  await executeMutation(
    db,
    `
    UPDATE plate_sets
    SET quantity = ?
    WHERE contest_id = ? AND plate_weight = ?
    `,
    [quantity, contestId, plateWeight]
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
  const contestId = c.req.param('contestId');
  const plateWeight = parseFloat(c.req.param('plateWeight'));

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
  const contestId = c.req.param('contestId');
  const { targetWeight, barWeight } = c.req.valid('json');

  // Get bar weight from contest or use provided/default
  let actualBarWeight = barWeight;
  if (!actualBarWeight) {
    const contest = await executeQueryOne(
      db,
      'SELECT bar_weight FROM contests WHERE id = ?',
      [contestId]
    );
    actualBarWeight = contest?.bar_weight || 20;
  }

  // Ensure we have a valid bar weight
  const barWeightValue = actualBarWeight || 20;

  // Calculate weight to load (target - bar)
  const weightToLoad = targetWeight - barWeightValue;
  if (weightToLoad <= 0) {
    return c.json({
      data: { plates: [], totalLoaded: actualBarWeight },
      error: null,
      requestId: c.get('requestId'),
    });
  }

  // Get available plates
  const availablePlates = await executeQuery(
    db,
    `
    SELECT plate_weight, quantity, color
    FROM plate_sets
    WHERE contest_id = ? AND quantity > 0
    ORDER BY plate_weight DESC
    `,
    [contestId]
  );

  const plates = calculatePlates(weightToLoad, availablePlates);

  return c.json({
    data: {
      plates: convertKeysToCamelCase(plates),
      totalLoaded: barWeightValue + (plates.reduce((sum, p) => sum + (p.plateWeight * 2 * p.count), 0)),
    },
    error: null,
    requestId: c.get('requestId'),
  });
});

// GET /contests/:contestId/barweights - Get bar weights
plateSets.get('/barweights', async (c) => {
  const db = c.env.DB;
  const contestId = c.req.param('contestId');

  const contest = await executeQueryOne(
    db,
    'SELECT mens_bar_weight, womens_bar_weight, bar_weight FROM contests WHERE id = ?',
    [contestId]
  );

  if (!contest) {
    return c.json({ data: null, error: 'Contest not found', requestId: c.get('requestId') }, 404);
  }

  return c.json({
    data: {
      mensBarWeight: contest.mens_bar_weight,
      womensBarWeight: contest.womens_bar_weight,
      barWeight: contest.bar_weight,
    },
    error: null,
    requestId: c.get('requestId'),
  });
});

// PUT /contests/:contestId/barweights - Update bar weights
plateSets.put('/barweights', zValidator('json', z.object({
  mensBarWeight: z.number().positive().optional(),
  womensBarWeight: z.number().positive().optional(),
  defaultBarWeight: z.number().positive().optional(),
})), async (c) => {
  const db = c.env.DB;
  const contestId = c.req.param('contestId');
  const { mensBarWeight, womensBarWeight, defaultBarWeight } = c.req.valid('json');

  const updates: string[] = [];
  const params: any[] = [];

  if (mensBarWeight !== undefined) {
    updates.push('mens_bar_weight = ?');
    params.push(mensBarWeight);
  }
  if (womensBarWeight !== undefined) {
    updates.push('womens_bar_weight = ?');
    params.push(womensBarWeight);
  }
  if (defaultBarWeight !== undefined) {
    updates.push('bar_weight = ?');
    params.push(defaultBarWeight);
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
  const contestId = c.req.param('contestId');

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

// Helper functions

// Helper function to get plate color based on weight (hex codes matching migration defaults)
function getDefaultPlateColor(weight: number): string {
  switch (weight) {
    case 25:
    case 2.5:
      return '#DC2626'; // red
    case 20:
    case 2:
      return '#2563EB'; // blue
    case 15:
    case 1.5:
      return '#EAB308'; // yellow
    case 10:
    case 1.25:
    case 1:
      return '#16A34A'; // green
    case 5:
      return '#F8FAFC'; // white
    case 0.5:
      return '#6B7280'; // gray
    default:
      return '#374151'; // default gray
  }
}

function calculatePlates(weightToLoad: number, availablePlates: any[]) {
  const plates: { plateWeight: number; count: number; color: string }[] = [];
  let remainingWeight = weightToLoad / 2; // Since plates come in pairs

  for (const plate of availablePlates) {
    if (remainingWeight <= 0) break;

    const plateWeight = plate.plate_weight;
    const availableCount = plate.quantity;
    const color = plate.color;

    if (plateWeight <= remainingWeight) {
      const count = Math.min(
        Math.floor(remainingWeight / plateWeight),
        availableCount
      );

      if (count > 0) {
        plates.push({ plateWeight, count, color });
        remainingWeight -= count * plateWeight;
      }
    }
  }

  return plates;
}

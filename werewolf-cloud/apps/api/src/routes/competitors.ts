import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { WerewolfEnvironment } from '../env';
import { executeQuery, executeQueryOne, executeMutation, generateId, getCurrentTimestamp, convertKeysToCamelCase } from '../utils/database';
import { competitorSchema, competitorCreateSchema, competitorUpdateSchema } from '@werewolf/domain/models/competitor';

const competitors = new Hono<WerewolfEnvironment>();

// GET /competitors - List all competitors
competitors.get('/', async (c) => {
  const db = c.env.DB;

  const competitors = await executeQuery(
    db,
    `
    SELECT
      id,
      first_name,
      last_name,
      birth_date,
      gender,
      club,
      city,
      notes,
      photo_format,
      photo_metadata,
      competition_order,
      created_at,
      updated_at
    FROM competitors
    ORDER BY competition_order ASC, last_name ASC, first_name ASC
    `
  );

  return c.json({
    data: convertKeysToCamelCase(competitors),
    error: null,
    requestId: c.get('requestId'),
  });
});

// POST /competitors - Create new competitor
competitors.post('/', zValidator('json', competitorCreateSchema), async (c) => {
  const db = c.env.DB;
  const input = c.req.valid('json');

  const id = generateId();
  const now = getCurrentTimestamp();

  // Get next competition order
  const maxOrder = await executeQueryOne(
    db,
    'SELECT MAX(competition_order) as max_order FROM competitors'
  );
  const nextOrder = (maxOrder?.max_order || 0) + 1;

  await executeMutation(
    db,
    `
    INSERT INTO competitors (
      id, first_name, last_name, birth_date, gender,
      club, city, notes, competition_order,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      id,
      input.firstName,
      input.lastName,
      input.birthDate,
      input.gender,
      input.club || null,
      input.city || null,
      input.notes || null,
      nextOrder,
      now,
      now,
    ]
  );

  const competitor = await executeQueryOne(
    db,
    `
    SELECT
      id, first_name, last_name, birth_date, gender,
      club, city, notes, photo_format, photo_metadata,
      competition_order, created_at, updated_at
    FROM competitors
    WHERE id = ?
    `,
    [id]
  );

  return c.json({
    data: convertKeysToCamelCase(competitor),
    error: null,
    requestId: c.get('requestId'),
  }, 201);
});

// GET /competitors/:competitorId - Get single competitor
competitors.get('/:competitorId', async (c) => {
  const db = c.env.DB;
  const competitorId = c.req.param('competitorId');

  const competitor = await executeQueryOne(
    db,
    `
    SELECT
      id, first_name, last_name, birth_date, gender,
      club, city, notes, photo_format, photo_metadata,
      competition_order, created_at, updated_at
    FROM competitors
    WHERE id = ?
    `,
    [competitorId]
  );

  if (!competitor) {
    return c.json({ data: null, error: 'Competitor not found', requestId: c.get('requestId') }, 404);
  }

  return c.json({
    data: convertKeysToCamelCase(competitor),
    error: null,
    requestId: c.get('requestId'),
  });
});

// PATCH /competitors/:competitorId - Update competitor
competitors.patch('/:competitorId', zValidator('json', competitorUpdateSchema), async (c) => {
  const db = c.env.DB;
  const competitorId = c.req.param('competitorId');
  const input = c.req.valid('json');

  const updates: string[] = [];
  const params: any[] = [];

  if (input.firstName !== undefined) {
    updates.push('first_name = ?');
    params.push(input.firstName);
  }
  if (input.lastName !== undefined) {
    updates.push('last_name = ?');
    params.push(input.lastName);
  }
  if (input.birthDate !== undefined) {
    updates.push('birth_date = ?');
    params.push(input.birthDate);
  }
  if (input.gender !== undefined) {
    updates.push('gender = ?');
    params.push(input.gender);
  }
  if (input.club !== undefined) {
    updates.push('club = ?');
    params.push(input.club);
  }
  if (input.city !== undefined) {
    updates.push('city = ?');
    params.push(input.city);
  }
  if (input.notes !== undefined) {
    updates.push('notes = ?');
    params.push(input.notes);
  }
  if (input.competitionOrder !== undefined) {
    updates.push('competition_order = ?');
    params.push(input.competitionOrder);
  }

  if (updates.length === 0) {
    return c.json({ data: null, error: 'No fields to update', requestId: c.get('requestId') }, 400);
  }

  updates.push('updated_at = ?');
  params.push(getCurrentTimestamp());
  params.push(competitorId);

  await executeMutation(
    db,
    `UPDATE competitors SET ${updates.join(', ')} WHERE id = ?`,
    params
  );

  const competitor = await executeQueryOne(
    db,
    `
    SELECT
      id, first_name, last_name, birth_date, gender,
      club, city, notes, photo_format, photo_metadata,
      competition_order, created_at, updated_at
    FROM competitors
    WHERE id = ?
    `,
    [competitorId]
  );

  if (!competitor) {
    return c.json({ data: null, error: 'Competitor not found', requestId: c.get('requestId') }, 404);
  }

  return c.json({
    data: convertKeysToCamelCase(competitor),
    error: null,
    requestId: c.get('requestId'),
  });
});

// DELETE /competitors/:competitorId - Delete competitor
competitors.delete('/:competitorId', async (c) => {
  const db = c.env.DB;
  const competitorId = c.req.param('competitorId');

  const result = await executeMutation(
    db,
    'DELETE FROM competitors WHERE id = ?',
    [competitorId]
  );

  if (result.changes === 0) {
    return c.json({ data: null, error: 'Competitor not found', requestId: c.get('requestId') }, 404);
  }

  return c.json({
    data: { success: true },
    error: null,
    requestId: c.get('requestId'),
  });
});

// PUT /competitors/:competitorId/photo - Upload photo
competitors.put('/:competitorId/photo', zValidator('json', z.object({
  photoData: z.string(), // base64 encoded
  filename: z.string().optional(),
})), async (c) => {
  const db = c.env.DB;
  const competitorId = c.req.param('competitorId');
  const { photoData, filename } = c.req.valid('json');

  try {
    // Decode base64 to bytes
    const photoBytes = Uint8Array.from(atob(photoData), c => c.charCodeAt(0));

    // Determine format from filename or default to webp
    const format = filename ? getImageFormat(filename) : 'webp';

    // Create metadata
    const metadata = JSON.stringify({
      originalFilename: filename || 'photo',
      size: photoBytes.length,
      uploadedAt: getCurrentTimestamp(),
    });

    await executeMutation(
      db,
      `
      UPDATE competitors
      SET photo_data = ?, photo_format = ?, photo_metadata = ?, updated_at = ?
      WHERE id = ?
      `,
      [photoBytes, format, metadata, getCurrentTimestamp(), competitorId]
    );

    return c.json({
      data: { success: true },
      error: null,
      requestId: c.get('requestId'),
    });
  } catch (error) {
    console.error('Photo upload error:', error);
    return c.json({ data: null, error: 'Failed to process photo', requestId: c.get('requestId') }, 400);
  }
});

// DELETE /competitors/:competitorId/photo - Remove photo
competitors.delete('/:competitorId/photo', async (c) => {
  const db = c.env.DB;
  const competitorId = c.req.param('competitorId');

  await executeMutation(
    db,
    `
    UPDATE competitors
    SET photo_data = NULL, photo_format = NULL, photo_metadata = NULL, updated_at = ?
    WHERE id = ?
    `,
    [getCurrentTimestamp(), competitorId]
  );

  return c.json({
    data: { success: true },
    error: null,
    requestId: c.get('requestId'),
  });
});

// GET /competitors/:competitorId/photo - Get photo
competitors.get('/:competitorId/photo', async (c) => {
  const db = c.env.DB;
  const competitorId = c.req.param('competitorId');

  const photo = await executeQueryOne(
    db,
    'SELECT photo_data, photo_format FROM competitors WHERE id = ? AND photo_data IS NOT NULL',
    [competitorId]
  );

  if (!photo) {
    return c.json({ data: null, error: 'Photo not found', requestId: c.get('requestId') }, 404);
  }

  // Convert bytes to base64
  const base64Data = btoa(String.fromCharCode(...new Uint8Array(photo.photo_data)));

  return c.json({
    data: {
      data: base64Data,
      format: photo.photo_format,
    },
    error: null,
    requestId: c.get('requestId'),
  });
});

// POST /competitors/:competitorId/reorder - Move competition order
competitors.post('/:competitorId/reorder', zValidator('json', z.object({
  newOrder: z.number().int().min(1),
})), async (c) => {
  const db = c.env.DB;
  const competitorId = c.req.param('competitorId');
  const { newOrder } = c.req.valid('json');

  // Get total competitors count
  const count = await executeQueryOne(
    db,
    'SELECT COUNT(*) as total FROM competitors'
  );

  if (newOrder > count.total) {
    return c.json({ data: null, error: `Order ${newOrder} exceeds total competitors (${count.total})`, requestId: c.get('requestId') }, 400);
  }

  // Get current order of the competitor
  const current = await executeQueryOne(
    db,
    'SELECT competition_order FROM competitors WHERE id = ?',
    [competitorId]
  );

  if (!current) {
    return c.json({ data: null, error: 'Competitor not found', requestId: c.get('requestId') }, 404);
  }

  const currentOrder = current.competition_order;

  if (currentOrder === newOrder) {
    return c.json({
      data: { success: true },
      error: null,
      requestId: c.get('requestId'),
    }); // No change needed
  }

  // Shift other competitors
  if (newOrder < currentOrder) {
    // Moving up - shift others down
    await executeMutation(
      db,
      `
      UPDATE competitors
      SET competition_order = competition_order + 1, updated_at = ?
      WHERE competition_order >= ? AND competition_order < ? AND id != ?
      `,
      [getCurrentTimestamp(), newOrder, currentOrder, competitorId]
    );
  } else {
    // Moving down - shift others up
    await executeMutation(
      db,
      `
      UPDATE competitors
      SET competition_order = competition_order - 1, updated_at = ?
      WHERE competition_order > ? AND competition_order <= ? AND id != ?
      `,
      [getCurrentTimestamp(), currentOrder, newOrder, competitorId]
    );
  }

  // Update the target competitor
  await executeMutation(
    db,
    `
    UPDATE competitors
    SET competition_order = ?, updated_at = ?
    WHERE id = ?
    `,
    [newOrder, getCurrentTimestamp(), competitorId]
  );

  return c.json({
    data: { success: true },
    error: null,
    requestId: c.get('requestId'),
  });
});

export default competitors;

// Helper function to determine image format from filename
function getImageFormat(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop();
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'jpeg';
    case 'png':
      return 'png';
    case 'webp':
      return 'webp';
    default:
      return 'webp'; // Default fallback
  }
}

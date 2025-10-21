import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { WerewolfEnvironment, WerewolfBindings } from '../env';
import { executeQuery, executeQueryOne, executeMutation, generateId, getCurrentTimestamp, convertKeysToCamelCase } from '../utils/database';
import { competitorSchema, competitorCreateSchema, competitorUpdateSchema } from '@werewolf/domain/models/competitor';
import { publishEvent } from '../live/publish';
import { determineAgeCategory, determineWeightClass } from '@werewolf/domain/services/coefficients';
import { getReshelCoefficient, getMcCulloughCoefficient } from '../services/coefficients';
import { getContestAgeDescriptors, getContestWeightDescriptors } from '../utils/category-templates';
import { mapRegistrationRow } from '../utils/registration-map';

const competitors = new Hono<WerewolfEnvironment>();

const LIFTS_JSON_SELECT = `
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
      created_at,
      updated_at
    FROM competitors
    ORDER BY last_name ASC, first_name ASC
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

  await executeMutation(
    db,
    `
    INSERT INTO competitors (
      id, first_name, last_name, birth_date, gender,
      club, city, notes,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      created_at, updated_at
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
      created_at, updated_at
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

  const existing = await executeQueryOne(
    db,
    `
    SELECT
      id, first_name, last_name, birth_date, gender,
      club, city, notes, photo_format, photo_metadata,
      created_at, updated_at
    FROM competitors
    WHERE id = ?
    `,
    [competitorId]
  );

  if (!existing) {
    return c.json({ data: null, error: 'Competitor not found', requestId: c.get('requestId') }, 404);
  }

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
  

  if (updates.length === 0) {
    return c.json({ data: null, error: 'No fields to update', requestId: c.get('requestId') }, 400);
  }

  const shouldRecalculate = input.birthDate !== undefined || input.gender !== undefined;

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
      created_at, updated_at
    FROM competitors
    WHERE id = ?
    `,
    [competitorId]
  );

  if (!competitor) {
    return c.json({ data: null, error: 'Competitor not found', requestId: c.get('requestId') }, 404);
  }

  if (shouldRecalculate) {
    await recalculateCompetitorRegistrations(c.env, db, competitorId, competitor);
  }

  return c.json({
    data: convertKeysToCamelCase(competitor),
    error: null,
    requestId: c.get('requestId'),
  });
});

async function recalculateCompetitorRegistrations(
  env: WerewolfEnvironment['Bindings'],
  db: WerewolfBindings['DB'],
  competitorId: string,
  competitor: { birth_date: string; gender: string }
): Promise<void> {
  const registrations = await executeQuery<{
    id: string;
    contest_id: string;
    bodyweight: number;
    age_category_id: string | null;
    weight_class_id: string | null;
    reshel_coefficient: number | null;
    mccullough_coefficient: number | null;
    contest_date: string;
  }>(
    db,
    `
    SELECT
      r.id,
      r.contest_id,
      r.bodyweight,
      r.age_category_id,
      r.weight_class_id,
      r.reshel_coefficient,
      r.mccullough_coefficient,
      ct.date AS contest_date
    FROM registrations r
    JOIN contests ct ON r.contest_id = ct.id
    WHERE r.competitor_id = ?
    `,
    [competitorId]
  );

  if (registrations.length === 0) {
    return;
  }

  const contestCache = new Map<
    string,
    {
      date: string;
      ageDescriptors: Awaited<ReturnType<typeof getContestAgeDescriptors>>;
      weightDescriptors: Awaited<ReturnType<typeof getContestWeightDescriptors>>;
    }
  >();

  for (const registration of registrations) {
    const bodyweight = Number(registration.bodyweight);
    if (!Number.isFinite(bodyweight) || bodyweight <= 0) {
      continue;
    }

    let descriptors = contestCache.get(registration.contest_id);
    if (!descriptors) {
      const [ageDescriptors, weightDescriptors] = await Promise.all([
        getContestAgeDescriptors(db, registration.contest_id),
        getContestWeightDescriptors(db, registration.contest_id),
      ]);

      descriptors = {
        date: registration.contest_date,
        ageDescriptors,
        weightDescriptors,
      };
      contestCache.set(registration.contest_id, descriptors);
    }

    const { date: contestDate, ageDescriptors, weightDescriptors } = descriptors;
    if (ageDescriptors.length === 0 || weightDescriptors.length === 0) {
      continue;
    }

    const reshel = await getReshelCoefficient(db, competitor.gender, bodyweight);
    const mcc = await getMcCulloughCoefficient(db, competitor.birth_date, contestDate);

    const ageCode = determineAgeCategory(competitor.birth_date, contestDate, ageDescriptors);
    const ageDescriptor =
      ageDescriptors.find((descriptor) => descriptor.code === ageCode) ?? ageDescriptors[0];

    const weightCode = determineWeightClass(bodyweight, competitor.gender, weightDescriptors);
    const weightDescriptor =
      weightDescriptors.find((descriptor) => descriptor.code === weightCode) ?? weightDescriptors[0];

    const updates: string[] = [];
    const params: any[] = [];

    if (ageDescriptor && registration.age_category_id !== ageDescriptor.id) {
      updates.push('age_category_id = ?');
      params.push(ageDescriptor.id);
    }

    if (weightDescriptor && registration.weight_class_id !== weightDescriptor.id) {
      updates.push('weight_class_id = ?');
      params.push(weightDescriptor.id);
    }

    if (Math.abs((registration.reshel_coefficient ?? 0) - reshel) > 0.0001) {
      updates.push('reshel_coefficient = ?');
      params.push(reshel);
    }

    if (Math.abs((registration.mccullough_coefficient ?? 0) - mcc) > 0.0001) {
      updates.push('mccullough_coefficient = ?');
      params.push(mcc);
    }

    if (updates.length === 0) {
      continue;
    }

    params.push(registration.id);

    await executeMutation(
      db,
      `UPDATE registrations SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    const refreshed = await executeQueryOne(
      db,
      `
      SELECT
        r.id, r.contest_id, r.competitor_id, r.age_category_id, r.weight_class_id,
        r.bodyweight, r.reshel_coefficient, r.mccullough_coefficient,
        r.rack_height_squat, r.rack_height_bench, r.created_at,
        r.flight_code, r.flight_order, COALESCE(r.labels, '[]') AS labels,
        ${LIFTS_JSON_SELECT},
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

    if (!refreshed) {
      continue;
    }

    const payload = mapRegistrationRow(convertKeysToCamelCase(refreshed));

    await publishEvent(env, registration.contest_id, {
      type: 'registration.upserted',
      payload,
    });
  }
}

// DELETE /competitors/:competitorId - Delete competitor
competitors.delete('/:competitorId', async (c) => {
  const db = c.env.DB;
  const competitorId = c.req.param('competitorId');

  const relatedRegistrations = await executeQuery<{ id: string; contest_id: string }>(
    db,
    'SELECT id, contest_id FROM registrations WHERE competitor_id = ?',
    [competitorId]
  );

  const result = await executeMutation(
    db,
    'DELETE FROM competitors WHERE id = ?',
    [competitorId]
  );

  if (result.changes === 0) {
    return c.json({ data: null, error: 'Competitor not found', requestId: c.get('requestId') }, 404);
  }

  await Promise.all(
    relatedRegistrations.map((registration) =>
      publishEvent(c.env, registration.contest_id, {
        type: 'registration.deleted',
        payload: { registrationId: registration.id },
      })
    )
  );

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

// competition order removed

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

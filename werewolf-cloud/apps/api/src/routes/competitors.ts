import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { WerewolfEnvironment, WerewolfBindings } from '../env';
import { executeQuery, executeQueryOne, executeMutation, generateId, getCurrentTimestamp, convertKeysToCamelCase } from '../utils/database';
import { competitorCreateSchema, competitorUpdateSchema } from '@werewolf/domain/models/competitor';
import { publishEvent } from '../live/publish';
import { determineAgeCategory, determineWeightClass } from '@werewolf/domain/services/coefficients';
import { getReshelCoefficient, getMcCulloughCoefficient } from '../services/coefficients';
import { getContestAgeDescriptors, getContestWeightDescriptors } from '../utils/category-templates';
import { selectCompetitorRegistrations, selectRegistration } from '../services/registrations/reader';
import { calculateRegistrationResults, updateAllRankings } from '../services/results';
import { invalidateResultsCache } from '../utils/cache';

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
  const params: unknown[] = [];

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

  const shouldSyncRegistrations =
    input.birthDate !== undefined ||
    input.gender !== undefined ||
    input.firstName !== undefined ||
    input.lastName !== undefined ||
    input.club !== undefined ||
    input.city !== undefined;

  updates.push('updated_at = ?');
  params.push(getCurrentTimestamp());
  params.push(competitorId);

  await executeMutation(
    db,
    `UPDATE competitors SET ${updates.join(', ')} WHERE id = ?`,
    params
  );

  const competitor = await executeQueryOne<{ id: string; birth_date: string; gender: string }>(
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

  if (shouldSyncRegistrations) {
    await syncCompetitorRegistrations(c.env, db, competitor);
  }

  return c.json({
    data: convertKeysToCamelCase(competitor),
    error: null,
    requestId: c.get('requestId'),
  });
});

/**
 * Re-derives the registrations of a competitor after a demographic or identity
 * edit. Age category and McCullough follow the competitor, so they are updated
 * even while the bodyweight is still pending; weight class and Reshel wait for
 * a weigh-in. Existing result rows and the rankings of every affected contest
 * are rebuilt, and each registration is republished so live views pick up the
 * new coefficients, name, club and city.
 */
async function syncCompetitorRegistrations(
  env: WerewolfEnvironment['Bindings'],
  db: WerewolfBindings['DB'],
  competitor: { id: string; birth_date: string; gender: string }
): Promise<void> {
  const registrations = await selectCompetitorRegistrations(db, competitor.id);
  if (registrations.length === 0) {
    return;
  }

  const registrationIds = registrations.map((registration) => registration.id);
  const contestIds = [...new Set(registrations.map((registration) => registration.contestId))];

  const contestRows = await executeQuery<{ id: string; date: string }>(
    db,
    `SELECT id, date FROM contests WHERE id IN (${contestIds.map(() => '?').join(',')})`,
    contestIds
  );
  const contestDates = new Map(contestRows.map((row) => [row.id, row.date]));

  const resultRows = await executeQuery<{ registration_id: string }>(
    db,
    `SELECT registration_id FROM results WHERE registration_id IN (${registrationIds.map(() => '?').join(',')})`,
    registrationIds
  );
  const registrationsWithResults = new Set(resultRows.map((row) => row.registration_id));

  const descriptorCache = new Map<
    string,
    {
      ageDescriptors: Awaited<ReturnType<typeof getContestAgeDescriptors>>;
      weightDescriptors: Awaited<ReturnType<typeof getContestWeightDescriptors>>;
    }
  >();

  for (const registration of registrations) {
    const contestDate = contestDates.get(registration.contestId);
    if (!contestDate) {
      continue;
    }

    let descriptors = descriptorCache.get(registration.contestId);
    if (!descriptors) {
      const [ageDescriptors, weightDescriptors] = await Promise.all([
        getContestAgeDescriptors(db, registration.contestId),
        getContestWeightDescriptors(db, registration.contestId),
      ]);

      descriptors = { ageDescriptors, weightDescriptors };
      descriptorCache.set(registration.contestId, descriptors);
    }

    const { ageDescriptors, weightDescriptors } = descriptors;
    const bodyweight = Number(registration.bodyweight);
    const hasBodyweight = Number.isFinite(bodyweight) && bodyweight > 0;

    const ageCode = determineAgeCategory(competitor.birth_date, contestDate, ageDescriptors);
    const ageDescriptor =
      ageDescriptors.find((descriptor) => descriptor.code === ageCode) ?? ageDescriptors[0];

    const weightCode = hasBodyweight
      ? determineWeightClass(bodyweight, competitor.gender, weightDescriptors)
      : null;
    const weightDescriptor = hasBodyweight
      ? weightDescriptors.find((descriptor) => descriptor.code === weightCode) ?? weightDescriptors[0]
      : undefined;

    const reshel = hasBodyweight
      ? await getReshelCoefficient(db, competitor.gender, bodyweight)
      : null;
    const mcc = await getMcCulloughCoefficient(db, competitor.birth_date, contestDate);

    const updates: string[] = [];
    const params: unknown[] = [];
    let coefficientsChanged = false;

    if (ageDescriptor && registration.ageCategoryId !== ageDescriptor.id) {
      updates.push('age_category_id = ?');
      params.push(ageDescriptor.id);
    }

    if (weightDescriptor && registration.weightClassId !== weightDescriptor.id) {
      updates.push('weight_class_id = ?');
      params.push(weightDescriptor.id);
    }

    if (reshel !== null && Math.abs((registration.reshelCoefficient ?? 0) - reshel) > 0.0001) {
      updates.push('reshel_coefficient = ?');
      params.push(reshel);
      coefficientsChanged = true;
    }

    if (Math.abs((registration.mcculloughCoefficient ?? 0) - mcc) > 0.0001) {
      updates.push('mccullough_coefficient = ?');
      params.push(mcc);
      coefficientsChanged = true;
    }

    if (updates.length > 0) {
      params.push(registration.id);
      await executeMutation(
        db,
        `UPDATE registrations SET ${updates.join(', ')} WHERE id = ?`,
        params
      );
    }

    // Rebuild only result rows that already exist: a pending weigh-in must not
    // gain a zero-point ranking entry from a demographic edit.
    if (coefficientsChanged && registrationsWithResults.has(registration.id)) {
      await calculateRegistrationResults(db, registration.id);
    }

    const refreshed = await selectRegistration(db, registration.id);
    if (refreshed) {
      await publishEvent(env, refreshed.contestId, {
        type: 'registration.upserted',
        payload: refreshed,
      });
    }
  }

  for (const contestId of contestIds) {
    await updateAllRankings(db, contestId);
    await invalidateResultsCache(env.KV, contestId);
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

  const contestIds = [...new Set(relatedRegistrations.map((registration) => registration.contest_id))];

  if (relatedRegistrations.length > 0) {
    // The registrations cascade away with the competitor; drop any result row
    // the cascade leaves behind before the survivors are re-ranked.
    await executeMutation(
      db,
      `DELETE FROM results WHERE registration_id IN (${relatedRegistrations.map(() => '?').join(',')})`,
      relatedRegistrations.map((registration) => registration.id)
    );
  }

  await Promise.all(
    relatedRegistrations.map((registration) =>
      publishEvent(c.env, registration.contest_id, {
        type: 'registration.deleted',
        payload: { registrationId: registration.id },
      })
    )
  );

  for (const contestId of contestIds) {
    await updateAllRankings(db, contestId);
    await invalidateResultsCache(c.env.KV, contestId);
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

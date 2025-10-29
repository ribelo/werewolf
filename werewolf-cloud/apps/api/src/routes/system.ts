import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { WerewolfEnvironment } from '../env';
import { executeQuery, executeQueryOne, executeMutation, getCurrentTimestamp, convertKeysToCamelCase } from '../utils/database';
import { getReshelCoefficient, getMcCulloughCoefficient, resetCoefficientCaches } from '../services/coefficients';
import { determineAgeCategory, determineWeightClass, type AgeCategoryDescriptor, type WeightClassDescriptor } from '@werewolf/domain/services/coefficients';
import { getContestAgeDescriptors, getContestWeightDescriptors, seedContestCategories } from '../utils/category-templates';

const system = new Hono<WerewolfEnvironment>();

// GET /system/health - System health check
system.get('/health', async (c) => {
  const db = c.env.DB;

  try {
    // Check database connectivity
    const dbHealth = await executeQueryOne(db, 'SELECT 1 as test');

    // Get basic stats
    const stats = await executeQueryOne(
      db,
      `
      SELECT
        (SELECT COUNT(*) FROM contests) as contests_count,
        (SELECT COUNT(*) FROM competitors) as competitors_count,
        (SELECT COUNT(*) FROM registrations) as registrations_count,
        (SELECT COUNT(*) FROM attempts) as attempts_count
      `
    );

    return c.json({
      data: {
        status: 'healthy',
        database: 'connected',
        stats: convertKeysToCamelCase(stats),
        timestamp: getCurrentTimestamp(),
        version: '1.0.0'
      },
      error: null,
      requestId: c.get('requestId'),
    });
  } catch (error) {
    return c.json({
      data: null,
      error: error instanceof Error ? error.message : 'Unknown error',
      requestId: c.get('requestId'),
    }, 503);
  }
});

// GET /system/database - Database status
system.get('/database', async (c) => {
  const db = c.env.DB;

  try {
    // Get database statistics
    const stats = await executeQueryOne(
      db,
      `
      SELECT
        (SELECT COUNT(*) FROM contests) as contests,
        (SELECT COUNT(*) FROM competitors) as competitors,
        (SELECT COUNT(*) FROM registrations) as registrations,
        (SELECT COUNT(*) FROM attempts) as attempts,
        (SELECT COUNT(*) FROM results) as results,
        (SELECT COUNT(*) FROM plate_sets) as plate_sets
      `
    );

    return c.json({
      data: {
        status: 'ok',
        stats: convertKeysToCamelCase(stats),
        timestamp: getCurrentTimestamp()
      },
      error: null,
      requestId: c.get('requestId'),
    });
  } catch (error) {
    return c.json({
      data: null,
      error: error instanceof Error ? error.message : 'Unknown error',
      requestId: c.get('requestId'),
    }, 500);
  }
});

// GET /system/backups - List backups
system.get('/backups', async (c) => {
  try {
    // List all backup metadata keys
    const backupKeys = await c.env.KV.list({ prefix: 'backup_meta:' });

    const backups = [];

    // Retrieve metadata for each backup
    for (const key of backupKeys.keys) {
      try {
        const metadataStr = await c.env.KV.get(key.name);
        if (metadataStr) {
          const metadata = JSON.parse(metadataStr);
          backups.push(metadata);
        }
      } catch (error) {
        console.warn(`Failed to parse backup metadata for ${key.name}:`, error);
      }
    }

    // Sort backups by timestamp (newest first)
    backups.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return c.json({
      data: {
        backups: convertKeysToCamelCase(backups),
        total: backups.length,
        timestamp: getCurrentTimestamp()
      },
      error: null,
      requestId: c.get('requestId'),
    });
  } catch (error) {
    return c.json({
      data: null,
      error: 'Failed to list backups',
      details: error instanceof Error ? error.message : 'Unknown error',
      requestId: c.get('requestId'),
    }, 500);
  }
});

// GET /system/backups/:backupId - Retrieve specific backup
system.get('/backups/:backupId', async (c) => {
  const backupId = c.req.param('backupId');
  if (!backupId) {
    return c.json(
      {
        data: null,
        error: 'Backup identifier required',
        requestId: c.get('requestId'),
      },
      400,
    );
  }

  try {
    const backupKey = `backup:${backupId}`;
    const backupData = await c.env.KV.get(backupKey);

    if (!backupData) {
      return c.json(
        {
          data: null,
          error: 'Backup not found',
          requestId: c.get('requestId'),
        },
        404,
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(backupData);
    } catch (error) {
      console.warn(`Failed to parse backup ${backupId}:`, error);
      return c.json(
        {
          data: null,
          error: 'Backup is corrupted or in an unexpected format',
          requestId: c.get('requestId'),
        },
        500,
      );
    }

    return c.json({
      data: convertKeysToCamelCase(parsed),
      error: null,
      requestId: c.get('requestId'),
    });
  } catch (error) {
    return c.json(
      {
        data: null,
        error: 'Failed to load backup',
        details: error instanceof Error ? error.message : 'Unknown error',
        requestId: c.get('requestId'),
      },
      500,
    );
  }
});

// POST /system/backups - Create backup
system.post('/backups', async (c) => {
  const db = c.env.DB;

  try {
    // Create a backup by exporting all data
    const backupId = `backup_${Date.now()}`;

    // Export all tables with their data
    const backupData = {
      contests: await executeQuery(db, 'SELECT * FROM contests'),
      competitors: await executeQuery(db, 'SELECT * FROM competitors'),
      registrations: await executeQuery(db, 'SELECT * FROM registrations'),
      attempts: await executeQuery(db, 'SELECT * FROM attempts'),
      results: await executeQuery(db, 'SELECT * FROM results'),
      plate_sets: await executeQuery(db, 'SELECT * FROM plate_sets'),
      contest_age_categories: await executeQuery(db, 'SELECT * FROM contest_age_categories'),
      contest_weight_classes: await executeQuery(db, 'SELECT * FROM contest_weight_classes'),
      contest_tags: await executeQuery(db, 'SELECT * FROM contest_tags'),
      contest_states: await executeQuery(db, 'SELECT * FROM contest_states'),
      current_lifts: await executeQuery(db, 'SELECT * FROM current_lifts'),
      settings: await executeQuery(db, 'SELECT * FROM settings')
    };

    const backup = {
      id: backupId,
      timestamp: getCurrentTimestamp(),
      version: '1.0',
      data: backupData
    };

    // Store backup in KV with metadata
    const backupKey = `backup:${backupId}`;
    await c.env.KV.put(backupKey, JSON.stringify(backup));

    // Store backup metadata for listing
    const metadataKey = `backup_meta:${backupId}`;
    const metadata = {
      id: backupId,
      timestamp: backup.timestamp,
      size: JSON.stringify(backup).length,
      recordCounts: {
        contests: backupData.contests.length,
        competitors: backupData.competitors.length,
        registrations: backupData.registrations.length,
        attempts: backupData.attempts.length,
        results: backupData.results.length,
        contestAgeCategories: backupData.contest_age_categories.length,
        contestWeightClasses: backupData.contest_weight_classes.length,
        contestTags: backupData.contest_tags.length,
      }
    };
    await c.env.KV.put(metadataKey, JSON.stringify(metadata));

    return c.json({
      data: {
        success: true,
        backupId,
        timestamp: backup.timestamp,
        size: metadata.size,
        recordCounts: metadata.recordCounts
      },
      error: null,
      requestId: c.get('requestId'),
    });
  } catch (error) {
    return c.json({
      data: null,
      error: 'Failed to create backup',
      details: error instanceof Error ? error.message : 'Unknown error',
      requestId: c.get('requestId'),
    }, 500);
  }
});

// POST /system/backups/:backupId/restore - Restore from backup
system.post('/backups/:backupId/restore', async (c) => {
  const db = c.env.DB;
  const backupId = c.req.param('backupId');

  try {
    // Get backup from storage
    const backupData = await c.env.KV.get(`backup:${backupId}`);

    if (!backupData) {
      return c.json({ data: null, error: 'Backup not found', requestId: c.get('requestId') }, 404);
    }

    const backup = JSON.parse(backupData);

    if (!backup.data) {
      return c.json({ data: null, error: 'Invalid backup format', requestId: c.get('requestId') }, 400);
    }

    // This is a dangerous operation - clear all existing data first
    const clearQueries = [
      'DELETE FROM results',
      'DELETE FROM attempts',
      'DELETE FROM current_lifts',
      'DELETE FROM plate_sets',
      'DELETE FROM contest_states',
      'DELETE FROM registrations',
      'DELETE FROM contest_tags',
      'DELETE FROM contest_weight_classes',
      'DELETE FROM contest_age_categories',
      'DELETE FROM competitors',
      'DELETE FROM contests',
      'DELETE FROM settings'
    ];

    for (const query of clearQueries) {
      await executeMutation(db, query);
    }

    // Restore data in correct order (respecting foreign keys)
    const restoreStats = {
      contests: 0,
      competitors: 0,
      registrations: 0,
      attempts: 0,
      results: 0,
      plate_sets: 0,
      contest_age_categories: 0,
      contest_weight_classes: 0,
      contest_tags: 0,
      contest_states: 0,
      current_lifts: 0,
      settings: 0
    };

    // Restore contests
    if (backup.data.contests) {
      for (const item of backup.data.contests) {
        const mensBar = item.mens_bar_weight ?? item.bar_weight ?? 20;
        const womensBar = item.womens_bar_weight ?? item.bar_weight ?? 15;

        await executeMutation(
          db,
          `INSERT OR REPLACE INTO contests
           (id, name, date, location, discipline, status, federation_rules, competition_type, organizer, notes, is_archived, created_at, updated_at, mens_bar_weight, womens_bar_weight)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [item.id, item.name, item.date, item.location, item.discipline, item.status, item.federation_rules, item.competition_type, item.organizer, item.notes, item.is_archived, item.created_at, item.updated_at, mensBar, womensBar]
        );
        restoreStats.contests++;
      }
    }

    // Restore competitors
    if (backup.data.competitors) {
      for (const item of backup.data.competitors) {
        await executeMutation(
          db,
          `INSERT OR REPLACE INTO competitors
           (id, first_name, last_name, birth_date, gender, club, city, notes, photo_data, photo_format, photo_metadata, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [item.id, item.first_name, item.last_name, item.birth_date, item.gender, item.club, item.city, item.notes, item.photo_data, item.photo_format, item.photo_metadata, item.created_at, item.updated_at]
        );
        restoreStats.competitors++;
      }
    }

    if (backup.data.contest_age_categories) {
      for (const item of backup.data.contest_age_categories) {
        await executeMutation(
          db,
          `INSERT OR REPLACE INTO contest_age_categories
           (id, contest_id, code, name, min_age, max_age, sort_order, metadata)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            item.id,
            item.contest_id,
            item.code,
            item.name,
            item.min_age,
            item.max_age,
            item.sort_order ?? 0,
            item.metadata ?? null,
          ]
        );
        restoreStats.contest_age_categories++;
      }
    }

    if (backup.data.contest_weight_classes) {
      for (const item of backup.data.contest_weight_classes) {
        await executeMutation(
          db,
          `INSERT OR REPLACE INTO contest_weight_classes
           (id, contest_id, gender, code, name, min_weight, max_weight, sort_order, metadata)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            item.id,
            item.contest_id,
            item.gender,
            item.code,
            item.name,
            item.min_weight,
            item.max_weight,
            item.sort_order ?? 0,
            item.metadata ?? null,
          ]
        );
        restoreStats.contest_weight_classes++;
      }
    }

    if (backup.data.contest_tags) {
      for (const item of backup.data.contest_tags) {
        await executeMutation(
          db,
          `INSERT OR REPLACE INTO contest_tags
           (id, contest_id, label, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)`,
          [item.id, item.contest_id, item.label, item.created_at, item.updated_at]
        );
        restoreStats.contest_tags++;
      }
    }

    // Restore registrations
    if (backup.data.registrations) {
      for (const item of backup.data.registrations) {
        const flightCode =
          typeof item.flight_code === 'string' && item.flight_code.trim().length > 0
            ? item.flight_code.trim().toUpperCase()
            : 'A';
        const flightOrder =
          typeof item.flight_order === 'number' && Number.isFinite(item.flight_order)
            ? item.flight_order
            : null;
        const labels =
          Array.isArray(item.labels)
            ? JSON.stringify(item.labels.map((label: unknown) => String(label)))
            : typeof item.labels === 'string'
              ? item.labels
              : '[]';
        await executeMutation(
          db,
          `INSERT OR REPLACE INTO registrations
           (id, contest_id, competitor_id, age_category_id, weight_class_id, bodyweight, reshel_coefficient, mccullough_coefficient, rack_height_squat, rack_height_bench, created_at, flight_code, flight_order, labels)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            item.id,
            item.contest_id,
            item.competitor_id,
            item.age_category_id,
            item.weight_class_id,
            item.bodyweight,
            item.reshel_coefficient,
            item.mccullough_coefficient,
            item.rack_height_squat,
            item.rack_height_bench,
            item.created_at,
            flightCode,
            flightOrder,
            labels,
          ]
        );
        restoreStats.registrations++;
      }
    }

    // Restore attempts
    if (backup.data.attempts) {
      for (const item of backup.data.attempts) {
        await executeMutation(
          db,
          `INSERT OR REPLACE INTO attempts
           (id, registration_id, lift_type, attempt_number, weight, status, timestamp, judge1_decision, judge2_decision, judge3_decision, notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [item.id, item.registration_id, item.lift_type, item.attempt_number, item.weight, item.status, item.timestamp, item.judge1_decision, item.judge2_decision, item.judge3_decision, item.notes, item.created_at, item.updated_at]
        );
        restoreStats.attempts++;
      }
    }

    // Restore results
    if (backup.data.results) {
      for (const item of backup.data.results) {
        await executeMutation(
          db,
          `INSERT OR REPLACE INTO results
           (id, registration_id, contest_id, best_bench, best_squat, best_deadlift, total_weight, coefficient_points, place_open, place_in_age_class, place_in_weight_class, is_disqualified, disqualification_reason, broke_record, record_type, calculated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [item.id, item.registration_id, item.contest_id, item.best_bench, item.best_squat, item.best_deadlift, item.total_weight, item.coefficient_points, item.place_open, item.place_in_age_class, item.place_in_weight_class, item.is_disqualified, item.disqualification_reason, item.broke_record, item.record_type, item.calculated_at]
        );
        restoreStats.results++;
      }
    }

    // Restore other tables
    if (backup.data.plate_sets) {
      for (const item of backup.data.plate_sets) {
        await executeMutation(
          db,
          'INSERT OR REPLACE INTO plate_sets (contest_id, plate_weight, quantity, color) VALUES (?, ?, ?, ?)',
          [item.contest_id, item.plate_weight, item.quantity, item.color]
        );
        restoreStats.plate_sets++;
      }
    }

    if (backup.data.contest_states) {
      for (const item of backup.data.contest_states) {
        await executeMutation(
          db,
          'INSERT OR REPLACE INTO contest_states (contest_id, status, current_lift, current_round) VALUES (?, ?, ?, ?)',
          [item.contest_id, item.status, item.current_lift, item.current_round]
        );
        restoreStats.contest_states++;
      }
    }

    if (backup.data.current_lifts) {
      for (const item of backup.data.current_lifts) {
        await executeMutation(
          db,
          'INSERT OR REPLACE INTO current_lifts (id, contest_id, registration_id, lift_type, attempt_number, weight, timer_start, timer_duration, rack_height, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [item.id, item.contest_id, item.registration_id, item.lift_type, item.attempt_number, item.weight, item.timer_start, item.timer_duration, item.rack_height, item.is_active, item.created_at, item.updated_at]
        );
        restoreStats.current_lifts++;
      }
    }

    if (backup.data.settings) {
      for (const item of backup.data.settings) {
        await executeMutation(
          db,
          'INSERT OR REPLACE INTO settings (id, data, created_at, updated_at) VALUES (?, ?, ?, ?)',
          [item.id, item.data, item.created_at, item.updated_at]
        );
        restoreStats.settings++;
      }
    }

    return c.json({
      data: {
        success: true,
        backupId,
        message: 'Backup restored successfully',
        restoredCounts: restoreStats,
        backupInfo: {
          timestamp: backup.timestamp,
          version: backup.version
        }
      },
      error: null,
      requestId: c.get('requestId'),
    });
  } catch (error) {
    return c.json({
      data: null,
      error: 'Failed to restore backup',
      details: error instanceof Error ? error.message : 'Unknown error',
      requestId: c.get('requestId'),
    }, 500);
  }
});

// POST /system/backups/import - Import backup JSON and register in KV
system.post('/backups/import', async (c) => {
  let payload: Record<string, any>;
  try {
    payload = await c.req.json<Record<string, any>>();
  } catch (error) {
    return c.json(
      { data: null, error: 'Invalid JSON payload', details: error instanceof Error ? error.message : 'Unknown error', requestId: c.get('requestId') },
      400,
    );
  }

  if (!payload || typeof payload !== 'object') {
    return c.json(
      { data: null, error: 'Invalid backup payload', requestId: c.get('requestId') },
      400,
    );
  }

  const rawDataCandidate = payload['data'];
  const rawData =
    rawDataCandidate && typeof rawDataCandidate === 'object'
      ? (rawDataCandidate as Record<string, unknown>)
      : payload;

  const toSnakeCaseKey = (key: string): string =>
    key.replace(/([A-Z])/g, (match) => `_${match.toLowerCase()}`).replace(/__/g, '_');

  const convertToSnakeCase = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value.map((item) => convertToSnakeCase(item));
    }
    if (value && typeof value === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
        const snakeKey = toSnakeCaseKey(key);
        result[snakeKey] = convertToSnakeCase(val);
      }
      return result;
    }
    return value;
  };

  const normaliseArrayField = (camelKey: string, snakeKey: string): any[] => {
    const snakeValue = rawData[snakeKey];
    if (Array.isArray(snakeValue)) {
      return snakeValue.map((entry) => convertToSnakeCase(entry));
    }
    const camelValue = rawData[camelKey];
    if (Array.isArray(camelValue)) {
      return camelValue.map((entry) => convertToSnakeCase(entry));
    }
    return [];
  };

  const normalisedData = {
    contests: normaliseArrayField('contests', 'contests'),
    competitors: normaliseArrayField('competitors', 'competitors'),
    registrations: normaliseArrayField('registrations', 'registrations'),
    attempts: normaliseArrayField('attempts', 'attempts'),
    results: normaliseArrayField('results', 'results'),
    plate_sets: normaliseArrayField('plateSets', 'plate_sets'),
    contest_age_categories: normaliseArrayField('contestAgeCategories', 'contest_age_categories'),
    contest_weight_classes: normaliseArrayField('contestWeightClasses', 'contest_weight_classes'),
    contest_tags: normaliseArrayField('contestTags', 'contest_tags'),
    contest_states: normaliseArrayField('contestStates', 'contest_states'),
    current_lifts: normaliseArrayField('currentLifts', 'current_lifts'),
    settings: normaliseArrayField('settings', 'settings'),
  };

  const payloadId = payload['id'];
  let backupId = typeof payloadId === 'string' && payloadId.trim().length > 0 ? payloadId.trim() : '';
  if (!backupId.startsWith('backup_')) {
    backupId = `backup_${backupId || Date.now()}`;
  }
  const existing = await c.env.KV.get(`backup:${backupId}`);
  if (existing) {
    backupId = `${backupId}_${Date.now()}`;
  }

  const payloadTimestamp = payload['timestamp'];
  const timestamp =
    typeof payloadTimestamp === 'string' && payloadTimestamp.trim().length > 0
      ? payloadTimestamp
      : getCurrentTimestamp();
  const payloadVersion = payload['version'];
  const version =
    typeof payloadVersion === 'string' && payloadVersion.trim().length > 0
      ? payloadVersion
      : '1.0';

  const backup = {
    id: backupId,
    timestamp,
    version,
    data: normalisedData,
  };

  const backupJson = JSON.stringify(backup);
  const size = backupJson.length;
  await c.env.KV.put(`backup:${backupId}`, backupJson);

  const metadata = {
    id: backupId,
    timestamp,
    size,
    recordCounts: {
      contests: normalisedData.contests.length,
      competitors: normalisedData.competitors.length,
      registrations: normalisedData.registrations.length,
      attempts: normalisedData.attempts.length,
      results: normalisedData.results.length,
      contestAgeCategories: normalisedData.contest_age_categories.length,
      contestWeightClasses: normalisedData.contest_weight_classes.length,
      contestTags: normalisedData.contest_tags.length,
    },
  };

  await c.env.KV.put(`backup_meta:${backupId}`, JSON.stringify(metadata));

  return c.json({
    data: {
      success: true,
      backupId,
      timestamp,
      size,
      recordCounts: metadata.recordCounts,
    },
    error: null,
    requestId: c.get('requestId'),
  });
});

// DELETE /system/backups/:backupId - Remove backup from storage
system.delete('/backups/:backupId', async (c) => {
  const backupId = c.req.param('backupId');

  if (!backupId) {
    return c.json(
      { data: null, error: 'Backup identifier required', requestId: c.get('requestId') },
      400,
    );
  }

  try {
    const backupKey = `backup:${backupId}`;
    const metadataKey = `backup_meta:${backupId}`;

    const [backupExists, metadataExists] = await Promise.all([
      c.env.KV.get(backupKey),
      c.env.KV.get(metadataKey),
    ]);

    if (!backupExists && !metadataExists) {
      return c.json(
        { data: null, error: 'Backup not found', requestId: c.get('requestId') },
        404,
      );
    }

    await Promise.all([
      c.env.KV.delete(backupKey),
      c.env.KV.delete(metadataKey),
    ]);

    return c.json({
      data: { success: true, backupId },
      error: null,
      requestId: c.get('requestId'),
    });
  } catch (error) {
    return c.json(
      {
        data: null,
        error: 'Failed to delete backup',
        details: error instanceof Error ? error.message : 'Unknown error',
        requestId: c.get('requestId'),
      },
      500,
    );
  }
});

// POST /system/database/reset - Reset database (DANGER!)
system.post('/database/reset', zValidator('json', z.object({
  confirm: z.literal('YES_I_WANT_TO_RESET_THE_DATABASE'),
})), async (c) => {
  const db = c.env.DB;
  const { confirm } = c.req.valid('json');

  if (confirm !== 'YES_I_WANT_TO_RESET_THE_DATABASE') {
    return c.json({ data: null, error: 'Confirmation required', requestId: c.get('requestId') }, 400);
  }

  try {
    // This is extremely dangerous - only for development/testing
    // In production, this should be heavily restricted or removed

    // Clear all data (in reverse dependency order)
    const deletedCounts = {
      results: (await executeMutation(db, 'DELETE FROM results')).changes,
      attempts: (await executeMutation(db, 'DELETE FROM attempts')).changes,
      current_lifts: (await executeMutation(db, 'DELETE FROM current_lifts')).changes,
      registrations: (await executeMutation(db, 'DELETE FROM registrations')).changes,
      competitors: (await executeMutation(db, 'DELETE FROM competitors')).changes,
      contests: (await executeMutation(db, 'DELETE FROM contests')).changes,
      plate_sets: (await executeMutation(db, 'DELETE FROM plate_sets')).changes,
      contest_states: (await executeMutation(db, 'DELETE FROM contest_states')).changes,
      settings: (await executeMutation(db, 'DELETE FROM settings')).changes
    };

    return c.json({
      data: {
        success: true,
        message: 'Database reset complete',
        timestamp: getCurrentTimestamp()
      },
      error: null,
      requestId: c.get('requestId'),
    });
  } catch (error) {
    return c.json({
      data: null,
      error: 'Failed to reset database',
      details: error instanceof Error ? error.message : 'Unknown error',
      requestId: c.get('requestId'),
    }, 500);
  }
});

system.post('/maintenance/recalculate-coefficients', async (c) => {
  const db = c.env.DB;

  try {
    const contests = await executeQuery<{ id: string; date: string }>(
      db,
      'SELECT id, date FROM contests'
    );

    let processed = 0;
    let updated = 0;

    for (const contest of contests) {
      await seedContestCategories(db, contest.id);
      const [ageDescriptors, weightDescriptors] = await Promise.all([
        getContestAgeDescriptors(db, contest.id),
        getContestWeightDescriptors(db, contest.id),
      ]);

      const registrations = await executeQuery<{
        id: string;
        bodyweight: number | null;
        age_category_id: string;
        weight_class_id: string | null;
        reshel_coefficient: number | null;
        mccullough_coefficient: number | null;
        gender: string;
        birth_date: string;
      }>(
        db,
        `
        SELECT
          r.id,
          r.bodyweight,
          r.age_category_id,
          r.weight_class_id,
          r.reshel_coefficient,
          r.mccullough_coefficient,
          c.gender,
          c.birth_date
        FROM registrations r
        JOIN competitors c ON r.competitor_id = c.id
        WHERE r.contest_id = ?
        `,
        [contest.id]
      );

      for (const registration of registrations) {
        processed += 1;

        const ageCode = determineAgeCategory(registration.birth_date, contest.date, ageDescriptors);
        const ageDescriptor = ageDescriptors.find((descriptor) => descriptor.code === ageCode) ?? ageDescriptors[0];
        let weightDescriptor = null;
        let reshel: number | null = registration.reshel_coefficient ?? null;

        if (registration.bodyweight !== null && Number.isFinite(registration.bodyweight)) {
          const weightCode = determineWeightClass(registration.bodyweight, registration.gender, weightDescriptors);
          weightDescriptor =
            weightDescriptors.find((descriptor) => descriptor.code === weightCode) ??
            weightDescriptors[0] ??
            null;
          reshel = await getReshelCoefficient(db, registration.gender, registration.bodyweight);
        } else {
          reshel = null;
        }

        const mccullough = await getMcCulloughCoefficient(db, registration.birth_date, contest.date);

        const reshelChanged =
          reshel === null
            ? registration.reshel_coefficient !== null
            : Math.abs((registration.reshel_coefficient ?? 0) - reshel) > 0.0001;
        const weightClassChanged =
          weightDescriptor === null
            ? registration.weight_class_id !== null
            : registration.weight_class_id !== weightDescriptor.id;

        const requiresUpdate =
          (ageDescriptor && registration.age_category_id !== ageDescriptor.id) ||
          weightClassChanged ||
          reshelChanged ||
          Math.abs((registration.mccullough_coefficient ?? 0) - mccullough) > 0.0001;

        if (!requiresUpdate || !ageDescriptor) {
          continue;
        }

        await executeMutation(
          db,
          `UPDATE registrations
             SET age_category_id = ?,
                 weight_class_id = ?,
                 reshel_coefficient = ?,
                 mccullough_coefficient = ?
           WHERE id = ?`,
          [ageDescriptor.id, weightDescriptor ? weightDescriptor.id : null, reshel, mccullough, registration.id]
        );

        updated += 1;
      }
    }

    resetCoefficientCaches();

    return c.json({
      data: {
        success: true,
        processed,
        updated,
        timestamp: getCurrentTimestamp(),
      },
      error: null,
      requestId: c.get('requestId'),
    });
  } catch (error) {
    return c.json({
      data: null,
      error: error instanceof Error ? error.message : 'Failed to recalculate coefficients',
      requestId: c.get('requestId'),
    }, 500);
  }
});

export default system;

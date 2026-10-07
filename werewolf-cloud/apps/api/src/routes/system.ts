import { Hono } from 'hono';
import type { Context } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { WerewolfEnvironment } from '../env';
import { executeQuery, executeQueryOne, executeMutation, getCurrentTimestamp, convertKeysToCamelCase } from '../utils/database';
import { getReshelCoefficient, getMcCulloughCoefficient, resetCoefficientCaches } from '../services/coefficients';
import { determineAgeCategory, determineWeightClass } from '@werewolf/domain/services/coefficients';
import { getContestAgeDescriptors, getContestWeightDescriptors, seedContestCategories } from '../utils/category-templates';
import {
  BackupError,
  createBackup,
  deleteBackup,
  importBackup,
  listBackups,
  readBackup,
  rebuildContestResults,
  restoreDatabase,
} from '../services/backup';

const system = new Hono<WerewolfEnvironment>();

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Unknown error';

const backupErrorResponse = (
  c: Context<WerewolfEnvironment>,
  error: unknown,
  fallback: string,
): Response => {
  if (error instanceof BackupError) {
    return c.json({ data: null, error: error.message, requestId: c.get('requestId') }, error.status);
  }

  return c.json(
    { data: null, error: fallback, details: errorMessage(error), requestId: c.get('requestId') },
    500,
  );
};

// GET /system/health - System health check
system.get('/health', async (c) => {
  const db = c.env.DB;

  try {
    // Check database connectivity
    await executeQueryOne(db, 'SELECT 1 as test');

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
      error: errorMessage(error),
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
      error: errorMessage(error),
      requestId: c.get('requestId'),
    }, 500);
  }
});

// GET /system/backups - List backups
system.get('/backups', async (c) => {
  try {
    const backups = await listBackups(c.env.KV);

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
      details: errorMessage(error),
      requestId: c.get('requestId'),
    }, 500);
  }
});

// GET /system/backups/:backupId - Retrieve specific backup
system.get('/backups/:backupId', async (c) => {
  try {
    const backup = await readBackup(c.env.KV, c.req.param('backupId'));

    return c.json({
      data: convertKeysToCamelCase(backup),
      error: null,
      requestId: c.get('requestId'),
    });
  } catch (error) {
    return backupErrorResponse(c, error, 'Failed to load backup');
  }
});

// POST /system/backups - Create backup
system.post('/backups', async (c) => {
  try {
    const backup = await createBackup(c.env.DB, c.env.KV);

    return c.json({
      data: {
        success: true,
        backupId: backup.id,
        timestamp: backup.timestamp,
        version: backup.version,
        size: backup.size,
        recordCounts: convertKeysToCamelCase(backup.recordCounts),
      },
      error: null,
      requestId: c.get('requestId'),
    });
  } catch (error) {
    return backupErrorResponse(c, error, 'Failed to create backup');
  }
});

// POST /system/backups/:backupId/restore - Restore from backup
system.post('/backups/:backupId/restore', async (c) => {
  const db = c.env.DB;
  const backupId = c.req.param('backupId');

  try {
    const backup = await readBackup(c.env.KV, backupId);
    const outcome = await restoreDatabase(db, backup);

    // Results, rankings and cached payloads must reflect the restored data.
    for (const contestId of outcome.contestIds) {
      await rebuildContestResults(db, c.env.KV, contestId);
    }

    return c.json({
      data: {
        success: true,
        backupId,
        message: 'Backup restored successfully',
        restoredCounts: outcome.counts,
        backupInfo: {
          timestamp: outcome.timestamp,
          version: outcome.version,
        },
      },
      error: null,
      requestId: c.get('requestId'),
    });
  } catch (error) {
    return backupErrorResponse(c, error, 'Failed to restore backup');
  }
});

// POST /system/backups/import - Import backup JSON and register in KV
system.post('/backups/import', async (c) => {
  let payload: unknown;
  try {
    payload = await c.req.json();
  } catch (error) {
    return c.json(
      { data: null, error: 'Invalid JSON payload', details: errorMessage(error), requestId: c.get('requestId') },
      400,
    );
  }

  try {
    const backup = await importBackup(c.env.KV, payload);

    return c.json({
      data: {
        success: true,
        backupId: backup.id,
        timestamp: backup.timestamp,
        version: backup.version,
        size: backup.size,
        recordCounts: convertKeysToCamelCase(backup.recordCounts),
      },
      error: null,
      requestId: c.get('requestId'),
    });
  } catch (error) {
    return backupErrorResponse(c, error, 'Failed to import backup');
  }
});

// DELETE /system/backups/:backupId - Remove backup from storage
system.delete('/backups/:backupId', async (c) => {
  try {
    const deleted = await deleteBackup(c.env.KV, c.req.param('backupId'));

    if (!deleted) {
      return c.json(
        { data: null, error: 'Backup not found', requestId: c.get('requestId') },
        404,
      );
    }

    return c.json({
      data: { success: true, backupId: c.req.param('backupId') },
      error: null,
      requestId: c.get('requestId'),
    });
  } catch (error) {
    return backupErrorResponse(c, error, 'Failed to delete backup');
  }
});

// POST /system/database/reset - Reset database (DANGER!)
system.post('/database/reset', zValidator('json', z.object({
  confirm: z.literal('YES_I_WANT_TO_RESET_THE_DATABASE'),
})), async (c) => {
  const db = c.env.DB;

  try {
    // This is extremely dangerous - only for development/testing
    // In production, this should be heavily restricted or removed
    const clearQueries = [
      'DELETE FROM results',
      'DELETE FROM attempts',
      'DELETE FROM current_lifts',
      'DELETE FROM registrations',
      'DELETE FROM competitors',
      'DELETE FROM contests',
      'DELETE FROM plate_sets',
      'DELETE FROM contest_states',
      'DELETE FROM settings'
    ];

    for (const query of clearQueries) {
      await executeMutation(db, query);
    }

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
      details: errorMessage(error),
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
    const recalculated = new Map<string, string[]>();

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
        const pending = recalculated.get(contest.id);
        if (pending) {
          pending.push(registration.id);
        } else {
          recalculated.set(contest.id, [registration.id]);
        }
      }
    }

    resetCoefficientCaches();

    // New coefficients must reach stored results, rankings and cached payloads.
    for (const [contestId, registrationIds] of recalculated) {
      await rebuildContestResults(db, c.env.KV, contestId, { recalculate: registrationIds });
    }

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
      error: errorMessage(error),
      requestId: c.get('requestId'),
    }, 500);
  }
});

export default system;

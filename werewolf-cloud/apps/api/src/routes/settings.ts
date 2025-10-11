import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { WerewolfEnvironment } from '../env';
import { executeQuery, executeQueryOne, executeMutation, getCurrentTimestamp } from '../utils/database';
import {
  getDefaultSettings,
  sanitizeSettings,
  serializeSettings,
  mergeSettings,
  coercePartialSettings,
  sanitizePlateSet,
} from '../utils/settings-helpers';
import type { SettingsData } from '../utils/settings-helpers';

const settings = new Hono<WerewolfEnvironment>();

const plateDefinitionSchema = z.object({
  weight: z.number().positive(),
  quantity: z.number().int().min(0),
  color: z.string(),
});

// GET /settings - Get all settings
settings.get('/', async (c) => {
  const db = c.env.DB;

  const row = await executeQueryOne(db, 'SELECT data FROM settings LIMIT 1');

  try {
    const parsed = row ? sanitizeSettings(JSON.parse(row.data)) : getDefaultSettings();
    return c.json({
      data: parsed,
      error: null,
      requestId: c.get('requestId'),
    });
  } catch (error) {
    console.error('Failed to parse settings data:', error);
    return c.json({
      data: getDefaultSettings(),
      error: null,
      requestId: c.get('requestId'),
    });
  }
});

// PUT /settings - Update all settings
settings.put('/', zValidator('json', z.object({
  language: z.string().optional(),
  ui: z.object({
    theme: z.string().optional(),
    showWeights: z.boolean().optional(),
    showAttempts: z.boolean().optional(),
  }).optional(),
  competition: z.object({
    federationRules: z.string().optional(),
    defaultBarWeight: z.number().optional(),
    defaultPlateSet: z.array(plateDefinitionSchema).optional(),
  }).optional(),
  database: z.object({
    backupEnabled: z.boolean().optional(),
    autoBackupInterval: z.number().optional(),
  }).optional(),
})), async (c) => {
  const db = c.env.DB;
  const input = c.req.valid('json');
  const row = await executeQueryOne(db, 'SELECT data FROM settings WHERE id = 1');
  const currentSettings = row ? sanitizeSettings(JSON.parse(row.data)) : getDefaultSettings();
  const updates = coercePartialSettings(input);
  const merged = mergeSettings(currentSettings, updates);

  await executeMutation(
    db,
    `
    INSERT OR REPLACE INTO settings (id, data, updated_at)
    VALUES (1, ?, ?)
    `,
    [serializeSettings(merged), getCurrentTimestamp()]
  );

  return c.json({
    data: { success: true },
    error: null,
    requestId: c.get('requestId'),
  });
});

// PATCH /settings/ui - Update UI settings
settings.patch('/ui', zValidator('json', z.object({
  theme: z.string().optional(),
  showWeights: z.boolean().optional(),
  showAttempts: z.boolean().optional(),
})), async (c) => {
  const db = c.env.DB;
  const input = c.req.valid('json');

  const row = await executeQueryOne(db, 'SELECT data FROM settings WHERE id = 1');
  const currentSettings = row ? sanitizeSettings(JSON.parse(row.data)) : getDefaultSettings();
  const updates = coercePartialSettings({ ui: input });
  const merged = mergeSettings(currentSettings, updates);

  await executeMutation(
    db,
    `
    INSERT OR REPLACE INTO settings (id, data, updated_at)
    VALUES (1, ?, ?)
    `,
    [serializeSettings(merged), getCurrentTimestamp()]
  );

  return c.json({
    data: { success: true },
    error: null,
    requestId: c.get('requestId'),
  });
});

// GET /settings/ui - Retrieve UI settings
settings.get('/ui', async (c) => {
  const db = c.env.DB;

  const row = await executeQueryOne(db, 'SELECT data FROM settings WHERE id = 1');
  const settingsData = row ? sanitizeSettings(JSON.parse(row.data)) : getDefaultSettings();
  const ui = settingsData.ui;

  return c.json({
    data: ui,
    error: null,
    requestId: c.get('requestId'),
  });
});

// PATCH /settings/competition - Update competition settings
settings.patch('/competition', zValidator('json', z.object({
  federationRules: z.string().optional(),
  defaultBarWeight: z.number().optional(),
  defaultPlateSet: z.array(plateDefinitionSchema).optional(),
})), async (c) => {
  const db = c.env.DB;
  const input = c.req.valid('json');

  const row = await executeQueryOne(db, 'SELECT data FROM settings WHERE id = 1');
  const currentSettings = row ? sanitizeSettings(JSON.parse(row.data)) : getDefaultSettings();

  const competitionUpdate: Partial<SettingsData['competition']> = {};
  if (input.federationRules !== undefined) {
    competitionUpdate.federationRules = input.federationRules;
  }
  if (input.defaultBarWeight !== undefined) {
    competitionUpdate.defaultBarWeight = input.defaultBarWeight;
  }
  if (input.defaultPlateSet !== undefined) {
    competitionUpdate.defaultPlateSet = sanitizePlateSet(input.defaultPlateSet);
  }

  const updates: Partial<SettingsData> = Object.keys(competitionUpdate).length > 0
    ? { competition: competitionUpdate as SettingsData['competition'] }
    : {};

  const merged = mergeSettings(currentSettings, updates);

  await executeMutation(
    db,
    `
    INSERT OR REPLACE INTO settings (id, data, updated_at)
    VALUES (1, ?, ?)
    `,
    [serializeSettings(merged), getCurrentTimestamp()]
  );

  return c.json({
    data: { success: true },
    error: null,
    requestId: c.get('requestId'),
  });
});

// PATCH /settings/database - Update database settings
settings.patch('/database', zValidator('json', z.object({
  backupEnabled: z.boolean().optional(),
  autoBackupInterval: z.number().optional(),
})), async (c) => {
  const db = c.env.DB;
  const input = c.req.valid('json');

  const row = await executeQueryOne(db, 'SELECT data FROM settings WHERE id = 1');
  const currentSettings = row ? sanitizeSettings(JSON.parse(row.data)) : getDefaultSettings();
  const updates = coercePartialSettings({ database: input });
  const merged = mergeSettings(currentSettings, updates);

  await executeMutation(
    db,
    `
    INSERT OR REPLACE INTO settings (id, data, updated_at)
    VALUES (1, ?, ?)
    `,
    [serializeSettings(merged), getCurrentTimestamp()]
  );

  return c.json({
    data: { success: true },
    error: null,
    requestId: c.get('requestId'),
  });
});

// PUT /settings/language - Set language
settings.put('/language', zValidator('json', z.object({
  language: z.string(),
})), async (c) => {
  const db = c.env.DB;
  const { language } = c.req.valid('json');

  const row = await executeQueryOne(db, 'SELECT data FROM settings WHERE id = 1');
  const currentSettings = row ? sanitizeSettings(JSON.parse(row.data)) : getDefaultSettings();
  const merged = mergeSettings(currentSettings, { language });

  await executeMutation(
    db,
    `
    INSERT OR REPLACE INTO settings (id, data, updated_at)
    VALUES (1, ?, ?)
    `,
    [serializeSettings(merged), getCurrentTimestamp()]
  );

  return c.json({
    data: { success: true },
    error: null,
    requestId: c.get('requestId'),
  });
});

// GET /settings/language - Get language
settings.get('/language', async (c) => {
  const db = c.env.DB;

  const current = await executeQueryOne(db, 'SELECT data FROM settings WHERE id = 1');
  const settings = current ? sanitizeSettings(JSON.parse(current.data)) : getDefaultSettings();
  return c.json({
    data: { language: settings.language || 'pl' },
    error: null,
    requestId: c.get('requestId'),
  });
});

// POST /settings/reset - Reset to defaults
settings.post('/reset', async (c) => {
  const db = c.env.DB;

  const defaultSettings = getDefaultSettings();

  await executeMutation(
    db,
    `
    INSERT OR REPLACE INTO settings (id, data, updated_at)
    VALUES (1, ?, ?)
    `,
    [serializeSettings(defaultSettings), getCurrentTimestamp()]
  );

  return c.json({
    data: defaultSettings,
    error: null,
    requestId: c.get('requestId'),
  });
});

// GET /settings/health - Health check
settings.get('/health', async (c) => {
  const db = c.env.DB;

  try {
    // Simple health check
    await executeQuery(db, 'SELECT 1 as health_check');
    return c.json({
      data: {
        status: 'healthy',
        database: 'connected',
        timestamp: getCurrentTimestamp()
      },
      error: null,
      requestId: c.get('requestId'),
    });
  } catch (error) {
    return c.json({
      error: error instanceof Error ? error.message : 'Unknown error',
      requestId: c.get('requestId'),
    }, 503);
  }
});

export default settings;

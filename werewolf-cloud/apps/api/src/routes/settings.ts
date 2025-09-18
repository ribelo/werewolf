import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { WerewolfEnvironment } from '../env';
import { executeQuery, executeQueryOne, executeMutation, getCurrentTimestamp, convertKeysToCamelCase } from '../utils/database';

const settings = new Hono<WerewolfEnvironment>();

// GET /settings - Get all settings
settings.get('/', async (c) => {
  const db = c.env.DB;

  const settings = await executeQueryOne(
    db,
    'SELECT data FROM settings LIMIT 1'
  );

  if (!settings) {
    // Return default settings if none exist
    return c.json({
      data: {
        language: 'pl',
        ui: {
          theme: 'light',
          showWeights: true,
          showAttempts: true,
        },
        competition: {
          federationRules: 'IPF',
          defaultBarWeight: 20,
        },
        database: {
          backupEnabled: true,
          autoBackupInterval: 24,
        },
      },
      error: null,
      requestId: c.get('requestId'),
    });
  }

  // Parse the JSON data and return structured object
  try {
    const parsedSettings = JSON.parse(settings.data);
    return c.json({
      data: parsedSettings,
      error: null,
      requestId: c.get('requestId'),
    });
  } catch (error) {
    console.error('Failed to parse settings data:', error);
    // Return defaults if parsing fails
    return c.json({
      data: {
        language: 'pl',
        ui: {
          theme: 'light',
          showWeights: true,
          showAttempts: true,
        },
        competition: {
          federationRules: 'IPF',
          defaultBarWeight: 20,
        },
        database: {
          backupEnabled: true,
          autoBackupInterval: 24,
        },
      },
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
  }).optional(),
  database: z.object({
    backupEnabled: z.boolean().optional(),
    autoBackupInterval: z.number().optional(),
  }).optional(),
})), async (c) => {
  const db = c.env.DB;
  const input = c.req.valid('json');

  const settingsJson = JSON.stringify(input);

  await executeMutation(
    db,
    `
    INSERT OR REPLACE INTO settings (id, data, updated_at)
    VALUES (1, ?, ?)
    `,
    [settingsJson, getCurrentTimestamp()]
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

  // Get current settings
  const current = await executeQueryOne(
    db,
    'SELECT data FROM settings WHERE id = 1'
  );

  const currentSettings = current ? JSON.parse(current.data) : {};
  const updatedSettings = {
    ...currentSettings,
    ui: {
      ...currentSettings.ui,
      ...input,
    },
  };

  await executeMutation(
    db,
    `
    INSERT OR REPLACE INTO settings (id, data, updated_at)
    VALUES (1, ?, ?)
    `,
    [JSON.stringify(updatedSettings), getCurrentTimestamp()]
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

  const current = await executeQueryOne(
    db,
    'SELECT data FROM settings WHERE id = 1'
  );

  const currentSettings = current ? JSON.parse(current.data) : {};
  const ui = currentSettings.ui ?? {
    theme: 'light',
    showWeights: true,
    showAttempts: true,
  };

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
})), async (c) => {
  const db = c.env.DB;
  const input = c.req.valid('json');

  // Get current settings
  const current = await executeQueryOne(
    db,
    'SELECT data FROM settings WHERE id = 1'
  );

  const currentSettings = current ? JSON.parse(current.data) : {};
  const updatedSettings = {
    ...currentSettings,
    competition: {
      ...currentSettings.competition,
      ...input,
    },
  };

  await executeMutation(
    db,
    `
    INSERT OR REPLACE INTO settings (id, data, updated_at)
    VALUES (1, ?, ?)
    `,
    [JSON.stringify(updatedSettings), getCurrentTimestamp()]
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

  // Get current settings
  const current = await executeQueryOne(
    db,
    'SELECT data FROM settings WHERE id = 1'
  );

  const currentSettings = current ? JSON.parse(current.data) : {};
  const updatedSettings = {
    ...currentSettings,
    database: {
      ...currentSettings.database,
      ...input,
    },
  };

  await executeMutation(
    db,
    `
    INSERT OR REPLACE INTO settings (id, data, updated_at)
    VALUES (1, ?, ?)
    `,
    [JSON.stringify(updatedSettings), getCurrentTimestamp()]
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

  // Get current settings
  const current = await executeQueryOne(
    db,
    'SELECT data FROM settings WHERE id = 1'
  );

  const currentSettings = current ? JSON.parse(current.data) : {};
  const updatedSettings = {
    ...currentSettings,
    language,
  };

  await executeMutation(
    db,
    `
    INSERT OR REPLACE INTO settings (id, data, updated_at)
    VALUES (1, ?, ?)
    `,
    [JSON.stringify(updatedSettings), getCurrentTimestamp()]
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

  const current = await executeQueryOne(
    db,
    'SELECT data FROM settings WHERE id = 1'
  );

  const settings = current ? JSON.parse(current.data) : {};
  return c.json({
    data: { language: settings.language || 'pl' },
    error: null,
    requestId: c.get('requestId'),
  });
});

// POST /settings/reset - Reset to defaults
settings.post('/reset', async (c) => {
  const db = c.env.DB;

  const defaultSettings = {
    language: 'pl',
    ui: {
      theme: 'light',
      showWeights: true,
      showAttempts: true,
    },
    competition: {
      federationRules: 'IPF',
      defaultBarWeight: 20,
    },
    database: {
      backupEnabled: true,
      autoBackupInterval: 24,
    },
  };

  await executeMutation(
    db,
    `
    INSERT OR REPLACE INTO settings (id, data, updated_at)
    VALUES (1, ?, ?)
    `,
    [JSON.stringify(defaultSettings), getCurrentTimestamp()]
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

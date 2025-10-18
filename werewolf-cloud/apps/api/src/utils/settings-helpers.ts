export interface PlateDefinition {
  weight: number;
  quantity: number;
  color: string;
}

export interface SettingsData {
  language: string;
  ui: {
    theme: string;
    showWeights: boolean;
    showAttempts: boolean;
  };
  competition: {
    federationRules: string;
    defaultBarWeight: number;
    defaultPlateSet: PlateDefinition[];
  };
  database: {
    backupEnabled: boolean;
    autoBackupInterval: number;
  };
}

export const DEFAULT_PLATE_SET: PlateDefinition[] = [
  { weight: 25, quantity: 4, color: '#DC2626' },
  { weight: 20, quantity: 4, color: '#2563EB' },
  { weight: 15, quantity: 4, color: '#EAB308' },
  { weight: 10, quantity: 6, color: '#16A34A' },
  { weight: 5, quantity: 6, color: '#F8FAFC' },
  { weight: 2.5, quantity: 6, color: '#DC2626' },
  { weight: 1.25, quantity: 4, color: '#16A34A' },
  { weight: 0.5, quantity: 4, color: '#6B7280' },
];

function clonePlateSet(set: PlateDefinition[]): PlateDefinition[] {
  return set.map((plate) => ({ ...plate }));
}

export function getDefaultSettings(): SettingsData {
  return {
    language: 'pl',
    ui: {
      theme: 'light',
      showWeights: true,
      showAttempts: true,
    },
    competition: {
      federationRules: 'IPF',
      defaultBarWeight: 20,
      defaultPlateSet: clonePlateSet(DEFAULT_PLATE_SET),
    },
    database: {
      backupEnabled: true,
      autoBackupInterval: 24,
    },
  };
}

export function getPlateColor(weight: number): string {
  if (Math.abs(weight - 25) < 0.001 || Math.abs(weight - 2.5) < 0.001) return '#DC2626';
  if (Math.abs(weight - 20) < 0.001 || Math.abs(weight - 2) < 0.001) return '#2563EB';
  if (Math.abs(weight - 15) < 0.001 || Math.abs(weight - 1.5) < 0.001) return '#EAB308';
  if (
    Math.abs(weight - 10) < 0.001 ||
    Math.abs(weight - 1.25) < 0.001 ||
    Math.abs(weight - 1) < 0.001
  )
    return '#16A34A';
  if (Math.abs(weight - 5) < 0.001) return '#F8FAFC';
  if (weight <= 1) return '#6B7280';
  return '#374151';
}

export function sanitizePlateSet(input: unknown): PlateDefinition[] {
  if (!Array.isArray(input)) {
    return clonePlateSet(DEFAULT_PLATE_SET);
  }

  const dedup = new Map<number, PlateDefinition>();

  for (const entry of input) {
    if (typeof entry !== 'object' || entry === null) continue;
    const weight = Number((entry as Record<string, unknown>)['weight']);
    const qtyValue = Number((entry as Record<string, unknown>)['quantity']);
    if (!Number.isFinite(weight) || weight <= 0) continue;
    const quantity = Number.isFinite(qtyValue) ? Math.max(0, Math.trunc(qtyValue)) : 0;
    const colorValue = (entry as Record<string, unknown>)['color'];
    const color =
      typeof colorValue === 'string' && colorValue.trim().length > 0
        ? colorValue
        : getPlateColor(weight);
    dedup.set(weight, { weight, quantity, color });
  }

  if (dedup.size === 0) {
    return clonePlateSet(DEFAULT_PLATE_SET);
  }

  return Array.from(dedup.values()).sort((a, b) => b.weight - a.weight);
}

export function sanitizeSettings(raw: unknown): SettingsData {
  const defaults = getDefaultSettings();
  if (typeof raw !== 'object' || raw === null) {
    return defaults;
  }

  const source = raw as Record<string, unknown>;
  const uiSource = (source['ui'] as Record<string, unknown>) ?? {};
  const competitionSource = (source['competition'] as Record<string, unknown>) ?? {};
  const databaseSource = (source['database'] as Record<string, unknown>) ?? {};

  const showAttempts =
    typeof uiSource['showAttempts'] === 'boolean'
      ? uiSource['showAttempts']
      : defaults.ui.showAttempts;

  const result: SettingsData = {
    language: typeof source['language'] === 'string' ? source['language'] : defaults.language,
    ui: {
      theme: typeof uiSource['theme'] === 'string' ? uiSource['theme'] : defaults.ui.theme,
      showAttempts,
      showWeights: showAttempts,
    },
    competition: {
      federationRules:
        typeof competitionSource['federationRules'] === 'string'
          ? competitionSource['federationRules']
          : defaults.competition.federationRules,
      defaultBarWeight:
        Number.isFinite(Number(competitionSource['defaultBarWeight']))
          ? Number(competitionSource['defaultBarWeight'])
          : defaults.competition.defaultBarWeight,
      defaultPlateSet: sanitizePlateSet(competitionSource['defaultPlateSet']),
    },
    database: {
      backupEnabled:
        typeof databaseSource['backupEnabled'] === 'boolean'
          ? databaseSource['backupEnabled']
          : defaults.database.backupEnabled,
      autoBackupInterval:
        Number.isFinite(Number(databaseSource['autoBackupInterval']))
          ? Number(databaseSource['autoBackupInterval'])
          : defaults.database.autoBackupInterval,
    },
  };

  result.ui.showWeights = result.ui.showAttempts;

  return result;
}

export function serializeSettings(settings: SettingsData): string {
  return JSON.stringify(settings);
}

export function mergeSettings(
  current: SettingsData,
  updates: Partial<SettingsData>
): SettingsData {
  const merged = {
    ...current,
    ...updates,
    ui: {
      ...current.ui,
      ...(updates.ui ?? {}),
    },
    competition: {
      ...current.competition,
      ...(updates.competition ?? {}),
    },
    database: {
      ...current.database,
      ...(updates.database ?? {}),
    },
  };

  merged.competition.defaultPlateSet = sanitizePlateSet(
    merged.competition.defaultPlateSet
  );
  merged.ui.showWeights = merged.ui.showAttempts;

  return merged;
}

export function coercePartialSettings(partial: unknown): Partial<SettingsData> {
  if (typeof partial !== 'object' || partial === null) {
    return {};
  }

  const source = partial as Record<string, unknown>;
  const updates: Partial<SettingsData> = {};

  if (typeof source['language'] === 'string') {
    updates.language = source['language'];
  }

  if (typeof source['ui'] === 'object' && source['ui'] !== null) {
    const uiSource = source['ui'] as Record<string, unknown>;
    const uiUpdate: Partial<SettingsData['ui']> = {};
    if ('theme' in uiSource && typeof uiSource['theme'] === 'string') {
      uiUpdate.theme = uiSource['theme'];
    }

    if ('showAttempts' in uiSource && typeof uiSource['showAttempts'] === 'boolean') {
      uiUpdate.showAttempts = uiSource['showAttempts'];
      uiUpdate.showWeights = uiSource['showAttempts'];
    }
    if ('showWeights' in uiSource && typeof uiSource['showWeights'] === 'boolean') {
      uiUpdate.showAttempts = uiSource['showWeights'];
      uiUpdate.showWeights = uiSource['showWeights'];
    }
    if (Object.keys(uiUpdate).length > 0) {
      updates.ui = uiUpdate as SettingsData['ui'];
    }
  }

  if (typeof source['competition'] === 'object' && source['competition'] !== null) {
    const competitionSource = source['competition'] as Record<string, unknown>;
    const competitionUpdate: Partial<SettingsData['competition']> = {};
    if ('federationRules' in competitionSource && typeof competitionSource['federationRules'] === 'string') {
      competitionUpdate.federationRules = competitionSource['federationRules'];
    }
    if (
      'defaultBarWeight' in competitionSource &&
      Number.isFinite(Number(competitionSource['defaultBarWeight']))
    ) {
      competitionUpdate.defaultBarWeight = Number(competitionSource['defaultBarWeight']);
    }
    if ('defaultPlateSet' in competitionSource) {
      competitionUpdate.defaultPlateSet = sanitizePlateSet(competitionSource['defaultPlateSet']);
    }
    if (Object.keys(competitionUpdate).length > 0) {
      updates.competition = competitionUpdate as SettingsData['competition'];
    }
  }

  if (typeof source['database'] === 'object' && source['database'] !== null) {
    const databaseSource = source['database'] as Record<string, unknown>;
    const databaseUpdate: Partial<SettingsData['database']> = {};
    if ('backupEnabled' in databaseSource && typeof databaseSource['backupEnabled'] === 'boolean') {
      databaseUpdate.backupEnabled = databaseSource['backupEnabled'];
    }
    if (
      'autoBackupInterval' in databaseSource &&
      Number.isFinite(Number(databaseSource['autoBackupInterval']))
    ) {
      databaseUpdate.autoBackupInterval = Number(databaseSource['autoBackupInterval']);
    }
    if (Object.keys(databaseUpdate).length > 0) {
      updates.database = databaseUpdate as SettingsData['database'];
    }
  }

  return updates;
}

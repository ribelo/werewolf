import { apiClient, type ApiResponse } from '$lib/api';
import type { Settings, SystemHealth, DatabaseInfo, BackupSummary } from '$lib/types';

export interface SettingsPageData {
  settings: Settings | null;
  settingsError: string | null;
  health: SystemHealth | null;
  healthError: string | null;
  database: DatabaseInfo | null;
  databaseError: string | null;
  backups: BackupSummary | null;
  backupsError: string | null;
  apiBase: string;
}

interface Unwrapped<T> {
  data: T | null;
  error: string | null;
}

function unwrap<T>(result: PromiseSettledResult<ApiResponse<T>>): Unwrapped<T> {
  if (result.status === 'fulfilled') {
    return {
      data: result.value.data ?? null,
      error: result.value.error,
    };
  }
  return {
    data: null,
    error: result.reason instanceof Error ? result.reason.message : 'Unknown error',
  };
}

export const load = async ({ fetch }): Promise<SettingsPageData> => {
  const [settingsResp, healthResp, dbResp, backupsResp] = await Promise.allSettled([
    apiClient.get<Settings>('/settings', fetch),
    apiClient.get<SystemHealth>('/system/health', fetch),
    apiClient.get<DatabaseInfo>('/system/database', fetch),
    apiClient.get<BackupSummary>('/system/backups', fetch),
  ]);

  const settings = unwrap(settingsResp);
  const health = unwrap(healthResp);
  const database = unwrap(dbResp);
  const backups = unwrap(backupsResp);

  return {
    settings: settings.data,
    settingsError: settings.error,
    health: health.data,
    healthError: health.error,
    database: database.data,
    databaseError: database.error,
    backups: backups.data,
    backupsError: backups.error,
    apiBase: apiClient.baseUrl,
  };
};

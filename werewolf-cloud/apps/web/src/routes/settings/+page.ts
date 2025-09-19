import { apiClient } from '$lib/api';
import type { Settings, SystemHealth, DatabaseInfo, BackupSummary } from '$lib/types';

export const load = async ({ fetch }) => {
  const [settingsResp, healthResp, dbResp, backupsResp] = await Promise.allSettled([
    apiClient.get<Settings>('/settings', fetch),
    apiClient.get<SystemHealth>('/system/health', fetch),
    apiClient.get<DatabaseInfo>('/system/database', fetch),
    apiClient.get<BackupSummary>('/system/backups', fetch)
  ]);

  const unwrap = <T>(result: PromiseSettledResult<{ data: T; error: string | null }>) => {
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
  };

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

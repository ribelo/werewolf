import { apiClient } from '$lib/api';
import type { Settings, SystemHealth, DatabaseInfo } from '$lib/types';

export const load = async () => {
  const [settingsResp, healthResp, dbResp] = await Promise.allSettled([
    apiClient.get<Settings>('/settings'),
    apiClient.get<SystemHealth>('/system/health'),
    apiClient.get<DatabaseInfo>('/system/database')
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

  return {
    settings: settings.data,
    settingsError: settings.error,
    health: health.data,
    healthError: health.error,
    database: database.data,
    databaseError: database.error,
    apiBase: apiClient.baseUrl,
  };
};

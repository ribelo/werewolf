import { apiClient, type ApiResponse } from '$lib/api';
import type { ContestSummary, DatabaseInfo } from '$lib/types';

export interface DashboardData {
  contests: ContestSummary[];
  error: string | null;
  database: DatabaseInfo | null;
  databaseError: string | null;
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

export const load = async ({ fetch }): Promise<DashboardData> => {
  // The contest list is the page's primary content: it must render even when
  // the auxiliary database statistics request fails.
  const [contestsResult, databaseResult] = await Promise.allSettled([
    apiClient.get<ContestSummary[]>('/contests', fetch),
    apiClient.get<DatabaseInfo>('/system/database', fetch),
  ]);

  const contests = unwrap(contestsResult);
  const database = unwrap(databaseResult);

  return {
    contests: contests.data ?? [],
    error: contests.error,
    database: database.data,
    databaseError: database.error,
    apiBase: apiClient.baseUrl,
  };
};

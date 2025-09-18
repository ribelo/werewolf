import { apiClient } from '$lib/api';
import type { ContestSummary, DatabaseInfo } from '$lib/types';

export const load = async ({ fetch }) => {
  try {
    const [contestsResponse, databaseResponse] = await Promise.all([
      apiClient.get<ContestSummary[]>('/contests'),
      apiClient.get<DatabaseInfo>('/system/database')
    ]);

    return {
      contests: contestsResponse.data ?? [],
      error: contestsResponse.error,
      database: databaseResponse.data ?? null,
      databaseError: databaseResponse.error,
      apiBase: apiClient.baseUrl,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      contests: [] as ContestSummary[],
      error: message,
      database: null,
      databaseError: message,
      apiBase: apiClient.baseUrl,
    };
  }
};

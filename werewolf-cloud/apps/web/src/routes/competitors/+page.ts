import { apiClient } from '$lib/api';
import type { CompetitorSummary } from '$lib/types';

export const load = async ({ fetch }) => {
  try {
    const response = await apiClient.get<CompetitorSummary[]>('/competitors');
    return {
      competitors: response.data ?? [],
      error: response.error,
      apiBase: apiClient.baseUrl,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      competitors: [] as CompetitorSummary[],
      error: message,
      apiBase: apiClient.baseUrl,
    };
  }
};

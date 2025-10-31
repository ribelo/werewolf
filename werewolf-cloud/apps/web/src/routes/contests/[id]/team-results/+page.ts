import type { PageLoad } from './$types';
import { apiClient } from '$lib/api';
import type { TeamResultsBundle } from '$lib/types';

export const load: PageLoad = async ({ params, fetch }) => {
  const contestId = params.id;

  try {
    const response = await apiClient.get<TeamResultsBundle>(`/contests/${contestId}/results/team`, fetch);

    if (response.error) {
      throw new Error(response.error);
    }

    return {
      teamResults: response.data ?? null,
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return {
      teamResults: null,
      error: message,
    };
  }
};

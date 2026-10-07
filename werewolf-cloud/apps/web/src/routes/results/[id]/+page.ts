import type { PageLoad } from './$types';
import { apiClient } from '$lib/api';
import type { PublicResultsBundle } from '$lib/types';

export const load: PageLoad = async ({ params, fetch, url }) => {
  const contestId = params.id;

  try {
    const response = await apiClient.get<PublicResultsBundle>(
      `/contests/${contestId}/results/public-bundle`,
      fetch
    );

    if (response.error || !response.data) {
      return {
        contest: null,
        resultsBundle: null,
        error: response.error || 'Failed to load results',
        lastUpdated: null,
      };
    }

    return {
      contest: response.data.contest,
      resultsBundle: response.data,
      error: null,
      lastUpdated: response.data.lastUpdated,
      // Pass tab from URL query params for shareable state
      selectedTab: url.searchParams.get('tab') || 'individual',
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return {
      contest: null,
      resultsBundle: null,
      error: message,
      lastUpdated: null,
      selectedTab: 'individual',
    };
  }
};
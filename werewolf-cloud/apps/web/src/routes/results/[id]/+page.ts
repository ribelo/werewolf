import type { PageLoad } from './$types';
import { apiClient } from '$lib/api';
import { parseResultsTab, type ResultsTab } from '$lib/components/public-results';
import type { ContestDetail, PublicResultsBundle } from '$lib/types';

/** One shape for every outcome, so the page data always has the same keys. */
export interface ResultsPageData {
  contest: ContestDetail | null;
  resultsBundle: PublicResultsBundle | null;
  error: string | null;
  lastUpdated: string | null;
  /** Validated `?tab=` query parameter; unknown values fall back to the individual tab. */
  selectedTab: ResultsTab;
}

export const load: PageLoad = async ({ params, fetch, url }) => {
  const contestId = params.id;
  const selectedTab = parseResultsTab(url.searchParams.get('tab'));

  const unavailable = (error: string | null): ResultsPageData => ({
    contest: null,
    resultsBundle: null,
    error,
    lastUpdated: null,
    selectedTab,
  });

  try {
    const response = await apiClient.get<PublicResultsBundle>(
      `/contests/${contestId}/results/public-bundle`,
      fetch
    );

    if (response.error || !response.data) {
      return unavailable(response.error || 'Failed to load results');
    }

    return {
      contest: response.data.contest,
      resultsBundle: response.data,
      error: null,
      lastUpdated: response.data.lastUpdated,
      selectedTab,
    };
  } catch (err) {
    return unavailable(err instanceof Error ? err.message : 'Unknown error');
  }
};

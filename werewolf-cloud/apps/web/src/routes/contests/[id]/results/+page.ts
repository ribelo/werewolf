import type { PageLoad } from './$types';
import { apiClient } from '$lib/api';
import type { ContestRankingEntry } from '$lib/types';

type ContestRankings = {
  open: ContestRankingEntry[];
  age: ContestRankingEntry[];
  weight: ContestRankingEntry[];
};

/** One shape for every outcome, so the page data always has the same keys. */
type ResultsPageData = {
  resultsOpen: ContestRankingEntry[];
  resultsAge: ContestRankingEntry[];
  resultsWeight: ContestRankingEntry[];
  error: string | null;
};

export const load: PageLoad = async ({ params, fetch }) => {
  const contestId = params.id;

  const unavailable = (error: string | null): ResultsPageData => ({
    resultsOpen: [],
    resultsAge: [],
    resultsWeight: [],
    error,
  });

  try {
    // Prefer new aggregated endpoint; fall back to three requests if unavailable
    const bundle = await apiClient.get<ContestRankings>(
      `/contests/${contestId}/results/rankings/all`,
      fetch,
    );

    if (!bundle.error && bundle.data) {
      return {
        resultsOpen: bundle.data.open ?? [],
        resultsAge: bundle.data.age ?? [],
        resultsWeight: bundle.data.weight ?? [],
        error: null,
      };
    }

    // Fallback for backward-compatibility
    const [openRes, ageRes, weightRes] = await Promise.all([
      apiClient.get<ContestRankingEntry[]>(`/contests/${contestId}/results/rankings?type=open`, fetch),
      apiClient.get<ContestRankingEntry[]>(`/contests/${contestId}/results/rankings?type=age`, fetch),
      apiClient.get<ContestRankingEntry[]>(`/contests/${contestId}/results/rankings?type=weight`, fetch),
    ]);

    const error = openRes.error || ageRes.error || weightRes.error || null;
    if (error) {
      return unavailable(error);
    }

    return {
      resultsOpen: openRes.data ?? [],
      resultsAge: ageRes.data ?? [],
      resultsWeight: weightRes.data ?? [],
      error: null,
    };
  } catch (err) {
    return unavailable(err instanceof Error ? err.message : 'Unknown error');
  }
};

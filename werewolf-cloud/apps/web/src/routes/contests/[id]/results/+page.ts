import type { PageLoad } from './$types';
import { apiClient } from '$lib/api';
import type { ContestRankingEntry } from '$lib/types';

export const load: PageLoad = async ({ params, fetch }) => {
  const contestId = params.id;

  try {
    // Prefer new aggregated endpoint; fall back to three requests if unavailable
    const bundle = await apiClient.get<{ open: ContestRankingEntry[]; age: ContestRankingEntry[]; weight: ContestRankingEntry[] }>(
      `/contests/${contestId}/results/rankings/all`,
      fetch,
    );

    if (!bundle.error && bundle.data) {
      return {
        resultsOpen: bundle.data.open ?? [],
        resultsAge: bundle.data.age ?? [],
        resultsWeight: bundle.data.weight ?? [],
      };
    }

    // Fallback for backward-compatibility
    const [openRes, ageRes, weightRes] = await Promise.all([
      apiClient.get<ContestRankingEntry[]>(`/contests/${contestId}/results/rankings?type=open`, fetch),
      apiClient.get<ContestRankingEntry[]>(`/contests/${contestId}/results/rankings?type=age`, fetch),
      apiClient.get<ContestRankingEntry[]>(`/contests/${contestId}/results/rankings?type=weight`, fetch),
    ]);

    const error = openRes.error || ageRes.error || weightRes.error || null;
    if (error) throw new Error(error);

    return {
      resultsOpen: openRes.data ?? [],
      resultsAge: ageRes.data ?? [],
      resultsWeight: weightRes.data ?? [],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return {
      resultsOpen: [],
      resultsAge: [],
      resultsWeight: [],
      error: message,
    };
  }
};

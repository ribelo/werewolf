import { apiClient } from '$lib/api';
import type { ApiResponse } from '$lib/api';
import type {
  ContestDetail,
  Registration,
  ReferenceData,
  Attempt,
  CurrentAttemptBundle,
  ContestRankingEntry,
  ContestPlateSetEntry,
  ContestBarWeights,
  BackupSummary,
  ContestCategories,
  ContestTag,
} from '$lib/types';

export const load = async ({ params, fetch }) => {
  const contestId = params.id;

  try {
    const results = await Promise.allSettled([
      apiClient.get<ContestDetail>(`/contests/${contestId}`, fetch),
      apiClient.get<Registration[]>(`/contests/${contestId}/registrations`, fetch),
      apiClient.get<Attempt[]>(`/contests/${contestId}/attempts`, fetch),
      apiClient.get<CurrentAttemptBundle | null>(`/contests/${contestId}/attempts/current`, fetch),
      apiClient.get<ContestCategories>(`/contests/${contestId}/categories`, fetch),
      apiClient.get<ContestTag[]>(`/contests/${contestId}/tags`, fetch),
      apiClient.get<ContestRankingEntry[]>(`/contests/${contestId}/results/rankings?type=open`, fetch),
      apiClient.get<ContestRankingEntry[]>(`/contests/${contestId}/results/rankings?type=age`, fetch),
      apiClient.get<ContestRankingEntry[]>(`/contests/${contestId}/results/rankings?type=weight`, fetch),
      apiClient.get<ContestPlateSetEntry[]>(`/contests/${contestId}/platesets`, fetch),
      apiClient.get<ContestBarWeights>(`/contests/${contestId}/platesets/barweights`, fetch),
      apiClient.get<BackupSummary>(`/system/backups`, fetch),
    ]) as [
      PromiseSettledResult<ApiResponse<ContestDetail>>,
      PromiseSettledResult<ApiResponse<Registration[]>>,
      PromiseSettledResult<ApiResponse<Attempt[]>>,
      PromiseSettledResult<ApiResponse<CurrentAttemptBundle | null>>,
      PromiseSettledResult<ApiResponse<ContestCategories>>,
      PromiseSettledResult<ApiResponse<ContestTag[]>>,
      PromiseSettledResult<ApiResponse<ContestRankingEntry[]>>,
      PromiseSettledResult<ApiResponse<ContestRankingEntry[]>>,
      PromiseSettledResult<ApiResponse<ContestRankingEntry[]>>,
      PromiseSettledResult<ApiResponse<ContestPlateSetEntry[]>>,
      PromiseSettledResult<ApiResponse<ContestBarWeights>>,
      PromiseSettledResult<ApiResponse<BackupSummary>>,
    ];

    const unwrap = <T>(result: PromiseSettledResult<ApiResponse<T>>) => {
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

    const contestResponse = unwrap(results[0]);
    const regResponse = unwrap(results[1]);
    const attemptsResponse = unwrap(results[2]);
    const currentAttemptResponse = unwrap(results[3]);
    const categoriesResponse = unwrap(results[4]);
    const tagsResponse = unwrap(results[5]);
    const openResultsResponse = unwrap(results[6]);
    const ageResultsResponse = unwrap(results[7]);
    const weightResultsResponse = unwrap(results[8]);
    const plateSetsResponse = unwrap(results[9]);
    const barWeightsResponse = unwrap(results[10]);
    const backupsResponse = unwrap(results[11]);

    const referenceData: ReferenceData = categoriesResponse.data ?? {
      weightClasses: [],
      ageCategories: [],
    };

    const combinedError = contestResponse.error
      || regResponse.error
      || attemptsResponse.error
      || currentAttemptResponse.error
      || categoriesResponse.error
      || tagsResponse.error
      || openResultsResponse.error
      || ageResultsResponse.error
      || weightResultsResponse.error
      || plateSetsResponse.error
      || barWeightsResponse.error
      || backupsResponse.error
      || null;

    return {
      contest: contestResponse.data,
      registrations: regResponse.data ?? [],
      attempts: attemptsResponse.data ?? [],
      currentAttempt: currentAttemptResponse.data,
      referenceData,
      contestTags: tagsResponse.data ?? [],
      resultsOpen: openResultsResponse.data ?? [],
      resultsAge: ageResultsResponse.data ?? [],
      resultsWeight: weightResultsResponse.data ?? [],
      plateSets: plateSetsResponse.data ?? [],
      barWeights: barWeightsResponse.data,
      backupsSummary: backupsResponse.data,
      error: combinedError,
      apiBase: apiClient.baseUrl,
      contestId,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      contest: null,
      registrations: [],
      attempts: [],
      currentAttempt: null,
      referenceData: { weightClasses: [], ageCategories: [] },
      contestTags: [],
      error: message,
      apiBase: apiClient.baseUrl,
      contestId,
    };
  }
};

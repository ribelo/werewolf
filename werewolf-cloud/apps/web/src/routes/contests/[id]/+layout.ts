import type { LayoutLoad } from './$types';
import { apiClient, type ApiResponse } from '$lib/api';
import type {
  ContestDetail,
  Registration,
  ReferenceData,
  Attempt,
  CurrentAttemptBundle,
  ContestPlateSetEntry,
  ContestBarWeights,
  BackupSummary,
  ContestCategories,
  ContestTag,
} from '$lib/types';

/**
 * The complete data contract for every contest tab. Both the happy path and
 * every failure path return this exact shape, so child pages never have to
 * deal with missing keys.
 */
type ContestLayoutData = {
  contest: ContestDetail | null;
  registrations: Registration[];
  attempts: Attempt[];
  currentAttempt: CurrentAttemptBundle | null;
  referenceData: ReferenceData;
  contestTags: ContestTag[];
  plateSets: ContestPlateSetEntry[];
  barWeights: ContestBarWeights | null;
  backupsSummary: BackupSummary | null;
  error: string | null;
  apiBase: string;
  contestId: string;
};

type Settled<T> = { value: T | null; error: string | null };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

function emptyReferenceData(): ReferenceData {
  return { weightClasses: [], ageCategories: [] };
}

/**
 * Turns one request into a value-or-unavailable pair and never rejects, so a
 * failing side request (plate sets, bar weights, backups summary, ...) cannot
 * take the whole contest desk down with it.
 */
async function settle<T>(request: Promise<ApiResponse<T>>): Promise<Settled<T>> {
  try {
    const response = await request;
    return { value: response.data ?? null, error: response.error ?? null };
  } catch (error) {
    return { value: null, error: errorMessage(error) };
  }
}

export const load: LayoutLoad = async ({ params, fetch }) => {
  const contestId = params.id;

  const unavailable = (error: string | null): ContestLayoutData => ({
    contest: null,
    registrations: [],
    attempts: [],
    currentAttempt: null,
    referenceData: emptyReferenceData(),
    contestTags: [],
    plateSets: [],
    barWeights: null,
    backupsSummary: null,
    error,
    apiBase: apiClient.baseUrl,
    contestId,
  });

  try {
    const [
      contest,
      registrations,
      attempts,
      currentAttempt,
      categories,
      tags,
      plateSets,
      barWeights,
      backups,
    ] = await Promise.all([
      settle(apiClient.get<ContestDetail>(`/contests/${contestId}`, fetch)),
      settle(apiClient.get<Registration[]>(`/contests/${contestId}/registrations`, fetch)),
      settle(apiClient.get<Attempt[]>(`/contests/${contestId}/attempts`, fetch)),
      settle(apiClient.get<CurrentAttemptBundle | null>(`/contests/${contestId}/attempts/current`, fetch)),
      settle(apiClient.get<ContestCategories>(`/contests/${contestId}/categories`, fetch)),
      settle(apiClient.get<ContestTag[]>(`/contests/${contestId}/tags`, fetch)),
      settle(apiClient.get<ContestPlateSetEntry[]>(`/contests/${contestId}/platesets`, fetch)),
      settle(apiClient.get<ContestBarWeights>(`/contests/${contestId}/platesets/barweights`, fetch)),
      settle(apiClient.get<BackupSummary>(`/system/backups`, fetch)),
    ]);

    // Only the contest itself can make the tab an error page; every auxiliary
    // request degrades to its unavailable value instead.
    if (contest.error || !contest.value) {
      return unavailable(contest.error);
    }

    return {
      contest: contest.value,
      registrations: registrations.value ?? [],
      attempts: attempts.value ?? [],
      currentAttempt: currentAttempt.value,
      referenceData: categories.value ?? emptyReferenceData(),
      contestTags: tags.value ?? [],
      plateSets: plateSets.value ?? [],
      barWeights: barWeights.value,
      backupsSummary: backups.value,
      error: null,
      apiBase: apiClient.baseUrl,
      contestId,
    };
  } catch (error) {
    return unavailable(errorMessage(error));
  }
};

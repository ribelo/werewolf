import { browser } from '$app/environment';
import { apiClient } from '$lib/api';
import { OfflineCache } from '$lib/cache';
import type {
  ContestDetail,
  Registration,
  Attempt,
  CurrentAttemptBundle,
  ReferenceData,
  ContestCategories,
  ContestPlateSetEntry,
} from '$lib/types';

export const load = async ({ url }) => {
  const contestId = url.searchParams.get('contestId');

  if (!contestId) {
    return {
      contest: null,
      registrations: [],
      attempts: [],
      currentAttempt: null,
      referenceData: { weightClasses: [], ageCategories: [] },
      plateSets: [],
      error: 'Contest ID is required',
      contestId: null,
      isOffline: false,
      cacheAge: null,
    };
  }

  const cache = browser ? new OfflineCache(contestId) : null;
  let isOffline = false;
  let cacheAge = cache?.getCacheAge() ?? null;

  try {
    // Try to load from API first
    const contestResponse = await apiClient.get<ContestDetail>(`/contests/${contestId}`);
    const regResponse = await apiClient.get<Registration[]>(`/contests/${contestId}/registrations`);
    const attemptsResponse = await apiClient.get<Attempt[]>(`/contests/${contestId}/attempts`);
    const currentAttemptResponse = await apiClient.get<CurrentAttemptBundle | null>(`/contests/${contestId}/attempts/current`);
    const categoriesResponse = await apiClient.get<ContestCategories>(`/contests/${contestId}/categories`);
    const plateSetsResponse = await apiClient.get<ContestPlateSetEntry[]>(`/contests/${contestId}/platesets`);

    const referenceData: ReferenceData = categoriesResponse.data ?? {
      weightClasses: [],
      ageCategories: [],
    };

    const data = {
      contest: contestResponse.data,
      registrations: regResponse.data ?? [],
      attempts: attemptsResponse.data ?? [],
      currentAttempt: currentAttemptResponse.data,
      referenceData,
      plateSets: plateSetsResponse.data ?? [],
      error:
        contestResponse.error ||
        regResponse.error ||
        attemptsResponse.error ||
        currentAttemptResponse.error ||
        categoriesResponse.error ||
        plateSetsResponse.error,
      contestId,
      isOffline: false,
      cacheAge: null,
    };

    // Cache the fresh data
    if (contestResponse.data && !data.error && cache) {
      cache.set({
        contest: contestResponse.data,
        registrations: regResponse.data ?? [],
        attempts: attemptsResponse.data ?? [],
        currentAttempt: currentAttemptResponse.data,
        referenceData,
        plateSets: plateSetsResponse.data ?? [],
      });
    }

    return data;
  } catch (error) {
    console.log('API request failed, trying cache:', error);

    // Try to load from cache
    const cachedData = cache?.get();
    if (cachedData) {
      isOffline = true;
      cacheAge = cache?.getCacheAge() ?? null;

      return {
        contest: cachedData.contest,
        registrations: cachedData.registrations,
        attempts: cachedData.attempts,
        currentAttempt: cachedData.currentAttempt,
        referenceData: cachedData.referenceData,
        plateSets: cachedData.plateSets ?? [],
        error: null,
        contestId,
        isOffline,
        cacheAge,
      };
    }

    // No cache available either
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      contest: null,
      registrations: [],
      attempts: [],
      currentAttempt: null,
      referenceData: { weightClasses: [], ageCategories: [] },
      plateSets: [],
      error: `${message} (no cached data available)`,
      contestId,
      isOffline: true,
      cacheAge: null,
    };
  }
};

import { apiClient } from '$lib/api';
import { OfflineCache } from '$lib/cache';
import type { ContestDetail, Registration, Attempt, CurrentAttemptBundle, ReferenceData, ContestCategories } from '$lib/types';

export const load = async ({ url }) => {
  const contestId = url.searchParams.get('contestId');

  if (!contestId) {
    return {
      contest: null,
      registrations: [],
      attempts: [],
      currentAttempt: null,
      referenceData: { weightClasses: [], ageCategories: [] },
      error: 'Contest ID is required',
      contestId: null,
      isOffline: false,
      cacheAge: null,
    };
  }

  const cache = new OfflineCache(contestId);
  let isOffline = false;
  let cacheAge = cache.getCacheAge();

  try {
    const contestResponse = await apiClient.get<ContestDetail>(`/contests/${contestId}`);
    const regResponse = await apiClient.get<Registration[]>(`/contests/${contestId}/registrations`);
    const attemptsResponse = await apiClient.get<Attempt[]>(`/contests/${contestId}/attempts`);
    const currentAttemptResponse = await apiClient.get<CurrentAttemptBundle | null>(`/contests/${contestId}/attempts/current`);
    const categoriesResponse = await apiClient.get<ContestCategories>(`/contests/${contestId}/categories`);

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
      error: contestResponse.error || regResponse.error || attemptsResponse.error || currentAttemptResponse.error || categoriesResponse.error,
      contestId,
      isOffline: false,
      cacheAge: null,
    };

    if (contestResponse.data && !data.error) {
      cache.set({
        contest: contestResponse.data,
        registrations: regResponse.data ?? [],
        attempts: attemptsResponse.data ?? [],
        currentAttempt: currentAttemptResponse.data,
        referenceData,
      });
    }

    return data;
  } catch (error) {
    console.log('API request failed, trying cache:', error);

    const cachedData = cache.get();
    if (cachedData) {
      isOffline = true;
      cacheAge = cache.getCacheAge();

      return {
        contest: cachedData.contest,
        registrations: cachedData.registrations,
        attempts: cachedData.attempts,
        currentAttempt: cachedData.currentAttempt,
        referenceData: cachedData.referenceData,
        error: null,
        contestId,
        isOffline,
        cacheAge,
      };
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      contest: null,
      registrations: [],
      attempts: [],
      currentAttempt: null,
      referenceData: { weightClasses: [], ageCategories: [] },
      error: `${message} (no cached data available)`,
      contestId,
      isOffline: true,
      cacheAge: null,
    };
  }
};

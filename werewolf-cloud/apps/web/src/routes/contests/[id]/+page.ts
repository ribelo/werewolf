import { apiClient } from '$lib/api';
import type { ContestDetail, Registration, ReferenceData, WeightClass, AgeCategory, Attempt, CurrentAttempt } from '$lib/types';

export const load = async ({ params }) => {
  const contestId = params.id;

  try {
    // Load contest details
    const contestResponse = await apiClient.get<ContestDetail>(`/contests/${contestId}`);

    // Load registrations
    const regResponse = await apiClient.get<Registration[]>(`/contests/${contestId}/registrations`);

    // Load attempts
    const attemptsResponse = await apiClient.get<Attempt[]>(`/contests/${contestId}/attempts`);

    // Load current attempt
    const currentAttemptResponse = await apiClient.get<CurrentAttempt | null>(`/contests/${contestId}/attempts/current`);

    // Load reference data
    const weightClassesResponse = await apiClient.get<WeightClass[]>(`/reference/weight-classes`);
    const ageCategoriesResponse = await apiClient.get<AgeCategory[]>(`/reference/age-categories`);

    const referenceData: ReferenceData = {
      weightClasses: weightClassesResponse.data ?? [],
      ageCategories: ageCategoriesResponse.data ?? [],
    };

    return {
      contest: contestResponse.data,
      registrations: regResponse.data ?? [],
      attempts: attemptsResponse.data ?? [],
      currentAttempt: currentAttemptResponse.data,
      referenceData,
      error: contestResponse.error || regResponse.error || attemptsResponse.error || currentAttemptResponse.error || weightClassesResponse.error || ageCategoriesResponse.error,
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
      error: message,
      apiBase: apiClient.baseUrl,
      contestId,
    };
  }
};

import { writable, derived, type Readable } from 'svelte/store';
import type { ContestDetail, Registration, Attempt, AgeCategory, WeightClass, ContestCategories } from '$lib/types';

export interface ContestState {
  contest: ContestDetail | null;
  registrations: Registration[];
  attempts: Attempt[];
  ageCategories: AgeCategory[];
  weightClasses: WeightClass[];
  lastUpdated: string | null;
}

interface ContestStore extends Readable<ContestState> {
  setContest: (
    contest: ContestDetail,
    registrations?: Registration[],
    categories?: Partial<ContestCategories>,
  ) => void;
  updateRegistration: (registration: Registration) => void;
  updateAttempt: (attempt: Attempt) => void;
  setAttempts: (attempts: Attempt[]) => void;
  setCategories: (categories: ContestCategories) => void;
  reset: () => void;
}

const initialState: ContestState = {
  contest: null,
  registrations: [],
  attempts: [],
  ageCategories: [],
  weightClasses: [],
  lastUpdated: null,
};

function createContestStore(): ContestStore {
  const { subscribe, set, update } = writable<ContestState>(initialState);

  return {
    subscribe,

    setContest: (
      contest: ContestDetail,
      registrations: Registration[] = contest.registrations ?? [],
      categories: Partial<ContestCategories> = {},
    ) => {
      update(state => ({
        ...state,
        contest,
        registrations,
        ageCategories: categories.ageCategories ?? state.ageCategories,
        weightClasses: categories.weightClasses ?? state.weightClasses,
        lastUpdated: new Date().toISOString(),
      }));
    },

    updateRegistration: (registration: Registration) => {
      update(state => ({
        ...state,
        registrations: state.registrations.map(reg =>
          reg.id === registration.id ? registration : reg
        ),
        lastUpdated: new Date().toISOString(),
      }));
    },

    updateAttempt: (attempt: Attempt) => {
      update(state => {
        const matchIndex = state.attempts.findIndex(a => a.id === attempt.id);
        const fallbackIndex = matchIndex >= 0
          ? matchIndex
          : state.attempts.findIndex(
              a =>
                a.registrationId === attempt.registrationId &&
                a.liftType === attempt.liftType &&
                a.attemptNumber === attempt.attemptNumber
            );

        const attempts = fallbackIndex >= 0
          ? state.attempts.map((a, index) => (index === fallbackIndex ? attempt : a))
          : [...state.attempts, attempt];

        return {
          ...state,
          attempts,
          lastUpdated: new Date().toISOString(),
        };
      });
    },

    setAttempts: (attempts: Attempt[]) => {
      update(state => ({
        ...state,
        attempts: [...attempts],
        lastUpdated: new Date().toISOString(),
      }));
    },

    setCategories: (categories: ContestCategories) => {
      update(state => ({
        ...state,
        ageCategories: [...categories.ageCategories],
        weightClasses: [...categories.weightClasses],
        lastUpdated: new Date().toISOString(),
      }));
    },

    reset: () => {
      set(initialState);
    },
  };
}

// Export singleton instance
export const contestStore = createContestStore();

// Derived stores for convenience
export const currentContest = derived(contestStore, $state => $state.contest);
export const currentRegistrations = derived(contestStore, $state => $state.registrations);
export const currentAttempts = derived(contestStore, $state => $state.attempts);
export const lastContestUpdate = derived(contestStore, $state => $state.lastUpdated);
export const currentAgeCategories = derived(contestStore, $state => $state.ageCategories);
export const currentWeightClasses = derived(contestStore, $state => $state.weightClasses);

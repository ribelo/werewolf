import { writable, derived, type Readable } from 'svelte/store';
import type { ContestDetail, Registration, Attempt } from '$lib/types';

export interface ContestState {
  contest: ContestDetail | null;
  registrations: Registration[];
  attempts: Attempt[];
  lastUpdated: string | null;
}

interface ContestStore extends Readable<ContestState> {
  setContest: (contest: ContestDetail, registrations?: Registration[]) => void;
  updateRegistration: (registration: Registration) => void;
  updateAttempt: (attempt: Attempt) => void;
  reset: () => void;
}

const initialState: ContestState = {
  contest: null,
  registrations: [],
  attempts: [],
  lastUpdated: null,
};

function createContestStore(): ContestStore {
  const { subscribe, set, update } = writable<ContestState>(initialState);

  return {
    subscribe,

    setContest: (contest: ContestDetail, registrations?: Registration[]) => {
      update(state => ({
        ...state,
        contest,
        registrations: registrations ?? contest.registrations ?? [],
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
      update(state => ({
        ...state,
        attempts: state.attempts.some(a => a.id === attempt.id)
          ? state.attempts.map(a => a.id === attempt.id ? attempt : a)
          : [...state.attempts, attempt],
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
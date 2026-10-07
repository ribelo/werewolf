import { beforeEach, describe, expect, it } from 'vitest';

import { OfflineCache } from '$lib/cache';
import type {
  Attempt,
  ContestDetail,
  ContestPlateSetEntry,
  CurrentAttemptBundle,
  ReferenceData,
  Registration,
} from '$lib/types';

const CONTEST_ID = 'contest-1';

const registration: Registration = {
  id: 'reg-1',
  competitorId: 'competitor-1',
  firstName: 'Jane',
  lastName: 'Doe',
  birthDate: '1995-05-05',
  gender: 'Female',
  club: 'Werewolf',
  city: 'Warsaw',
  weightClassId: 'wc-1',
  weightClassName: 'Do 67.5 kg',
  ageCategoryId: 'ac-1',
  ageCategoryName: 'Senior (24-39)',
  bodyweight: 70,
  rackHeightSquat: 10,
  rackHeightBench: 5,
  reshelCoefficient: null,
  mcculloughCoefficient: null,
  competitionOrder: 1,
  lifts: ['Squat', 'Bench', 'Deadlift'],
};

const contest: ContestDetail = {
  id: CONTEST_ID,
  name: 'Test Meet',
  date: '2024-01-01',
  location: 'Warsaw',
  discipline: 'Powerlifting',
  status: 'Live',
  mensBarWeight: 20,
  womensBarWeight: 15,
  clampWeight: 2.5,
  registrations: [registration],
};

const attempt: Attempt = {
  id: 'attempt-1',
  registrationId: registration.id,
  liftType: 'Squat',
  attemptNumber: 1,
  weight: 100,
  status: 'Pending',
  createdAt: '2024-01-01T10:00:00Z',
  updatedAt: '2024-01-01T10:00:00Z',
};

const currentAttempt: CurrentAttemptBundle = {
  contest: {
    id: contest.id,
    name: contest.name,
    date: contest.date,
    location: contest.location,
    discipline: contest.discipline,
    status: contest.status,
    mensBarWeight: contest.mensBarWeight,
    womensBarWeight: contest.womensBarWeight,
  },
  attempt,
  registration: {
    id: registration.id,
    contestId: contest.id,
    bodyweight: registration.bodyweight,
    weightClassId: registration.weightClassId,
    ageCategoryId: registration.ageCategoryId,
    rackHeightSquat: registration.rackHeightSquat ?? null,
    rackHeightBench: registration.rackHeightBench ?? null,
    competitionOrder: registration.competitionOrder ?? null,
    lifts: registration.lifts,
  },
  competitor: {
    id: registration.competitorId,
    firstName: registration.firstName,
    lastName: registration.lastName,
    birthDate: registration.birthDate,
    gender: registration.gender,
    club: registration.club ?? null,
    city: registration.city ?? null,
  },
  attemptsByLift: {
    Squat: [
      {
        id: attempt.id,
        liftType: attempt.liftType,
        attemptNumber: attempt.attemptNumber,
        weight: attempt.weight,
        status: attempt.status,
        updatedAt: attempt.updatedAt,
      },
    ],
    Bench: [],
    Deadlift: [],
  },
  platePlan: {
    plates: [],
    exact: true,
    total: 100,
    increment: 2.5,
    targetWeight: 100,
    barWeight: 20,
    weightToLoad: 80,
    clampWeight: 2.5,
  },
  highlight: { liftType: 'Squat', attemptNumber: 1 },
};

const referenceData: ReferenceData = { weightClasses: [], ageCategories: [] };

const plateSets: ContestPlateSetEntry[] = [
  { plateWeight: 20, quantity: 2, color: '#ef4444' },
  { plateWeight: 10, quantity: 1, color: '#22c55e' },
];

/**
 * Cache writes mirror what the three display loaders send:
 * - display/current caches everything including plate sets;
 * - display/table and display/share cache the same state without plate sets.
 */
function writeCurrentScreen(cache: OfflineCache): void {
  cache.set({
    contest,
    registrations: [registration],
    attempts: [attempt],
    currentAttempt,
    referenceData,
    plateSets,
  });
}

function writeTableScreen(cache: OfflineCache): void {
  cache.set({
    contest,
    registrations: [registration],
    attempts: [attempt],
    currentAttempt,
    referenceData,
  });
}

describe('offline cache merging', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('keeps plate sets through the current -> table -> share -> offline-current sequence', () => {
    const cache = new OfflineCache(CONTEST_ID);

    writeCurrentScreen(cache);
    expect(cache.get()?.plateSets).toHaveLength(2);

    writeTableScreen(cache);
    expect(cache.get()?.plateSets).toHaveLength(2);

    writeTableScreen(cache);
    expect(cache.get()?.plateSets).toHaveLength(2);

    // What display/current/+page.ts serves when the API is unreachable.
    const cached = cache.get();
    expect(cached?.contest.id).toBe(CONTEST_ID);
    expect(cached?.attempts).toHaveLength(1);
    expect(cached?.currentAttempt?.attempt.weight).toBe(100);
    expect(cached?.plateSets).toHaveLength(2);
  });

  it('merges partial writes and keeps explicitly cleared fields null', () => {
    const cache = new OfflineCache(CONTEST_ID);
    writeCurrentScreen(cache);

    cache.set({ attempts: [] });

    const merged = cache.get();
    expect(merged?.contest.id).toBe(CONTEST_ID);
    expect(merged?.registrations).toHaveLength(1);
    expect(merged?.attempts).toEqual([]);
    expect(merged?.currentAttempt).toEqual(currentAttempt);
    expect(merged?.plateSets).toHaveLength(2);

    cache.set({ currentAttempt: null });

    expect(cache.get()?.currentAttempt).toBeNull();
    expect(cache.get()?.contest.id).toBe(CONTEST_ID);
  });
});

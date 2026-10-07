import { render, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addMessages, init, waitLocale } from 'svelte-i18n';

import en from '$lib/i18n/locales/en.json';
import type { Attempt, ContestDetail, CurrentAttemptBundle, Registration } from '$lib/types';
import type { PageData } from '../$types';

// The page subscribes to the realtime client and connects on mount; the mocked
// stores never emit, so it renders exactly the data the loader passed in.
vi.mock('$lib/realtime', () => ({
  realtimeClient: {
    connectionStatus: {
      subscribe(run: (value: string) => void) {
        run('connected');
        return () => {};
      },
    },
    events: {
      subscribe(run: (value: null) => void) {
        run(null);
        return () => {};
      },
    },
    connect: vi.fn(),
    disconnect: vi.fn(),
  },
}));

import DisplayCurrent from '../+page.svelte';

const CONTEST_ID = 'contest-1';
const REGISTRATION_ID = 'registration-1';
const CONTEST_DATE = '2024-01-01';
const BIRTH_DATE = '2000-06-15';

const ageLabel = en.display_current.meta.age;

const attempt: Attempt = {
  id: 'attempt-1',
  registrationId: REGISTRATION_ID,
  liftType: 'Squat',
  attemptNumber: 1,
  weight: 27.5,
  status: 'Pending',
  timestamp: null,
  judge1Decision: null,
  judge2Decision: null,
  judge3Decision: null,
  notes: null,
  createdAt: '2024-01-01T10:00:00Z',
  updatedAt: '2024-01-01T10:00:00Z',
  firstName: 'Jane',
  lastName: 'Doe',
  competitionOrder: 1,
  competitorName: 'Jane Doe',
};

const registration: Registration = {
  id: REGISTRATION_ID,
  competitorId: 'competitor-1',
  firstName: 'Jane',
  lastName: 'Doe',
  birthDate: BIRTH_DATE,
  gender: 'Female',
  club: 'Werewolf',
  city: 'Warsaw',
  weightClassId: 'wc1',
  weightClassName: 'Do 67.5 kg',
  ageCategoryId: 'ac1',
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
  date: CONTEST_DATE,
  location: 'Warsaw',
  discipline: 'Powerlifting',
  status: 'Live',
  mensBarWeight: 20,
  womensBarWeight: 15,
  clampWeight: 2.5,
  registrations: [registration],
};

const bundle: CurrentAttemptBundle = {
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
    firstName: 'Jane',
    lastName: 'Doe',
    birthDate: BIRTH_DATE,
    gender: 'Female',
    club: 'Werewolf',
    city: 'Warsaw',
    competitionOrder: 1,
  },
  attemptsByLift: {
    Squat: [
      {
        id: 'attempt-1',
        liftType: 'Squat',
        attemptNumber: 1,
        weight: 27.5,
        status: 'Pending',
        updatedAt: '2024-01-01T10:00:00Z',
      },
    ],
    Bench: [],
    Deadlift: [],
  },
  platePlan: {
    plates: [],
    exact: true,
    total: 27.5,
    increment: 2.5,
    targetWeight: 27.5,
    barWeight: 20,
    weightToLoad: 7.5,
    clampWeight: 5,
    clampWeightPerClamp: 2.5,
  },
  highlight: {
    liftType: 'Squat',
    attemptNumber: 1,
  },
};

function pageData(): PageData {
  return {
    session: { authenticated: false, checked: true },
    contest,
    registrations: [registration],
    attempts: [attempt],
    currentAttempt: bundle,
    referenceData: { weightClasses: [], ageCategories: [] },
    plateSets: [],
    error: null,
    contestId: CONTEST_ID,
    isOffline: false,
    cacheAge: null,
  };
}

function agePattern(value: number): RegExp {
  return new RegExp(ageLabel + '\\s*:\\s*' + String(value));
}

describe('display current competitor age', () => {
  beforeEach(async () => {
    // Pin "today" after the contest so a today-based age (29) differs from the
    // age on the contest date (23). Only Date is faked: the decipher animation
    // still needs its real timers.
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2030-01-01T00:00:00Z') });
    addMessages('en', en);
    init({ fallbackLocale: 'en', initialLocale: 'en' });
    await waitLocale();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the age on the contest date, not the age today', async () => {
    const { container } = render(DisplayCurrent, { data: pageData() });

    await waitFor(() => expect(container.textContent).toMatch(agePattern(23)), { timeout: 3000 });
    expect(container.textContent).not.toMatch(agePattern(29));
  });
});

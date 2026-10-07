import { render, waitFor } from '@testing-library/svelte';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { addMessages, init, waitLocale } from 'svelte-i18n';

import en from '$lib/i18n/locales/en.json';
import { realtimeTestHelpers } from '$lib/realtime';
import type {
  Attempt,
  ConnectionStatus,
  ContestDetail,
  CurrentAttemptBundle,
  LiveEvent,
  RealtimeSnapshot,
  Registration,
} from '$lib/types';
import type { PageData } from '../display/current/$types';

vi.mock('$lib/realtime', () => {
  type ConnectionSubscriber = (value: ConnectionStatus) => void;
  type EventSubscriber = (value: LiveEvent | null) => void;

  let connectionValue: ConnectionStatus = 'connected';
  const connectionSubscribers = new Set<ConnectionSubscriber>();
  const connectionStore = {
    subscribe(run: ConnectionSubscriber) {
      run(connectionValue);
      connectionSubscribers.add(run);
      return () => connectionSubscribers.delete(run);
    },
  };

  let eventValue: LiveEvent | null = null;
  const eventSubscribers = new Set<EventSubscriber>();
  const eventsStore = {
    subscribe(run: EventSubscriber) {
      run(eventValue);
      eventSubscribers.add(run);
      return () => eventSubscribers.delete(run);
    },
  };

  const setConnection = (value: ConnectionStatus) => {
    connectionValue = value;
    connectionSubscribers.forEach((fn) => fn(value));
  };

  const setEvent = (value: LiveEvent | null) => {
    eventValue = value;
    eventSubscribers.forEach((fn) => fn(value));
  };

  const reset = () => {
    setConnection('connected');
    setEvent(null);
  };

  return {
    realtimeClient: {
      connectionStatus: connectionStore,
      events: eventsStore,
      connect: vi.fn(),
      disconnect: vi.fn(),
    },
    realtimeTestHelpers: {
      setConnection,
      setEvent,
      reset,
    },
  };
});

import DisplayCurrent from '../display/current/+page.svelte';

const CONTEST_ID = '6a9e9092-6f6a-4ef6-9c06-462c7e5d53b2';
const REGISTRATION_ID = '48fb5121-8d48-4b40-9e7f-63bd40cd2141';

const attempt: Attempt = {
  id: '4b2a6d8e-8b51-4d40-8f78-6d4f4c6f6241',
  registrationId: REGISTRATION_ID,
  liftType: 'Squat',
  attemptNumber: 1,
  weight: 22.5,
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
  competitorId: 'c86426c3-89f8-4d5f-9bfb-ee804da5df09',
  firstName: 'Jane',
  lastName: 'Doe',
  birthDate: '1995-05-05',
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
  date: '2024-01-01',
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
    birthDate: '1995-05-05',
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
        weight: 22.5,
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
    total: 22.5,
    increment: 2.5,
    targetWeight: 22.5,
    barWeight: 20,
    weightToLoad: 2.5,
    clampWeight: 2.5,
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

async function renderCurrent() {
  const rendered = render(DisplayCurrent, { data: pageData() });
  const tile = rendered.container.querySelector('.attempt-tile');
  expect(tile).not.toBeNull();
  // The weight decipher animation settles on the formatted weight and unit.
  await waitFor(() => expect(tile?.textContent).toMatch(/22\.50\s*kg/), { timeout: 3000 });
  return { ...rendered, tile };
}

describe('Display current screen', () => {
  beforeEach(async () => {
    realtimeTestHelpers.reset();

    addMessages('en', en);
    init({ fallbackLocale: 'en', initialLocale: 'en' });
    await waitLocale();
  });

  it('renders each attempt weight with a single unit', async () => {
    const { tile } = await renderCurrent();

    expect(tile?.textContent?.match(/kg/g)).toHaveLength(1);
  });

  it('updates attempt tile and success animation when result event arrives', async () => {
    const { tile } = await renderCurrent();

    const updatedAttempt: Attempt = {
      ...attempt,
      weight: 25,
      status: 'Successful',
      updatedAt: '2024-01-01T10:05:00Z',
    };

    const event: LiveEvent<Attempt> = {
      type: 'attempt.resultUpdated',
      contestId: CONTEST_ID,
      timestamp: new Date().toISOString(),
      data: updatedAttempt,
      payload: updatedAttempt,
    };

    realtimeTestHelpers.setEvent(event);

    await waitFor(() => expect(tile?.textContent).toMatch(/25\.00\s*kg/), { timeout: 3000 });
    expect(tile?.classList.contains('animate-status-success')).toBe(true);
    expect(tile?.classList.contains('animate-status-failed')).toBe(false);
  });

  it('replaces live state when a snapshot event arrives', async () => {
    const { getByText } = await renderCurrent();

    const successfulAttempt: Attempt = {
      ...attempt,
      status: 'Successful',
      updatedAt: '2024-01-01T10:05:00Z',
    };
    const snapshot: RealtimeSnapshot = {
      contestId: CONTEST_ID,
      attempts: [successfulAttempt],
      currentAttempt: null,
      fetchedAt: new Date().toISOString(),
    };

    realtimeTestHelpers.setEvent({
      type: 'snapshot',
      contestId: CONTEST_ID,
      timestamp: snapshot.fetchedAt,
      data: snapshot,
      payload: snapshot,
    });

    await waitFor(() =>
      expect(getByText(en.display_current.waiting.next_title)).toBeInTheDocument()
    );
  });
});

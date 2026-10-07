import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addMessages, init, waitLocale } from 'svelte-i18n';

import en from '$lib/i18n/locales/en.json';
import { realtimeTestHelpers } from '$lib/realtime';
import type {
  Attempt,
  ConnectionStatus,
  ContestDetail,
  LiveEvent,
  RealtimeSnapshot,
  Registration,
} from '$lib/types';
import type { PageData } from '../$types';

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

  return {
    realtimeClient: {
      connectionStatus: connectionStore,
      events: eventsStore,
      connect: vi.fn(),
      disconnect: vi.fn(),
    },
    realtimeTestHelpers: {
      setConnection: (value: ConnectionStatus) => {
        connectionValue = value;
        connectionSubscribers.forEach((fn) => fn(value));
      },
      setEvent: (value: LiveEvent | null) => {
        eventValue = value;
        eventSubscribers.forEach((fn) => fn(value));
      },
      reset: () => {
        eventValue = null;
      },
    },
  };
});

import DisplayShare from '../+page.svelte';

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

const data: PageData = {
  session: { authenticated: false, checked: true },
  contest,
  registrations: [registration],
  attempts: [attempt],
  currentAttempt: null,
  referenceData: { weightClasses: [], ageCategories: [] },
  error: null,
  contestId: CONTEST_ID,
  isOffline: false,
  cacheAge: null,
};

const LIFT_FILTER_LABEL = en.contest_detail.registrations.filters.lift_button;

describe('Display share screen', () => {
  beforeEach(async () => {
    realtimeTestHelpers.reset();

    addMessages('en', en);
    init({ fallbackLocale: 'en', initialLocale: 'en' });
    await waitLocale();
  });

  it('replaces the attempts that drive the lift filter when a snapshot arrives', async () => {
    const { getByText, queryByText } = render(DisplayShare, { data });

    await fireEvent.click(getByText(LIFT_FILTER_LABEL));
    expect(getByText(en.contest_table.lifts.squat)).toBeInTheDocument();

    const snapshot: RealtimeSnapshot = {
      contestId: CONTEST_ID,
      attempts: [{ ...attempt, liftType: 'Deadlift', weight: 137.5, status: 'Successful' }],
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

    await waitFor(() => expect(queryByText(en.contest_table.lifts.squat)).toBeNull());
    expect(getByText(en.contest_table.lifts.deadlift)).toBeInTheDocument();
  });
});

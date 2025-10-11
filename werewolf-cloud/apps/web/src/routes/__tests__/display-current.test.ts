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
  Registration,
} from '$lib/types';

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

describe('Display current screen', () => {
  beforeEach(async () => {
    realtimeTestHelpers.reset();

    addMessages('en', en);
    init({ fallbackLocale: 'en', initialLocale: 'en' });
    await waitLocale();
  });

  it('updates attempt tile when result event arrives', async () => {
    const attempt: Attempt = {
      id: '4b2a6d8e-8b51-4d40-8f78-6d4f4c6f6241',
      registrationId: '48fb5121-8d48-4b40-9e7f-63bd40cd2141',
      liftType: 'Squat' as const,
      attemptNumber: 1 as const,
      weight: 22.5,
      status: 'Pending' as const,
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
      lotNumber: null,
      competitorName: 'Jane Doe',
    };

    const contest: ContestDetail = {
      id: '6a9e9092-6f6a-4ef6-9c06-462c7e5d53b2',
      name: 'Test Meet',
      date: '2024-01-01',
      location: 'Warsaw',
      discipline: 'Powerlifting',
      status: 'Live',
      mensBarWeight: 20,
      womensBarWeight: 15,
      registrations: [],
    };

    const registration: Registration = {
      id: '48fb5121-8d48-4b40-9e7f-63bd40cd2141',
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
      ageCategoryName: 'Open',
      bodyweight: 70,
      lotNumber: null,
      equipmentM: false,
      equipmentSm: false,
      equipmentT: false,
      rackHeightSquat: 10,
      rackHeightBench: 5,
      personalRecordAtEntry: null,
      reshelCoefficient: null,
      mcculloughCoefficient: null,
      competitionOrder: 1,
    };

    contest.registrations = [registration];

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
        equipmentM: registration.equipmentM,
        equipmentSm: registration.equipmentSm,
        equipmentT: registration.equipmentT,
        rackHeightSquat: registration.rackHeightSquat ?? null,
        rackHeightBench: registration.rackHeightBench ?? null,
        competitionOrder: registration.competitionOrder ?? null,
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
            liftType: 'Squat' as const,
            attemptNumber: 1 as const,
            weight: 22.5,
            status: 'Pending' as const,
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
      },
      highlight: {
        liftType: 'Squat' as const,
        attemptNumber: 1 as const,
      },
    };

    const { getByText } = render(DisplayCurrent, {
      data: {
        contest,
        registrations: [registration],
        attempts: [attempt],
        currentAttempt: bundle,
        referenceData: { weightClasses: [], ageCategories: [] },
        error: null,
        contestId: contest.id,
        isOffline: false,
        cacheAge: null,
      },
    });

    expect(getByText('22.5')).toBeInTheDocument();

    const updatedAttempt: Attempt = {
      ...attempt,
      weight: 25,
      status: 'Successful' as const,
      updatedAt: '2024-01-01T10:05:00Z',
    };

    const event: LiveEvent<Attempt> = {
      type: 'attempt.resultUpdated',
      contestId: contest.id,
      timestamp: new Date().toISOString(),
      data: updatedAttempt,
      payload: updatedAttempt,
    };

    realtimeTestHelpers.setEvent(event);

    await waitFor(() => {
      expect(getByText('25')).toBeInTheDocument();
    });
  });
});

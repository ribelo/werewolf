import { describe, expect, it } from 'vitest';

import type {
  Attempt,
  AttemptNumber,
  AttemptStatus,
  CurrentAttemptBundle,
  LiftType,
  LiveEvent,
  Registration,
} from '$lib/types';

import { createTableLiveState, reduceTableLiveEvent, toCurrentAttemptSummary } from '../live-events';

const CONTEST_ID = 'contest-1';
const REG_A = 'reg-a';
const REG_B = 'reg-b';

function makeRegistration(id: string, lastName: string): Registration {
  return {
    id,
    competitorId: `competitor-${id}`,
    firstName: 'Jane',
    lastName,
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
}

interface AttemptOverrides {
  weight?: number;
  status?: AttemptStatus;
  attemptNumber?: AttemptNumber;
  liftType?: LiftType;
}

function makeAttempt(id: string, registrationId: string, overrides: AttemptOverrides = {}): Attempt {
  return {
    id,
    registrationId,
    liftType: overrides.liftType ?? 'Squat',
    attemptNumber: overrides.attemptNumber ?? 1,
    weight: overrides.weight ?? 100,
    status: overrides.status ?? 'Pending',
    createdAt: '2024-01-01T10:00:00Z',
    updatedAt: '2024-01-01T10:00:00Z',
  };
}

function makeBundle(): CurrentAttemptBundle {
  const registration = makeRegistration(REG_A, 'Doe');
  const attempt = makeAttempt('attempt-a1', REG_A, { weight: 100 });

  return {
    contest: {
      id: CONTEST_ID,
      name: 'Test Meet',
      date: '2024-01-01',
      location: 'Warsaw',
      discipline: 'Powerlifting',
      status: 'Live',
      mensBarWeight: 20,
      womensBarWeight: 15,
    },
    attempt,
    registration: {
      id: registration.id,
      contestId: CONTEST_ID,
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
}

function event<T>(type: LiveEvent['type'], data: T): LiveEvent<T> {
  return { type, contestId: CONTEST_ID, timestamp: '2024-01-01T10:00:00Z', data };
}

const context = { unknownCompetitorLabel: 'Unknown competitor' };

function initialState() {
  return createTableLiveState(
    [makeAttempt('attempt-a1', REG_A), makeAttempt('attempt-b1', REG_B)],
    [makeRegistration(REG_A, 'Doe'), makeRegistration(REG_B, 'Roe')],
    makeBundle()
  );
}

describe('table live event reducer', () => {
  it('replaces an existing attempt on attempt.upserted', () => {
    const state = initialState();
    const updated = makeAttempt('attempt-a1', REG_A, { weight: 105 });

    const next = reduceTableLiveEvent(state, event('attempt.upserted', updated), context);

    expect(next.attempts).toHaveLength(2);
    expect(next.attempts[0]?.weight).toBe(105);
    expect(next.registrations).toBe(state.registrations);
  });

  it('appends unknown attempts on attempt.upserted', () => {
    const state = initialState();
    const created = makeAttempt('attempt-a2', REG_A, { attemptNumber: 2, weight: 110 });

    const next = reduceTableLiveEvent(state, event('attempt.upserted', created), context);

    expect(next.attempts).toHaveLength(3);
    expect(next.attempts[2]?.id).toBe('attempt-a2');
  });

  it('merges known attempts and ignores unknown ones on attempt.resultUpdated', () => {
    const state = initialState();
    const updated = makeAttempt('attempt-a1', REG_A, { weight: 105, status: 'Failed' });

    const next = reduceTableLiveEvent(state, event('attempt.resultUpdated', updated), context);

    expect(next.attempts[0]?.status).toBe('Failed');
    expect(next.attempts[0]?.weight).toBe(105);
    expect(next.attempts[1]?.status).toBe('Pending');

    const unknown = makeAttempt('missing', REG_A);
    expect(reduceTableLiveEvent(state, event('attempt.resultUpdated', unknown), context)).toBe(state);
  });

  it('keeps the bundle for a bundle currentSet and summarises plain attempts', () => {
    const state = initialState();
    const bundle = makeBundle();

    const withBundle = reduceTableLiveEvent(state, event('attempt.currentSet', bundle), context);
    expect(withBundle.currentBundle).toBe(bundle);
    expect(withBundle.currentAttempt?.competitorName).toBe('Doe Jane');

    const plain = makeAttempt('attempt-b1', REG_B, { weight: 80 });
    const withPlain = reduceTableLiveEvent(state, event('attempt.currentSet', plain), context);
    expect(withPlain.currentBundle).toBe(state.currentBundle);
    expect(withPlain.currentAttempt?.competitorName).toBe('Roe Jane');
    expect(withPlain.currentAttempt?.weight).toBe(80);
  });

  it('clears the current attempt', () => {
    const state = initialState();

    const next = reduceTableLiveEvent(state, event('attempt.currentCleared', null), context);

    expect(next.currentBundle).toBeNull();
    expect(next.currentAttempt).toBeNull();
  });

  it('drops a deleted registration together with its attempts', () => {
    const state = initialState();

    const next = reduceTableLiveEvent(state, event('registration.deleted', { registrationId: REG_A }), context);

    expect(next.registrations.map((entry) => entry.id)).toEqual([REG_B]);
    expect(next.attempts.map((attempt) => attempt.id)).toEqual(['attempt-b1']);
  });

  it('replaces attempts and current attempt from a snapshot', () => {
    const state = initialState();
    const snapshot = {
      contestId: CONTEST_ID,
      attempts: [makeAttempt('attempt-a1', REG_A, { weight: 130, status: 'Successful' })],
      currentAttempt: makeBundle(),
      fetchedAt: '2024-01-01T10:01:00Z',
    };

    const next = reduceTableLiveEvent(state, event('snapshot', snapshot), context);

    expect(next.attempts).toHaveLength(1);
    expect(next.attempts[0]?.weight).toBe(130);
    expect(next.currentAttempt?.attemptNumber).toBe(1);

    const cleared = reduceTableLiveEvent(
      state,
      event('snapshot', { ...snapshot, currentAttempt: null }),
      context
    );
    expect(cleared.currentBundle).toBeNull();
    expect(cleared.currentAttempt).toBeNull();
  });

  it('leaves state untouched for events without table data', () => {
    const state = initialState();

    expect(reduceTableLiveEvent(state, event('heartbeat', null), context)).toBe(state);
    expect(reduceTableLiveEvent(state, event('display.filtersSynced', {}), context)).toBe(state);
    expect(reduceTableLiveEvent(state, event('attempt.upserted', undefined), context)).toBe(state);
  });

  it('flattens a bundle or plain attempt into a current attempt summary', () => {
    const state = initialState();

    const fromBundle = toCurrentAttemptSummary(makeBundle(), state.registrations, 'Unknown competitor');
    expect(fromBundle.competitorName).toBe('Doe Jane');
    expect(fromBundle.competitionOrder).toBe(1);

    const fromAttempt = toCurrentAttemptSummary(
      makeAttempt('attempt-b1', REG_B),
      state.registrations,
      'Unknown competitor'
    );
    expect(fromAttempt.competitorName).toBe('Roe Jane');

    const fromUnknownRegistration = toCurrentAttemptSummary(
      makeAttempt('attempt-x', 'reg-x'),
      state.registrations,
      'Unknown competitor'
    );
    expect(fromUnknownRegistration.competitorName).toBe('Unknown competitor');
  });
});

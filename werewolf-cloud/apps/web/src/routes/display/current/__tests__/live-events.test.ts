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

import { createCurrentAttemptLiveState, reduceCurrentAttemptEvent } from '../live-events';

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

function initialState() {
  return createCurrentAttemptLiveState([makeAttempt('attempt-a1', REG_A)], makeBundle());
}

describe('current attempt live event reducer', () => {
  it('replaces the attempt in the list and in the current bundle', () => {
    const state = initialState();
    const updated = makeAttempt('attempt-a1', REG_A, { weight: 105, status: 'Successful' });

    const next = reduceCurrentAttemptEvent(state, event('attempt.upserted', updated));

    expect(next.attempts[0]?.weight).toBe(105);
    expect(next.bundle?.attemptsByLift.Squat[0]?.weight).toBe(105);
    expect(next.bundle?.attemptsByLift.Squat[0]?.status).toBe('Successful');
    expect(next.currentAttempt?.id).toBe('attempt-a1');
  });

  it('leaves the current bundle alone when another lifter attempts', () => {
    const state = initialState();
    const other = makeAttempt('attempt-b1', REG_B, { weight: 80 });

    const next = reduceCurrentAttemptEvent(state, event('attempt.upserted', other));

    expect(next.attempts).toHaveLength(2);
    expect(next.bundle).toBe(state.bundle);
    expect(next.currentAttempt).toBe(state.currentAttempt);
  });

  it('merges a judge result into the bundle attempt', () => {
    const state = initialState();
    const result = makeAttempt('attempt-a1', REG_A, { weight: 102.5, status: 'Failed' });

    const next = reduceCurrentAttemptEvent(state, event('attempt.resultUpdated', result));

    expect(next.attempts[0]?.status).toBe('Failed');
    expect(next.bundle?.attemptsByLift.Squat[0]?.status).toBe('Failed');
    expect(next.bundle?.attemptsByLift.Squat[0]?.weight).toBe(102.5);
    expect(next.currentAttempt?.id).toBe('attempt-a1');
  });

  it('ignores results for attempts the screen does not know', () => {
    const state = initialState();

    const unknown = makeAttempt('missing', REG_A, { attemptNumber: 2 });

    expect(reduceCurrentAttemptEvent(state, event('attempt.resultUpdated', unknown))).toBe(state);
  });

  it('sets and clears the current bundle', () => {
    const state = initialState();
    const bundle = makeBundle();

    const withBundle = reduceCurrentAttemptEvent(state, event('attempt.currentSet', bundle));
    expect(withBundle.bundle).toBe(bundle);
    expect(withBundle.currentAttempt?.competitorName).toBe('Doe Jane');

    const cleared = reduceCurrentAttemptEvent(withBundle, event('attempt.currentCleared', null));
    expect(cleared.bundle).toBeNull();
    expect(cleared.currentAttempt).toBeNull();
    expect(cleared.attempts).toHaveLength(1);
  });

  it('replaces attempts and current attempt from a snapshot', () => {
    const state = initialState();
    const snapshot = {
      contestId: CONTEST_ID,
      attempts: [makeAttempt('attempt-a1', REG_A, { weight: 130, status: 'Successful' })],
      currentAttempt: null,
      fetchedAt: '2024-01-01T10:01:00Z',
    };

    const next = reduceCurrentAttemptEvent(state, event('snapshot', snapshot));

    expect(next.attempts[0]?.weight).toBe(130);
    expect(next.bundle).toBeNull();
    expect(next.currentAttempt).toBeNull();
  });

  it('keeps state for events without attempt data', () => {
    const state = initialState();

    expect(reduceCurrentAttemptEvent(state, event('heartbeat', null))).toBe(state);
    expect(reduceCurrentAttemptEvent(state, event('display.qrVisibility', {}))).toBe(state);
    expect(reduceCurrentAttemptEvent(state, event('attempt.upserted', undefined))).toBe(state);
  });
});

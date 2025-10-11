import { describe, it, expect } from 'vitest';

import {
  ATTEMPT_NUMBERS,
  type AttemptCell,
  type AttemptNumber,
  type LiftKind,
  type UnifiedRow,
  sortUnifiedRows,
} from '../contest-table';
import type { AttemptStatus, Registration } from '../types';

type AttemptSetup = {
  attemptNumber: AttemptNumber;
  weight: number;
  status: AttemptStatus;
};

const TIMESTAMP = '2024-01-01T00:00:00.000Z';

function buildAttemptCells(
  lift: LiftKind,
  registrationId: string,
  attempts: AttemptSetup[]
): AttemptCell[] {
  return ATTEMPT_NUMBERS.map((attemptNumber) => {
    const match = attempts.find((attempt) => attempt.attemptNumber === attemptNumber);
    if (!match) {
      return { liftType: lift, attemptNumber: attemptNumber as AttemptNumber, attempt: null };
    }

    return {
      liftType: lift,
      attemptNumber: attemptNumber as AttemptNumber,
      attempt: {
        id: `${registrationId}-${lift}-${attemptNumber}`,
        registrationId,
        liftType: lift,
        attemptNumber: attemptNumber as AttemptNumber,
        weight: match.weight,
        status: match.status,
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      },
    };
  });
}

function createRegistration(id: string, overrides: Partial<Registration> = {}): Registration {
  return {
    id,
    competitorId: `${id}-competitor`,
    firstName: 'Test',
    lastName: id.toUpperCase(),
    birthDate: '1990-01-01',
    gender: 'Male',
    weightClassId: 'wc',
    ageCategoryId: 'ac',
    bodyweight: 90,
    lotNumber: null,
    equipmentM: false,
    equipmentSm: false,
    equipmentT: false,
    flightCode: null,
    flightOrder: null,
    labels: [],
    ...overrides,
  };
}

function bestSuccessfulWeight(attempts: AttemptCell[]): number {
  return attempts.reduce((best, cell) => {
    const attempt = cell.attempt;
    if (attempt && attempt.status === 'Successful' && attempt.weight > best) {
      return attempt.weight;
    }
    return best;
  }, 0);
}

function createRow(params: {
  id: string;
  bodyweight: number;
  deadliftAttempts: AttemptSetup[];
  squatAttempts?: AttemptSetup[];
  benchAttempts?: AttemptSetup[];
  points?: number | null;
}): UnifiedRow {
  const {
    id,
    bodyweight,
    deadliftAttempts,
    squatAttempts = [],
    benchAttempts = [],
    points = null,
  } = params;

  const registration = createRegistration(id, { bodyweight });

  const attempts: Record<LiftKind, AttemptCell[]> = {
    Squat: buildAttemptCells('Squat', id, squatAttempts),
    Bench: buildAttemptCells('Bench', id, benchAttempts),
    Deadlift: buildAttemptCells('Deadlift', id, deadliftAttempts),
  };

  const bestSquat = bestSuccessfulWeight(attempts.Squat);
  const bestBench = bestSuccessfulWeight(attempts.Bench);
  const bestDeadlift = bestSuccessfulWeight(attempts.Deadlift);
  const maxLift = Math.max(bestSquat, bestBench, bestDeadlift);

  return {
    registration,
    age: null,
    birthDate: null,
    attempts,
    bestSquat,
    bestBench,
    bestDeadlift,
    total: bestSquat + bestBench + bestDeadlift,
    points,
    maxLift,
    placeOpen: null,
    placeAge: null,
    placeWeight: null,
  };
}

describe('sortUnifiedRows - max column tie breakers', () => {
  it('prioritises heavier successful attempts before bodyweight differences', () => {
    const lighterBodyweight = createRow({
      id: 'lighter-bodyweight',
      bodyweight: 85,
      deadliftAttempts: [
        { attemptNumber: 1, weight: 120, status: 'Successful' },
        { attemptNumber: 2, weight: 130, status: 'Successful' },
        { attemptNumber: 3, weight: 150, status: 'Successful' },
      ],
    });

    const strongerSecondAttempt = createRow({
      id: 'stronger-second',
      bodyweight: 88,
      deadliftAttempts: [
        { attemptNumber: 1, weight: 120, status: 'Successful' },
        { attemptNumber: 2, weight: 140, status: 'Successful' },
        { attemptNumber: 3, weight: 150, status: 'Successful' },
      ],
    });

    const sorted = sortUnifiedRows(
      [lighterBodyweight, strongerSecondAttempt],
      'max',
      'desc'
    );

    expect(sorted[0]?.registration.id).toBe('stronger-second');
    expect(sorted[1]?.registration.id).toBe('lighter-bodyweight');
  });

  it('prefers lighter bodyweight when max lifts are equal', () => {
    const lifterHeavy = createRow({
      id: 'heavy',
      bodyweight: 91,
      deadliftAttempts: [
        { attemptNumber: 1, weight: 190, status: 'Successful' },
        { attemptNumber: 2, weight: 205, status: 'Successful' },
        { attemptNumber: 3, weight: 210, status: 'Successful' },
      ],
    });

    const lifterLight = createRow({
      id: 'light',
      bodyweight: 88,
      deadliftAttempts: [
        { attemptNumber: 1, weight: 190, status: 'Successful' },
        { attemptNumber: 2, weight: 205, status: 'Successful' },
        { attemptNumber: 3, weight: 210, status: 'Successful' },
      ],
    });

    const sorted = sortUnifiedRows([lifterHeavy, lifterLight], 'max', 'desc');

    expect(sorted[0]?.registration.id).toBe('light');
    expect(sorted[1]?.registration.id).toBe('heavy');
  });

  it('uses heavier successful openers when bodyweight is tied', () => {
    const openerHeavier = createRow({
      id: 'opener-heavier',
      bodyweight: 90,
      deadliftAttempts: [
        { attemptNumber: 1, weight: 195, status: 'Successful' },
        { attemptNumber: 2, weight: 205, status: 'Failed' },
        { attemptNumber: 3, weight: 210, status: 'Successful' },
      ],
    });

    const openerLighter = createRow({
      id: 'opener-lighter',
      bodyweight: 90,
      deadliftAttempts: [
        { attemptNumber: 1, weight: 190, status: 'Successful' },
        { attemptNumber: 2, weight: 205, status: 'Successful' },
        { attemptNumber: 3, weight: 210, status: 'Successful' },
      ],
    });

    const sorted = sortUnifiedRows([openerLighter, openerHeavier], 'max', 'desc');

    expect(sorted[0]?.registration.id).toBe('opener-heavier');
    expect(sorted[1]?.registration.id).toBe('opener-lighter');
  });

  it('falls back to heavier second attempts when openers match', () => {
    const secondHeavier = createRow({
      id: 'second-heavier',
      bodyweight: 90,
      deadliftAttempts: [
        { attemptNumber: 1, weight: 190, status: 'Successful' },
        { attemptNumber: 2, weight: 198, status: 'Successful' },
        { attemptNumber: 3, weight: 210, status: 'Successful' },
      ],
    });

    const secondLighter = createRow({
      id: 'second-lighter',
      bodyweight: 90,
      deadliftAttempts: [
        { attemptNumber: 1, weight: 190, status: 'Successful' },
        { attemptNumber: 2, weight: 195, status: 'Successful' },
        { attemptNumber: 3, weight: 210, status: 'Successful' },
      ],
    });

    const sorted = sortUnifiedRows([secondLighter, secondHeavier], 'max', 'desc');

    expect(sorted[0]?.registration.id).toBe('second-heavier');
    expect(sorted[1]?.registration.id).toBe('second-lighter');
  });
});

describe('sortUnifiedRows - points column tie breakers', () => {
  it('uses max lift when points are tied', () => {
    const strongerMax = createRow({
      id: 'stronger-max',
      bodyweight: 88,
      points: 450,
      deadliftAttempts: [
        { attemptNumber: 1, weight: 190, status: 'Successful' },
        { attemptNumber: 2, weight: 205, status: 'Successful' },
        { attemptNumber: 3, weight: 215, status: 'Successful' },
      ],
    });

    const lighterMax = createRow({
      id: 'lighter-max',
      bodyweight: 88,
      points: 450,
      deadliftAttempts: [
        { attemptNumber: 1, weight: 180, status: 'Successful' },
        { attemptNumber: 2, weight: 195, status: 'Successful' },
        { attemptNumber: 3, weight: 205, status: 'Successful' },
      ],
    });

    const sorted = sortUnifiedRows([lighterMax, strongerMax], 'points', 'desc');

    expect(sorted[0]?.registration.id).toBe('stronger-max');
    expect(sorted[1]?.registration.id).toBe('lighter-max');
  });

  it('reuses attempt tie breakers after max lift when points are tied', () => {
    const openerAdvantage = createRow({
      id: 'opener-advantage',
      bodyweight: 90,
      points: 470,
      deadliftAttempts: [
        { attemptNumber: 1, weight: 192, status: 'Successful' },
        { attemptNumber: 2, weight: 205, status: 'Successful' },
        { attemptNumber: 3, weight: 212, status: 'Successful' },
      ],
    });

    const openerEqual = createRow({
      id: 'opener-equal',
      bodyweight: 90,
      points: 470,
      deadliftAttempts: [
        { attemptNumber: 1, weight: 190, status: 'Successful' },
        { attemptNumber: 2, weight: 206, status: 'Successful' },
        { attemptNumber: 3, weight: 212, status: 'Successful' },
      ],
    });

    const sorted = sortUnifiedRows([openerEqual, openerAdvantage], 'points', 'desc');

    expect(sorted[0]?.registration.id).toBe('opener-advantage');
    expect(sorted[1]?.registration.id).toBe('opener-equal');
  });
}

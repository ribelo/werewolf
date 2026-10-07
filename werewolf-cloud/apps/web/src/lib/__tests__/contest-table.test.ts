import { describe, it, expect } from 'vitest';

import {
  ATTEMPT_NUMBERS,
  type AttemptCell,
  type AttemptNumber,
  type LiftKind,
  type UnifiedRow,
  buildUnifiedRows,
  sortUnifiedRows,
} from '../contest-table';
import type { Attempt, AttemptStatus, ContestDetail, Registration } from '../types';

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
    flightCode: null,
    flightOrder: null,
    labels: [],
    lifts: [],
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
  bodyweight: number | null;
  deadliftAttempts: AttemptSetup[];
  squatAttempts?: AttemptSetup[];
  benchAttempts?: AttemptSetup[];
  points?: number | null;
  pointsByLift?: Record<LiftKind, number | null>;
}): UnifiedRow {
  const {
    id,
    bodyweight,
    deadliftAttempts,
    squatAttempts = [],
    benchAttempts = [],
    points = null,
    pointsByLift = { Squat: null, Bench: null, Deadlift: null },
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
    pointsByLift,
    maxLift,
    placeOpen: null,
    placeAge: null,
    placeWeight: null,
  };
}

describe('buildUnifiedRows - points calculation', () => {
  it('multiplies total by both reshel and mccullough coefficients', () => {
    const registration = createRegistration('jan', {
      bodyweight: 92,
      reshelCoefficient: 0.831,
      mcculloughCoefficient: 1.795,
    });

    const attempts: Attempt[] = [
      {
        id: 'jan-bench-1',
        registrationId: registration.id,
        liftType: 'Bench',
        attemptNumber: 1,
        weight: 190,
        status: 'Successful',
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      },
      {
        id: 'jan-bench-2',
        registrationId: registration.id,
        liftType: 'Bench',
        attemptNumber: 2,
        weight: 195,
        status: 'Successful',
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      },
      {
        id: 'jan-bench-3',
        registrationId: registration.id,
        liftType: 'Bench',
        attemptNumber: 3,
        weight: 202.5,
        status: 'Successful',
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      },
    ];

    const rows = buildUnifiedRows({
      registrations: [registration],
      attempts,
      contest: null,
    });

    expect(rows).toHaveLength(1);
    const row = rows[0]!;

    expect(row.total).toBeCloseTo(202.5, 5);
    expect(row.points).toBeCloseTo(202.5 * 0.831 * 1.795, 5);
  });
});

describe('sortUnifiedRows - attempt column tie breakers', () => {
  it('heavier bodyweight goes first when sorting ascending', () => {
    const heavier = createRow({
      id: 'heavier',
      bodyweight: 92,
      deadliftAttempts: [
        { attemptNumber: 1, weight: 180, status: 'Successful' },
        { attemptNumber: 2, weight: 200, status: 'Successful' },
      ],
    });

    const lighter = createRow({
      id: 'lighter',
      bodyweight: 82,
      deadliftAttempts: [
        { attemptNumber: 1, weight: 180, status: 'Successful' },
        { attemptNumber: 2, weight: 200, status: 'Successful' },
      ],
    });

    const sorted = sortUnifiedRows([lighter, heavier], 'attempt:Deadlift:1', 'asc');

    expect(sorted[0]?.registration.id).toBe('heavier');
    expect(sorted[1]?.registration.id).toBe('lighter');
  });

  it('uses earlier attempt history when bodyweight matches in ascending order', () => {
    const earlierProgression = createRow({
      id: 'earlier-progression',
      bodyweight: 90,
      deadliftAttempts: [
        { attemptNumber: 1, weight: 190, status: 'Successful' },
        { attemptNumber: 2, weight: 205, status: 'Successful' },
      ],
    });

    const laterProgression = createRow({
      id: 'later-progression',
      bodyweight: 90,
      deadliftAttempts: [
        { attemptNumber: 1, weight: 195, status: 'Successful' },
        { attemptNumber: 2, weight: 205, status: 'Successful' },
      ],
    });

    const sorted = sortUnifiedRows(
      [laterProgression, earlierProgression],
      'attempt:Deadlift:2',
      'asc'
    );

    expect(sorted[0]?.registration.id).toBe('earlier-progression');
    expect(sorted[1]?.registration.id).toBe('later-progression');
  });

  it('prioritises lighter bodyweight before attempt history', () => {
    const lighter = createRow({
      id: 'lighter',
      bodyweight: 82,
      deadliftAttempts: [
        { attemptNumber: 1, weight: 180, status: 'Successful' },
        { attemptNumber: 2, weight: 200, status: 'Successful' },
        { attemptNumber: 3, weight: 215, status: 'Successful' },
      ],
    });

    const heavier = createRow({
      id: 'heavier',
      bodyweight: 88,
      deadliftAttempts: [
        { attemptNumber: 1, weight: 180, status: 'Successful' },
        { attemptNumber: 2, weight: 200, status: 'Successful' },
        { attemptNumber: 3, weight: 215, status: 'Successful' },
      ],
    });

    const sorted = sortUnifiedRows([heavier, lighter], 'attempt:Deadlift:2', 'desc');

    expect(sorted[0]?.registration.id).toBe('lighter');
    expect(sorted[1]?.registration.id).toBe('heavier');
  });

  it('walks back through earlier attempts when weights tie', () => {
    const strongerOpener = createRow({
      id: 'stronger-opener',
      bodyweight: 90,
      deadliftAttempts: [
        { attemptNumber: 1, weight: 205, status: 'Successful' },
        { attemptNumber: 2, weight: 225, status: 'Successful' },
        { attemptNumber: 3, weight: 240, status: 'Successful' },
      ],
    });

    const lighterOpener = createRow({
      id: 'lighter-opener',
      bodyweight: 90,
      deadliftAttempts: [
        { attemptNumber: 1, weight: 195, status: 'Successful' },
        { attemptNumber: 2, weight: 225, status: 'Successful' },
        { attemptNumber: 3, weight: 240, status: 'Successful' },
      ],
    });

    const sorted = sortUnifiedRows(
      [lighterOpener, strongerOpener],
      'attempt:Deadlift:2',
      'desc'
    );

    expect(sorted[0]?.registration.id).toBe('stronger-opener');
    expect(sorted[1]?.registration.id).toBe('lighter-opener');
  });

  it('considers the most recent prior attempt before older ones', () => {
    const strongerSecondAttempt = createRow({
      id: 'stronger-second',
      bodyweight: 90,
      deadliftAttempts: [
        { attemptNumber: 1, weight: 190, status: 'Successful' },
        { attemptNumber: 2, weight: 220, status: 'Successful' },
        { attemptNumber: 3, weight: 235, status: 'Successful' },
      ],
    });

    const strongerOpener = createRow({
      id: 'stronger-opener',
      bodyweight: 90,
      deadliftAttempts: [
        { attemptNumber: 1, weight: 205, status: 'Successful' },
        { attemptNumber: 2, weight: 215, status: 'Successful' },
        { attemptNumber: 3, weight: 235, status: 'Successful' },
      ],
    });

    const sorted = sortUnifiedRows(
      [strongerOpener, strongerSecondAttempt],
      'attempt:Deadlift:3',
      'desc'
    );

    expect(sorted[0]?.registration.id).toBe('stronger-second');
    expect(sorted[1]?.registration.id).toBe('stronger-opener');
  });
});

describe('sortUnifiedRows - max column tie breakers', () => {
  it('prioritises lighter bodyweight before attempt history', () => {
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

    expect(sorted[0]?.registration.id).toBe('lighter-bodyweight');
    expect(sorted[1]?.registration.id).toBe('stronger-second');
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
});

describe('sortUnifiedRows - points tie-breakers in non-points columns', () => {
  it('uses points before name when sorting by total with equal totals and bodyweight', () => {
    const higherPoints = createRow({
      id: 'higher-points',
      bodyweight: 90,
      points: 500,
      deadliftAttempts: [
        { attemptNumber: 1, weight: 200, status: 'Successful' },
      ],
    });

    const lowerPoints = createRow({
      id: 'lower-points',
      bodyweight: 90,
      points: 450,
      deadliftAttempts: [
        { attemptNumber: 1, weight: 200, status: 'Successful' },
      ],
    });

    const sorted = sortUnifiedRows([lowerPoints, higherPoints], 'total', 'desc');

    expect(sorted[0]?.registration.id).toBe('higher-points');
    expect(sorted[1]?.registration.id).toBe('lower-points');
  });

  it('uses points before name when sorting by max with equal max and bodyweight', () => {
    const higherPoints = createRow({
      id: 'higher-points',
      bodyweight: 90,
      points: 500,
      deadliftAttempts: [
        { attemptNumber: 1, weight: 200, status: 'Successful' },
      ],
    });

    const lowerPoints = createRow({
      id: 'lower-points',
      bodyweight: 90,
      points: 450,
      deadliftAttempts: [
        { attemptNumber: 1, weight: 200, status: 'Successful' },
      ],
    });

    const sorted = sortUnifiedRows([lowerPoints, higherPoints], 'max', 'desc');

    expect(sorted[0]?.registration.id).toBe('higher-points');
    expect(sorted[1]?.registration.id).toBe('lower-points');
  });

  it('uses lift-specific points before name when sorting by max:Deadlift with equal values', () => {
    const higherLiftPoints = createRow({
      id: 'higher-lift-points',
      bodyweight: 90,
      points: 400,
      pointsByLift: { Squat: 100, Bench: 100, Deadlift: 200 },
      deadliftAttempts: [
        { attemptNumber: 1, weight: 200, status: 'Successful' },
      ],
    });

    const lowerLiftPoints = createRow({
      id: 'lower-lift-points',
      bodyweight: 90,
      points: 450,
      pointsByLift: { Squat: 150, Bench: 150, Deadlift: 150 },
      deadliftAttempts: [
        { attemptNumber: 1, weight: 200, status: 'Successful' },
      ],
    });

    const sorted = sortUnifiedRows([lowerLiftPoints, higherLiftPoints], 'max:Deadlift', 'desc');

    expect(sorted[0]?.registration.id).toBe('higher-lift-points');
    expect(sorted[1]?.registration.id).toBe('lower-lift-points');
  });

  it('uses lift-specific points before name when sorting by attempt columns with equal values', () => {
    const higherLiftPoints = createRow({
      id: 'higher-lift-points',
      bodyweight: 90,
      points: 400,
      pointsByLift: { Squat: 100, Bench: 100, Deadlift: 200 },
      deadliftAttempts: [
        { attemptNumber: 1, weight: 200, status: 'Successful' },
      ],
    });

    const lowerLiftPoints = createRow({
      id: 'lower-lift-points',
      bodyweight: 90,
      points: 450,
      pointsByLift: { Squat: 150, Bench: 150, Deadlift: 150 },
      deadliftAttempts: [
        { attemptNumber: 1, weight: 200, status: 'Successful' },
      ],
    });

    const sorted = sortUnifiedRows([lowerLiftPoints, higherLiftPoints], 'attempt:Deadlift:1', 'desc');

    expect(sorted[0]?.registration.id).toBe('higher-lift-points');
    expect(sorted[1]?.registration.id).toBe('lower-lift-points');
  });

  it('falls back to overall points when lift-specific points are null in attempt tie-breakers', () => {
    const higherOverallPoints = createRow({
      id: 'higher-overall-points',
      bodyweight: 90,
      points: 500,
      pointsByLift: { Squat: null, Bench: null, Deadlift: null },
      deadliftAttempts: [
        { attemptNumber: 1, weight: 200, status: 'Successful' },
      ],
    });

    const lowerOverallPoints = createRow({
      id: 'lower-overall-points',
      bodyweight: 90,
      points: 450,
      pointsByLift: { Squat: null, Bench: null, Deadlift: null },
      deadliftAttempts: [
        { attemptNumber: 1, weight: 200, status: 'Successful' },
      ],
    });

    const sorted = sortUnifiedRows([lowerOverallPoints, higherOverallPoints], 'attempt:Deadlift:1', 'desc');

    expect(sorted[0]?.registration.id).toBe('higher-overall-points');
    expect(sorted[1]?.registration.id).toBe('lower-overall-points');
  });

  it('handles null points gracefully by treating them as lowest priority', () => {
    const withPoints = createRow({
      id: 'with-points',
      bodyweight: 90,
      points: 400,
      deadliftAttempts: [
        { attemptNumber: 1, weight: 200, status: 'Successful' },
      ],
    });

    const withoutPoints = createRow({
      id: 'without-points',
      bodyweight: 90,
      points: null,
      deadliftAttempts: [
        { attemptNumber: 1, weight: 200, status: 'Successful' },
      ],
    });

    const sorted = sortUnifiedRows([withoutPoints, withPoints], 'total', 'desc');

    expect(sorted[0]?.registration.id).toBe('with-points');
    expect(sorted[1]?.registration.id).toBe('without-points');
  });

  it('respects direction in points tie-breakers for ascending sort', () => {
    const lowerPoints = createRow({
      id: 'lower-points',
      bodyweight: 90,
      points: 400,
      deadliftAttempts: [
        { attemptNumber: 1, weight: 200, status: 'Successful' },
      ],
    });

    const higherPoints = createRow({
      id: 'higher-points',
      bodyweight: 90,
      points: 500,
      deadliftAttempts: [
        { attemptNumber: 1, weight: 200, status: 'Successful' },
      ],
    });

    const sorted = sortUnifiedRows([higherPoints, lowerPoints], 'total', 'asc');

    expect(sorted[0]?.registration.id).toBe('lower-points');
    expect(sorted[1]?.registration.id).toBe('higher-points');
  });
});

function createContest(date: string): ContestDetail {
  return {
    id: 'contest-1',
    name: 'Test Contest',
    date,
    location: 'Hall',
    discipline: 'Powerlifting',
    status: 'InProgress',
    mensBarWeight: 20,
    womensBarWeight: 20,
    clampWeight: 2.5,
    registrations: [],
  };
}

function ageFor(birthDate: string, contestDate: string | null): number | null {
  const registration = createRegistration('age-check', { birthDate });
  const contest = contestDate === null ? null : createContest(contestDate);
  const rows = buildUnifiedRows({ registrations: [registration], attempts: [], contest });

  return rows[0]?.age ?? null;
}

describe('buildUnifiedRows - age on the contest date', () => {
  it('uses the contest date instead of today', () => {
    expect(ageFor('1990-05-15', '2020-05-15')).toBe(30);
    expect(ageFor('1990-05-15', '2020-01-01')).toBe(29);
  });

  it('turns the age over exactly on the birthday', () => {
    expect(ageFor('1990-05-15', '2020-05-14')).toBe(29);
    expect(ageFor('1990-05-15', '2020-05-15')).toBe(30);
    expect(ageFor('1990-05-15', '2020-05-16')).toBe(30);
  });

  it('handles February 29 birthdays around non-leap years', () => {
    expect(ageFor('2000-02-29', '2021-02-28')).toBe(20);
    expect(ageFor('2000-02-29', '2021-03-01')).toBe(21);
    expect(ageFor('2000-02-29', '2024-02-29')).toBe(24);
  });

  it('returns null when either date is missing or malformed', () => {
    expect(ageFor('1990-05-15', null)).toBeNull();
    expect(ageFor('1990-05-15', 'not-a-date')).toBeNull();
    expect(ageFor('1990-05-15', '2020-13-01')).toBeNull();
    expect(ageFor('not-a-date', '2020-05-15')).toBeNull();
    expect(ageFor('', '2020-05-15')).toBeNull();
  });
});

describe('buildUnifiedRows - empty attempt sets', () => {
  it('returns zeroed totals, lift bests and points for a registration without attempts', () => {
    const registration = createRegistration('empty', {
      reshelCoefficient: 0.9,
      mcculloughCoefficient: 1.1,
    });

    const rows = buildUnifiedRows({
      registrations: [registration],
      attempts: [],
      contest: createContest('2024-06-01'),
    });

    expect(rows).toHaveLength(1);
    const row = rows[0]!;

    expect(row.bestSquat).toBe(0);
    expect(row.bestBench).toBe(0);
    expect(row.bestDeadlift).toBe(0);
    expect(row.total).toBe(0);
    expect(row.maxLift).toBe(0);
    expect(row.points).toBe(0);
    expect(row.pointsByLift).toEqual({ Squat: 0, Bench: 0, Deadlift: 0 });
    expect(row.attempts.Squat.map((cell) => cell.attempt)).toEqual([null, null, null]);
    expect(row.attempts.Bench.map((cell) => cell.attempt)).toEqual([null, null, null]);
    expect(row.attempts.Deadlift.map((cell) => cell.attempt)).toEqual([null, null, null]);
  });

  it('ignores attempts that belong to another registration', () => {
    const registration = createRegistration('mine');
    const foreignAttempts: Attempt[] = [
      {
        id: 'other-bench-1',
        registrationId: 'other',
        liftType: 'Bench',
        attemptNumber: 1,
        weight: 200,
        status: 'Successful',
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      },
    ];

    const rows = buildUnifiedRows({
      registrations: [registration],
      attempts: foreignAttempts,
      contest: createContest('2024-06-01'),
    });

    expect(rows[0]?.bestBench).toBe(0);
  });
});

describe('sortUnifiedRows - stable ranking and tie order', () => {
  it('returns an empty list for empty input', () => {
    expect(sortUnifiedRows([], 'total', 'desc')).toEqual([]);
  });

  it('does not mutate the input array and returns a new array', () => {
    const first = createRow({
      id: 'zulu',
      bodyweight: 90,
      deadliftAttempts: [{ attemptNumber: 1, weight: 200, status: 'Successful' }],
    });
    const second = createRow({
      id: 'alpha',
      bodyweight: 90,
      deadliftAttempts: [{ attemptNumber: 1, weight: 200, status: 'Successful' }],
    });
    const input = [first, second];

    const sorted = sortUnifiedRows(input, 'total', 'desc');

    expect(input[0]).toBe(first);
    expect(input[1]).toBe(second);
    expect(sorted).not.toBe(input);
    expect(sorted.map((row) => row.registration.id)).toEqual(['alpha', 'zulu']);
  });

  it('keeps tied totals in a deterministic order across repeated sorts', () => {
    const alpha = createRow({
      id: 'alpha',
      bodyweight: 90,
      deadliftAttempts: [{ attemptNumber: 1, weight: 200, status: 'Successful' }],
    });
    const beta = createRow({
      id: 'beta',
      bodyweight: 90,
      deadliftAttempts: [{ attemptNumber: 1, weight: 200, status: 'Successful' }],
    });

    const firstPass = sortUnifiedRows([beta, alpha], 'total', 'desc').map((row) => row.registration.id);
    const secondPass = sortUnifiedRows([beta, alpha], 'total', 'desc').map((row) => row.registration.id);
    const resortOfSorted = sortUnifiedRows(
      sortUnifiedRows([beta, alpha], 'total', 'desc'),
      'total',
      'desc',
    ).map((row) => row.registration.id);

    expect(firstPass).toEqual(['alpha', 'beta']);
    expect(secondPass).toEqual(firstPass);
    expect(resortOfSorted).toEqual(firstPass);
  });

  it('treats both missing bodyweights as tied and falls back to name', () => {
    const alpha = createRow({
      id: 'alpha',
      bodyweight: null,
      deadliftAttempts: [{ attemptNumber: 1, weight: 200, status: 'Successful' }],
    });
    const beta = createRow({
      id: 'beta',
      bodyweight: null,
      deadliftAttempts: [{ attemptNumber: 1, weight: 200, status: 'Successful' }],
    });

    const sorted = sortUnifiedRows([beta, alpha], 'total', 'desc');

    expect(sorted.map((row) => row.registration.id)).toEqual(['alpha', 'beta']);
  });
});

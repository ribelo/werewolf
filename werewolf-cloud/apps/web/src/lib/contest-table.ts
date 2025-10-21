import { formatAge } from '$lib/utils';
import type {
  Attempt,
  ContestDetail,
  ContestRankingEntry,
  Registration,
} from '$lib/types';

export type LiftKind = 'Squat' | 'Bench' | 'Deadlift';
export type AttemptNumber = 1 | 2 | 3;

export interface AttemptCell {
  liftType: LiftKind;
  attemptNumber: AttemptNumber;
  attempt: Attempt | null;
}

export interface UnifiedRow {
  registration: Registration;
  age: number | null;
  birthDate: string | null;
  attempts: Record<LiftKind, AttemptCell[]>;
  bestSquat: number;
  bestBench: number;
  bestDeadlift: number;
  total: number;
  points: number | null;
  pointsByLift: Record<LiftKind, number | null>;
  maxLift: number;
  placeOpen?: number | null;
  placeAge?: number | null;
  placeWeight?: number | null;
}

export const LIFTS: LiftKind[] = ['Squat', 'Bench', 'Deadlift'];
export const ATTEMPT_NUMBERS: AttemptNumber[] = [1, 2, 3];

function normaliseCompetitionType(input: string | null | undefined): LiftKind[] {
  if (!input) return [];
  const lowered = input.toLowerCase();
  const detected = new Set<LiftKind>();
  for (const lift of LIFTS) {
    if (lowered.includes(lift.toLowerCase())) {
      detected.add(lift);
    }
  }
  return Array.from(detected);
}

export function deriveContestLifts(
  contest: ContestDetail | null,
  attempts: Attempt[],
): LiftKind[] {
  const competitionTypeLifts = normaliseCompetitionType(contest?.competitionType ?? null);
  if (competitionTypeLifts.length > 0) {
    return LIFTS.filter((lift) => competitionTypeLifts.includes(lift));
  }

  const liftsFromAttempts = new Set<LiftKind>();
  for (const attempt of attempts) {
    if (LIFTS.includes(attempt.liftType as LiftKind)) {
      liftsFromAttempts.add(attempt.liftType as LiftKind);
    }
  }

  if (liftsFromAttempts.size > 0) {
    return LIFTS.filter((lift) => liftsFromAttempts.has(lift));
  }

  switch (contest?.discipline) {
    case 'Bench':
      return ['Bench'];
    case 'Deadlift':
      return ['Deadlift'];
    case 'Squat':
      return ['Squat'];
    default:
      return [...LIFTS];
  }
}

function compareAttempt(a: Attempt, b: Attempt): number {
  if (a.liftType !== b.liftType) {
    return LIFTS.indexOf(a.liftType as LiftKind) - LIFTS.indexOf(b.liftType as LiftKind);
  }
  return (a.attemptNumber - b.attemptNumber) as number;
}

function getAttemptsForRegistration(
  registrationId: string,
  attempts: Attempt[]
): Record<LiftKind, AttemptCell[]> {
  const grouped: Record<LiftKind, AttemptCell[]> = {
    Squat: [],
    Bench: [],
    Deadlift: [],
  };

  const relevant = attempts
    .filter((attempt) => attempt.registrationId === registrationId)
    .sort(compareAttempt);

  for (const lift of LIFTS) {
    const liftAttempts = relevant.filter((attempt) => attempt.liftType === lift);
    const cells: AttemptCell[] = ATTEMPT_NUMBERS.map((number) => {
      const attempt = liftAttempts.find((entry) => entry.attemptNumber === number) ?? null;
      return { liftType: lift, attemptNumber: number, attempt };
    });
    grouped[lift] = cells;
  }

  return grouped;
}

function bestSuccessfulWeight(cells: AttemptCell[]): number {
  let best = 0;
  for (const cell of cells) {
    const attempt = cell.attempt;
    if (attempt && attempt.status === 'Successful' && attempt.weight > best) {
      best = attempt.weight;
    }
  }
  return best;
}

function computePoints(
  total: number,
  reshelCoefficient?: number | null,
  mcculloughCoefficient?: number | null
): number | null {
  if (!Number.isFinite(total) || total <= 0) {
    return total === 0 ? 0 : null;
  }

  if (!Number.isFinite(reshelCoefficient as number) || reshelCoefficient == null) {
    return null;
  }

  const reshel = Number(reshelCoefficient);
  const mcc = mcculloughCoefficient == null ? 1 : Number(mcculloughCoefficient);

  if (!Number.isFinite(reshel) || !Number.isFinite(mcc)) {
    return null;
  }

  return total * reshel * mcc;
}

export function buildUnifiedRows(params: {
  registrations: Registration[];
  attempts: Attempt[];
  contest: ContestDetail | null;
  resultsOpen?: ContestRankingEntry[];
  resultsAge?: ContestRankingEntry[];
  resultsWeight?: ContestRankingEntry[];
}): UnifiedRow[] {
  const {
    registrations,
    attempts,
    resultsOpen = [],
    resultsAge = [],
    resultsWeight = [],
  } = params;

  const openMap = new Map(resultsOpen.map((entry) => [entry.registrationId, entry]));
  const ageMap = new Map(resultsAge.map((entry) => [entry.registrationId, entry]));
  const weightMap = new Map(resultsWeight.map((entry) => [entry.registrationId, entry]));

  return registrations.map((registration) => {
    const attemptGrid = getAttemptsForRegistration(registration.id, attempts);
    const permittedLifts = (registration.lifts && registration.lifts.length > 0
      ? (registration.lifts as LiftKind[])
      : [...LIFTS]);
    const uniquePermitted = Array.from(new Set(permittedLifts)) as LiftKind[];
    const bestByLift: Record<LiftKind, number> = {
      Squat: bestSuccessfulWeight(attemptGrid.Squat),
      Bench: bestSuccessfulWeight(attemptGrid.Bench),
      Deadlift: bestSuccessfulWeight(attemptGrid.Deadlift),
    };
    const total = uniquePermitted.reduce((sum, lift) => sum + (bestByLift[lift] ?? 0), 0);
    const pointsByLift: Record<LiftKind, number | null> = {
      Squat: uniquePermitted.includes('Squat')
        ? computePoints(
            bestByLift.Squat,
            registration.reshelCoefficient ?? null,
            registration.mcculloughCoefficient ?? null
          )
        : null,
      Bench: uniquePermitted.includes('Bench')
        ? computePoints(
            bestByLift.Bench,
            registration.reshelCoefficient ?? null,
            registration.mcculloughCoefficient ?? null
          )
        : null,
      Deadlift: uniquePermitted.includes('Deadlift')
        ? computePoints(
            bestByLift.Deadlift,
            registration.reshelCoefficient ?? null,
            registration.mcculloughCoefficient ?? null
          )
        : null,
    };
    let aggregatedPoints = 0;
    let pointsValid = true;
    for (const lift of uniquePermitted) {
      const liftPoints = pointsByLift[lift] ?? null;
      if (liftPoints === null) {
        pointsValid = false;
        break;
      }
      aggregatedPoints += liftPoints;
    }
    const points = pointsValid ? aggregatedPoints : null;
    const maxLift = uniquePermitted.reduce((maxValue, lift) => {
      const value = bestByLift[lift] ?? 0;
      return value > maxValue ? value : maxValue;
    }, 0);

    const openResult = openMap.get(registration.id) ?? null;
    const ageResult = ageMap.get(registration.id) ?? null;
    const weightResult = weightMap.get(registration.id) ?? null;

    const birthDate = registration.birthDate ?? null;
    const age = birthDate ? formatAge(birthDate) : null;

    return {
      registration: {
        ...registration,
        labels: registration.labels ?? [],
      },
      age,
      birthDate,
      attempts: attemptGrid,
      bestSquat: bestByLift.Squat,
      bestBench: bestByLift.Bench,
      bestDeadlift: bestByLift.Deadlift,
      total,
      points,
      pointsByLift,
      maxLift,
      placeOpen: openResult?.placeOpen ?? null,
      placeAge: ageResult?.placeInAgeClass ?? null,
      placeWeight: weightResult?.placeInWeightClass ?? null,
    };
  });
}

function compareByName(regA: Registration, regB: Registration): number {
  const nameA = `${regA.lastName ?? ''} ${regA.firstName ?? ''}`.trim().toLowerCase();
  const nameB = `${regB.lastName ?? ''} ${regB.firstName ?? ''}`.trim().toLowerCase();
  const comparison = nameA.localeCompare(nameB);
  if (comparison !== 0) {
    return comparison;
  }
  return regA.id.localeCompare(regB.id);
}

function compareBodyweightAscending(rowA: UnifiedRow, rowB: UnifiedRow): number {
  const weightA = Number.isFinite(rowA.registration.bodyweight)
    ? rowA.registration.bodyweight
    : Number.POSITIVE_INFINITY;
  const weightB = Number.isFinite(rowB.registration.bodyweight)
    ? rowB.registration.bodyweight
    : Number.POSITIVE_INFINITY;
  if (weightA === weightB) {
    return 0;
  }
  return weightA - weightB;
}

function compareTotalTieBreakers(
  rowA: UnifiedRow,
  rowB: UnifiedRow,
  direction: 'asc' | 'desc'
): number {
  const bodyweightComparison = compareBodyweightAscending(rowA, rowB);
  if (bodyweightComparison !== 0) {
    return direction === 'asc' ? -bodyweightComparison : bodyweightComparison;
  }

  return compareByName(rowA.registration, rowB.registration);
}

function findEarliestSuccess(attempts: AttemptCell[], targetWeight: number): number {
  for (const cell of attempts) {
    const attempt = cell.attempt;
    if (
      attempt &&
      attempt.status === 'Successful' &&
      attempt.weight === targetWeight
    ) {
      return attempt.attemptNumber;
    }
  }
  return Number.POSITIVE_INFINITY;
}

function getAttemptCellsForMax(row: UnifiedRow): AttemptCell[] {
  const liftSummaries: Array<{ lift: LiftKind; best: number; attempts: AttemptCell[] }> = [
    { lift: 'Squat', best: row.bestSquat, attempts: row.attempts.Squat },
    { lift: 'Bench', best: row.bestBench, attempts: row.attempts.Bench },
    { lift: 'Deadlift', best: row.bestDeadlift, attempts: row.attempts.Deadlift },
  ];

  const target = row.maxLift;
  const matching = target > 0
    ? liftSummaries.filter((entry) => entry.best === target)
    : [];

  if (matching.length === 0) {
    const nonZero = liftSummaries.filter((entry) => entry.best > 0);
    if (nonZero.length > 0) {
      return nonZero[0]!.attempts;
    }
    return liftSummaries[0]!.attempts;
  }

  let selected = matching[0]!;
  let bestAttemptNumber = findEarliestSuccess(selected.attempts, target);

  for (let index = 1; index < matching.length; index += 1) {
    const candidate = matching[index]!;
    const attemptNumber = findEarliestSuccess(candidate.attempts, target);
    if (attemptNumber < bestAttemptNumber) {
      selected = candidate;
      bestAttemptNumber = attemptNumber;
    }
  }

  return selected.attempts;
}

function buildAttemptSequence(row: UnifiedRow): number[] {
  const attemptCells = getAttemptCellsForMax(row);
  return ATTEMPT_NUMBERS.map((attemptNumber) => {
    const cell = attemptCells[attemptNumber - 1];
    const attempt = cell?.attempt ?? null;
    if (attempt && attempt.status === 'Successful') {
      return attempt.weight;
    }
    return -1;
  });
}

function compareAttemptProgressionDescending(rowA: UnifiedRow, rowB: UnifiedRow): number {
  const sequenceA = buildAttemptSequence(rowA);
  const sequenceB = buildAttemptSequence(rowB);

  for (let index = 0; index < sequenceA.length; index += 1) {
    const weightA = sequenceA[index]!;
    const weightB = sequenceB[index]!;
    if (weightA === weightB) {
      continue;
    }
    return weightB - weightA;
  }

  return 0;
}

function compareMaxTieBreakers(
  rowA: UnifiedRow,
  rowB: UnifiedRow,
  direction: 'asc' | 'desc'
): number {
  const bodyweightComparison = compareBodyweightAscending(rowA, rowB);
  if (bodyweightComparison !== 0) {
    return bodyweightComparison;
  }

  const attemptComparison = compareAttemptProgressionDescending(rowA, rowB);
  const attemptAdjusted = direction === 'asc' ? -attemptComparison : attemptComparison;
  if (attemptAdjusted !== 0) {
    return attemptAdjusted;
  }

  return compareByName(rowA.registration, rowB.registration);
}

export function sortUnifiedRows(
  rows: UnifiedRow[],
  column: string,
  direction: 'asc' | 'desc'
): UnifiedRow[] {
  const modifier = direction === 'asc' ? 1 : -1;

  const sorted = [...rows].sort((a, b) => {
    const regA = a.registration;
    const regB = b.registration;

    // Sort by specific attempt weight (e.g., 'attempt:Bench:1')
    if (column.startsWith('attempt:')) {
      const parts = column.split(':');
      const lift = (parts[1] ?? '') as LiftKind;
      const attemptNum = parseInt(parts[2] ?? '0', 10) as AttemptNumber;
      const index = (attemptNum as number) - 1;

      const cellA = a.attempts?.[lift]?.[index] ?? null;
      const cellB = b.attempts?.[lift]?.[index] ?? null;
      const weightA = cellA?.attempt?.weight ?? Number.NEGATIVE_INFINITY;
      const weightB = cellB?.attempt?.weight ?? Number.NEGATIVE_INFINITY;
      if (weightA !== weightB) {
        return (weightA - weightB) * modifier;
      }
      // Tiebreaker: name
      return `${regA.lastName} ${regA.firstName}`.localeCompare(`${regB.lastName} ${regB.firstName}`) * modifier;
    }

    switch (column) {
      case 'name': {
        const nameA = `${regA.lastName} ${regA.firstName}`.toLowerCase();
        const nameB = `${regB.lastName} ${regB.firstName}`.toLowerCase();
        return nameA.localeCompare(nameB) * modifier;
      }
      case 'gender': {
        const genderA = (regA.gender ?? '').toLowerCase();
        const genderB = (regB.gender ?? '').toLowerCase();
        if (genderA === genderB) {
          return `${regA.lastName} ${regA.firstName}`.localeCompare(
            `${regB.lastName} ${regB.firstName}`
          ) * modifier;
        }
        return genderA.localeCompare(genderB) * modifier;
      }
      case 'age': {
        const valueA = a.age ?? Number.POSITIVE_INFINITY;
        const valueB = b.age ?? Number.POSITIVE_INFINITY;
        return (valueA - valueB) * modifier;
      }
      case 'bodyweight': {
        return (regA.bodyweight - regB.bodyweight) * modifier;
      }
      case 'weightClass': {
        return (regA.weightClassName ?? '').localeCompare(regB.weightClassName ?? '') * modifier;
      }
      case 'ageClass': {
        return (regA.ageCategoryName ?? '').localeCompare(regB.ageCategoryName ?? '') * modifier;
      }
      case 'reshel': {
        const valueA = regA.reshelCoefficient ?? Number.NEGATIVE_INFINITY;
        const valueB = regB.reshelCoefficient ?? Number.NEGATIVE_INFINITY;
        return (valueA - valueB) * modifier;
      }
      case 'mccullough': {
        const valueA = regA.mcculloughCoefficient ?? Number.NEGATIVE_INFINITY;
        const valueB = regB.mcculloughCoefficient ?? Number.NEGATIVE_INFINITY;
        return (valueA - valueB) * modifier;
      }
      case 'points': {
        const valueA = a.points ?? Number.NEGATIVE_INFINITY;
        const valueB = b.points ?? Number.NEGATIVE_INFINITY;
        if (valueA !== valueB) {
          return direction === 'asc' ? valueA - valueB : valueB - valueA;
        }

        const maxComparison = direction === 'asc' ? a.maxLift - b.maxLift : b.maxLift - a.maxLift;
        if (maxComparison !== 0) {
          return maxComparison;
        }

        return compareMaxTieBreakers(a, b, direction);
      }
      case 'total': {
        const totalComparison = (a.total - b.total) * modifier;
        if (totalComparison !== 0) {
          return totalComparison;
        }

        const tieBreaker = compareTotalTieBreakers(a, b, direction);
        if (tieBreaker !== 0) {
          return tieBreaker;
        }

        return compareMaxTieBreakers(a, b, direction);
      }
      case 'max': {
        const maxComparison = direction === 'asc'
          ? a.maxLift - b.maxLift
          : b.maxLift - a.maxLift;
        if (maxComparison !== 0) {
          return maxComparison;
        }

        return compareMaxTieBreakers(a, b, direction);
      }
      case 'flight': {
        const valueA = regA.flightCode ?? '';
        const valueB = regB.flightCode ?? '';
        if (valueA === valueB) {
          const orderA = regA.flightOrder ?? regA.competitionOrder ?? Number.POSITIVE_INFINITY;
          const orderB = regB.flightOrder ?? regB.competitionOrder ?? Number.POSITIVE_INFINITY;
          return (orderA - orderB) * modifier;
        }
        return valueA.localeCompare(valueB) * modifier;
      }
      case 'order':
      default: {
        const orderA = regA.competitionOrder ?? Number.POSITIVE_INFINITY;
        const orderB = regB.competitionOrder ?? Number.POSITIVE_INFINITY;
        if (orderA === orderB) {
          return `${regA.lastName} ${regA.firstName}`.localeCompare(`${regB.lastName} ${regB.firstName}`) * modifier;
        }
        return (orderA - orderB) * modifier;
      }
    }
  });

  return sorted;
}

export function filterRowsByFlight(rows: UnifiedRow[], flight: string | null): UnifiedRow[] {
  if (!flight || flight === 'ALL') {
    return rows;
  }
  return rows.filter((row) => row.registration.flightCode === flight);
}

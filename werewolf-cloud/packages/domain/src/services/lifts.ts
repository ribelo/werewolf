import type { LiftType } from '../models/attempt';

export const ALL_LIFTS: readonly LiftType[] = ['Squat', 'Bench', 'Deadlift'] as const;

function containsLift(source: string | null | undefined, lift: LiftType): boolean {
  if (!source || typeof source !== 'string') return false;
  const lower = source.toLowerCase();
  return lower.includes(lift.toLowerCase());
}

export function resolveContestLifts(params: {
  competitionType?: string | null;
  discipline?: string | null;
  fallback?: LiftType[];
}): LiftType[] {
  const { competitionType, discipline, fallback = [...ALL_LIFTS] } = params;

  const competitionLifts = ALL_LIFTS.filter((lift) => containsLift(competitionType, lift));
  if (competitionLifts.length > 0) {
    return competitionLifts;
  }

  if (discipline) {
    const lifted = ALL_LIFTS.filter((lift) => containsLift(discipline, lift));
    if (lifted.length > 0) {
      return lifted;
    }
  }

  return [...fallback];
}

export function normaliseRequestedLifts(requested: readonly (string | LiftType)[], allowed: readonly LiftType[]): LiftType[] {
  const allowedSet = new Set(allowed);
  const seen = new Set<LiftType>();
  for (const raw of requested) {
    const candidate = typeof raw === 'string'
      ? ALL_LIFTS.find((lift) => lift.toLowerCase() === raw.trim().toLowerCase())
      : raw;
    if (candidate && allowedSet.has(candidate) && !seen.has(candidate)) {
      seen.add(candidate);
    }
  }

  if (seen.size === 0) {
    return [...allowed];
  }

  return [...ALL_LIFTS.filter((lift) => seen.has(lift))];
}

export function ensureLiftsWithinContest(requested: readonly (string | LiftType)[], contestLifts: LiftType[]): LiftType[] {
  const allowed = contestLifts.length > 0 ? contestLifts : [...ALL_LIFTS];
  return normaliseRequestedLifts(requested, allowed);
}

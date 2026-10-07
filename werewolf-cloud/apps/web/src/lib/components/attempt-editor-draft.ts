import type { Attempt, AttemptNumber, AttemptStatus, LiftType } from '$lib/types';

/** Draft key of one lift/attempt cell of the editor table. */
export type AttemptDraftKey = `${LiftType}-${AttemptNumber}`;

export interface AttemptDraftValue {
  weight: string;
  status: AttemptStatus;
}

/** Raw editor input: weights are kept as strings until they are validated. */
export type AttemptDraftState = Partial<Record<AttemptDraftKey, AttemptDraftValue>>;

export interface AttemptDraftUpdate {
  liftType: LiftType;
  attemptNumber: AttemptNumber;
  weight: number;
}

export interface AttemptDraftIssue {
  liftType: LiftType;
  attemptNumber: AttemptNumber;
  value: string;
}

export interface AttemptSavePlan {
  /** Drafts that differ from the stored attempt, in the order they are persisted. */
  updates: AttemptDraftUpdate[];
  /** Drafts that cannot be persisted (blank cells are skipped, not reported). */
  invalid: AttemptDraftIssue[];
}

export function attemptDraftKey(liftType: LiftType, attemptNumber: AttemptNumber): AttemptDraftKey {
  return `${liftType}-${attemptNumber}`;
}

/**
 * Turns editor drafts into the attempts that have to be persisted, without
 * touching the network: blank cells are left alone (there is no "clear attempt"
 * call), weights are numbers greater than zero, and cells that still hold the
 * stored weight are not re-sent. Non-numeric or non-positive weights are
 * reported as invalid so the caller can refuse the whole save.
 */
export function planAttemptSave(
  drafts: AttemptDraftState,
  attempts: readonly Attempt[],
  lifts: readonly LiftType[],
  attemptNumbers: readonly AttemptNumber[],
): AttemptSavePlan {
  const updates: AttemptDraftUpdate[] = [];
  const invalid: AttemptDraftIssue[] = [];

  for (const liftType of lifts) {
    for (const attemptNumber of attemptNumbers) {
      const raw = drafts[attemptDraftKey(liftType, attemptNumber)]?.weight.trim() ?? '';
      if (raw === '') continue;

      const weight = Number(raw);
      if (!Number.isFinite(weight) || weight <= 0) {
        invalid.push({ liftType, attemptNumber, value: raw });
        continue;
      }

      const stored = attempts.find(
        (attempt) => attempt.liftType === liftType && attempt.attemptNumber === attemptNumber,
      );
      if (stored && stored.weight === weight) continue;

      updates.push({ liftType, attemptNumber, weight });
    }
  }

  return { updates, invalid };
}

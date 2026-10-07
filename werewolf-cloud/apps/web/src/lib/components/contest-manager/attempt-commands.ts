import type {
  Attempt,
  AttemptNumber,
  CurrentAttempt,
  CurrentAttemptBundle,
  LiftType,
} from '$lib/types';

/** Attempts plus the attempt highlighted on the desk, as one restorable unit. */
export interface AttemptStateSnapshot {
  attempts: Attempt[];
  current: CurrentAttempt | null;
}

/** Server payload of a realtime `snapshot` event (see RealtimeSnapshot in $lib/types). */
export interface AttemptSnapshotPayload {
  attempts: Attempt[];
  currentAttempt: CurrentAttemptBundle | null;
}

/** Any mutation outcome that can report it was stored in the offline queue. */
export interface QueuedCapableOutcome {
  queued?: boolean;
}

export interface AttemptMutationOptions<T extends QueuedCapableOutcome> {
  /** State captured before the optimistic change; restored verbatim when the action fails. */
  snapshot: AttemptStateSnapshot;
  /** Optimistic change applied while the action is in flight. */
  optimistically: (snapshot: AttemptStateSnapshot) => AttemptStateSnapshot;
  /** Called with the optimistic state before the action starts, so it can be rendered. */
  onOptimistic?: (state: AttemptStateSnapshot) => void;
  action: () => Promise<T>;
}

export interface AttemptMutationResult<T> {
  /**
   * `true` when the action was accepted: either by the server, or by the offline
   * queue (see `queued`). `false` means the action failed and `state` is the
   * exact pre-mutation snapshot.
   */
  ok: boolean;
  /**
   * `true` when the mutation never reached the server. The optimistic state is
   * still the best available state, so callers must keep it and must not
   * re-read from the server.
   */
  queued: boolean;
  state: AttemptStateSnapshot;
  outcome: T | null;
  error: unknown;
}

export function cloneAttempts(source: Attempt[]): Attempt[] {
  return source.map((attempt) => ({ ...attempt }));
}

export function cloneCurrentAttempt(current: CurrentAttempt | null): CurrentAttempt | null {
  if (!current) return null;
  return { ...current };
}

/** Deep-copies attempts and current attempt so later mutations cannot touch the snapshot. */
export function captureAttemptState(
  attempts: Attempt[],
  current: CurrentAttempt | null,
): AttemptStateSnapshot {
  return {
    attempts: cloneAttempts(attempts),
    current: cloneCurrentAttempt(current),
  };
}

/**
 * Restores a captured snapshot exactly, including an originally `null` current
 * attempt: a failed "set current attempt" must bring back the previous selection
 * (or its absence), never leave the failed selection in place.
 */
export function restoreAttemptSnapshot(snapshot: AttemptStateSnapshot): AttemptStateSnapshot {
  return {
    attempts: cloneAttempts(snapshot.attempts),
    current: cloneCurrentAttempt(snapshot.current),
  };
}

export function sameAttempt(existing: Attempt, candidate: Attempt): boolean {
  return (
    existing.registrationId === candidate.registrationId &&
    existing.liftType === candidate.liftType &&
    existing.attemptNumber === candidate.attemptNumber
  );
}

export function buildAttemptKey(
  registrationId: string,
  lift: LiftType,
  attemptNumber: number | AttemptNumber,
): string {
  return `${registrationId}:${String(lift)}:${attemptNumber}`;
}

export function attemptKeyFromAttempt(attempt: Attempt): string {
  return buildAttemptKey(attempt.registrationId, attempt.liftType, attempt.attemptNumber);
}

export function attemptKeyFromPayload(payload: {
  registrationId: string;
  liftType: LiftType;
  attemptNumber: number | AttemptNumber;
}): string {
  return buildAttemptKey(payload.registrationId, payload.liftType, payload.attemptNumber);
}

/** Replaces an attempt by id (or by registration/lift/number) and appends unknown ones. */
export function upsertAttempt(attempts: Attempt[], attempt: Attempt): Attempt[] {
  if (!attempt?.id) return attempts;

  const indexById = attempts.findIndex((existing) => existing.id === attempt.id);
  const index = indexById >= 0 ? indexById : attempts.findIndex((existing) => sameAttempt(existing, attempt));

  if (index < 0) {
    return [...attempts, attempt];
  }

  const merged = { ...attempts[index], ...attempt };
  return [...attempts.slice(0, index), merged, ...attempts.slice(index + 1)];
}

/**
 * Applies optimistically rendered attempts to a snapshot, keeping the current
 * attempt in sync when one of them is the current one.
 */
export function applyOptimisticAttempts(
  snapshot: AttemptStateSnapshot,
  attemptsToApply: Attempt[],
): AttemptStateSnapshot {
  let attempts = snapshot.attempts;
  for (const attempt of attemptsToApply) {
    attempts = upsertAttempt(attempts, attempt);
  }

  const currentUpdate = snapshot.current
    ? attemptsToApply.find((attempt) => attempt.id === snapshot.current?.id)
    : undefined;

  return {
    attempts,
    current: snapshot.current && currentUpdate ? { ...snapshot.current, ...currentUpdate } : snapshot.current,
  };
}

export function removeAttemptById(attempts: Attempt[], attemptId: string): Attempt[] {
  if (!attempts.some((attempt) => attempt.id === attemptId)) return attempts;
  return attempts.filter((attempt) => attempt.id !== attemptId);
}

/**
 * The realtime client emits a full snapshot when it connects, reconnects and on
 * every polling cycle. Consumers replace their attempt state with it - including
 * deletions and an empty current attempt - instead of replaying single events.
 */
export function applySnapshot(
  snapshot: AttemptSnapshotPayload,
  toCurrentAttempt: (bundle: CurrentAttemptBundle) => CurrentAttempt,
): AttemptStateSnapshot {
  return {
    attempts: cloneAttempts(snapshot.attempts ?? []),
    current: snapshot.currentAttempt ? toCurrentAttempt(snapshot.currentAttempt) : null,
  };
}

/** Adds/removes one pending-spinner key without touching the others. */
export function setPendingFlag(
  flags: Record<string, boolean>,
  key: string,
  value: boolean,
): Record<string, boolean> {
  if (!key) return flags;
  if (value) {
    return { ...flags, [key]: true };
  }
  const { [key]: _omitted, ...rest } = flags;
  return rest;
}

/**
 * A queued receipt proves the mutation only reached the offline queue. The
 * server state is older than the optimistic state, so re-reading it would wipe
 * the row the operator just edited.
 */
export function isQueuedReceipt(outcome: QueuedCapableOutcome | null | undefined): boolean {
  return outcome?.queued === true;
}

/** Whether a finished attempt mutation should be reconciled with the server. */
export function shouldRefreshAfterAttemptMutation(result: {
  ok: boolean;
  queued: boolean;
}): boolean {
  return result.ok && !result.queued;
}

/**
 * Runs one optimistic attempt mutation: applies the optimistic state, awaits the
 * action, and rolls the state back to the exact snapshot when it fails. A queued
 * receipt keeps the optimistic state.
 */
export async function runAttemptMutation<T extends QueuedCapableOutcome>(
  options: AttemptMutationOptions<T>,
): Promise<AttemptMutationResult<T>> {
  const optimistic = options.optimistically(options.snapshot);
  options.onOptimistic?.(optimistic);

  try {
    const outcome = await options.action();
    if (isQueuedReceipt(outcome)) {
      return { ok: true, queued: true, state: optimistic, outcome, error: null };
    }
    return { ok: true, queued: false, state: optimistic, outcome, error: null };
  } catch (error) {
    return {
      ok: false,
      queued: false,
      state: restoreAttemptSnapshot(options.snapshot),
      outcome: null,
      error,
    };
  }
}

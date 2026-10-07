import { bundleToCurrentAttempt } from '$lib/current-attempt';
import type {
  Attempt,
  CurrentAttempt,
  CurrentAttemptBundle,
  LiveEvent,
  RealtimeSnapshot,
} from '$lib/types';

/** Data the current-attempt screen keeps in sync from realtime events. */
export interface CurrentAttemptLiveState {
  attempts: Attempt[];
  bundle: CurrentAttemptBundle | null;
  currentAttempt: CurrentAttempt | null;
}

export function createCurrentAttemptLiveState(
  attempts: Attempt[],
  bundle: CurrentAttemptBundle | null
): CurrentAttemptLiveState {
  return {
    attempts: [...attempts],
    bundle,
    currentAttempt: bundle ? bundleToCurrentAttempt(bundle) : null,
  };
}

function upsertAttempt(attempts: Attempt[], payload: Attempt): Attempt[] {
  const index = attempts.findIndex((item) => item.id === payload.id);
  if (index < 0) {
    return [...attempts, payload];
  }
  const next = [...attempts];
  next[index] = payload;
  return next;
}

function mergeAttemptResult(attempts: Attempt[], payload: Attempt): Attempt[] {
  const index = attempts.findIndex((item) => item.id === payload.id);
  const existing = index >= 0 ? attempts[index] : undefined;
  if (!existing) {
    return attempts;
  }
  const next = [...attempts];
  next[index] = { ...existing, ...payload };
  return next;
}

function sameRegistration(bundle: CurrentAttemptBundle, payload: Attempt): boolean {
  return payload.registrationId === bundle.registration?.id;
}

/** Replaces the matching attempt inside the bundle (attempt.upserted). */
function replaceAttemptInBundle(
  bundle: CurrentAttemptBundle,
  payload: Attempt
): CurrentAttemptBundle | null {
  if (!sameRegistration(bundle, payload)) return null;
  const attemptsForLift = bundle.attemptsByLift[payload.liftType];
  if (!attemptsForLift) return null;

  const index = attemptsForLift.findIndex((item) => item.attemptNumber === payload.attemptNumber);
  const existing = index >= 0 ? attemptsForLift[index] : undefined;
  if (!existing) return null;

  const nextAttempts = [...attemptsForLift];
  nextAttempts[index] = {
    ...existing,
    weight: payload.weight,
    status: payload.status,
    updatedAt: payload.updatedAt,
    id: payload.id,
    liftType: payload.liftType,
    attemptNumber: payload.attemptNumber,
  };

  return {
    ...bundle,
    attemptsByLift: { ...bundle.attemptsByLift, [payload.liftType]: nextAttempts },
  };
}

/** Merges a judge result into the matching attempt of the bundle. */
function mergeResultIntoBundle(
  bundle: CurrentAttemptBundle,
  payload: Attempt
): CurrentAttemptBundle | null {
  if (!sameRegistration(bundle, payload)) return null;
  const attemptsForLift = bundle.attemptsByLift[payload.liftType];
  if (!attemptsForLift) return null;

  const index = attemptsForLift.findIndex((item) => item.attemptNumber === payload.attemptNumber);
  const existing = index >= 0 ? attemptsForLift[index] : undefined;
  if (!existing) return null;

  const nextAttempts = [...attemptsForLift];
  nextAttempts[index] = {
    ...existing,
    status: payload.status,
    weight: payload.weight,
    updatedAt: payload.updatedAt ?? existing.updatedAt ?? null,
  };

  return {
    ...bundle,
    attemptsByLift: { ...bundle.attemptsByLift, [payload.liftType]: nextAttempts },
  };
}

function withBundle(
  state: CurrentAttemptLiveState,
  bundle: CurrentAttemptBundle | null
): CurrentAttemptLiveState {
  return {
    ...state,
    bundle,
    currentAttempt: bundle ? bundleToCurrentAttempt(bundle) : null,
  };
}

/**
 * Applies one realtime event to the current-attempt state. Returns the same
 * state object when the event carries no data for this screen.
 */
export function reduceCurrentAttemptEvent(
  state: CurrentAttemptLiveState,
  event: LiveEvent
): CurrentAttemptLiveState {
  switch (event.type) {
    case 'attempt.upserted': {
      const payload = event.data as Attempt | undefined;
      if (!payload) return state;
      const attempts = upsertAttempt(state.attempts, payload);
      const bundle = state.bundle ? replaceAttemptInBundle(state.bundle, payload) : null;
      return bundle ? withBundle({ ...state, attempts }, bundle) : { ...state, attempts };
    }

    case 'attempt.resultUpdated': {
      const payload = event.data as Attempt | undefined;
      if (!payload) return state;
      const attempts = mergeAttemptResult(state.attempts, payload);
      const bundle = state.bundle ? mergeResultIntoBundle(state.bundle, payload) : null;
      const nextState = attempts === state.attempts ? state : { ...state, attempts };
      return bundle ? withBundle(nextState, bundle) : nextState;
    }

    case 'attempt.currentSet': {
      const payload = event.data as CurrentAttemptBundle | null | undefined;
      if (!payload) return state;
      return withBundle(state, payload);
    }

    case 'attempt.currentCleared':
      return { ...state, bundle: null, currentAttempt: null };

    case 'snapshot': {
      const snapshot = event.data as RealtimeSnapshot | undefined;
      if (!snapshot || !Array.isArray(snapshot.attempts)) return state;
      return withBundle({ ...state, attempts: [...snapshot.attempts] }, snapshot.currentAttempt ?? null);
    }

    default:
      return state;
  }
}

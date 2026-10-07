import { bundleToCurrentAttempt } from '$lib/current-attempt';
import type {
  Attempt,
  AttemptNumber,
  AttemptStatus,
  CurrentAttempt,
  CurrentAttemptBundle,
  LiveEvent,
  RealtimeSnapshot,
  Registration,
} from '$lib/types';

/** Data the table screen keeps in sync from realtime events. */
export interface TableLiveState {
  attempts: Attempt[];
  registrations: Registration[];
  currentBundle: CurrentAttemptBundle | null;
  currentAttempt: CurrentAttempt | null;
}

export interface TableLiveContext {
  /** Shown when an attempt cannot be matched to a registration. */
  unknownCompetitorLabel: string;
}

export function createTableLiveState(
  attempts: Attempt[],
  registrations: Registration[],
  currentAttempt: CurrentAttemptBundle | null
): TableLiveState {
  return {
    attempts: [...attempts],
    registrations: [...registrations],
    currentBundle: currentAttempt,
    currentAttempt: currentAttempt ? bundleToCurrentAttempt(currentAttempt) : null,
  };
}

function isBundle(
  value: CurrentAttemptBundle | Attempt | CurrentAttempt
): value is CurrentAttemptBundle {
  return 'attempt' in value;
}

function isCurrentAttempt(
  value: CurrentAttemptBundle | Attempt | CurrentAttempt
): value is CurrentAttempt {
  return 'competitorName' in value && Boolean(value.competitorName);
}

/**
 * Normalises the payload of `attempt.currentSet` into the compact current
 * attempt shape. The API may send a full bundle, an already-summarised current
 * attempt, or a plain attempt that still needs its competitor resolved.
 */
export function toCurrentAttemptSummary(
  input: CurrentAttemptBundle | Attempt | CurrentAttempt,
  registrations: Registration[],
  unknownCompetitorLabel: string
): CurrentAttempt {
  if (isBundle(input)) {
    return bundleToCurrentAttempt(input);
  }

  if (isCurrentAttempt(input)) {
    return input;
  }

  const registration = registrations.find((entry) => entry.id === input.registrationId);
  const competitorName = registration
    ? `${registration.lastName} ${registration.firstName}`
    : input.competitorName ?? unknownCompetitorLabel;

  return {
    id: input.id,
    registrationId: input.registrationId,
    competitorName,
    liftType: input.liftType,
    attemptNumber: input.attemptNumber as AttemptNumber,
    weight: input.weight,
    status: input.status as AttemptStatus,
    competitionOrder: registration?.competitionOrder ?? null,
    updatedAt: input.updatedAt ?? null,
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

/**
 * Applies one realtime event to the table state. Returns the same state object
 * when the event carries no table data (display sync events, heartbeat, ...).
 * `display.filtersSynced` and `display.qrVisibility` only drive UI toggles and
 * are handled by the page itself.
 */
export function reduceTableLiveEvent(
  state: TableLiveState,
  event: LiveEvent,
  context: TableLiveContext
): TableLiveState {
  switch (event.type) {
    case 'attempt.upserted': {
      const payload = event.data as Attempt | undefined;
      if (!payload) return state;
      return { ...state, attempts: upsertAttempt(state.attempts, payload) };
    }

    case 'attempt.resultUpdated': {
      const payload = event.data as Attempt | undefined;
      if (!payload) return state;
      const attempts = mergeAttemptResult(state.attempts, payload);
      return attempts === state.attempts ? state : { ...state, attempts };
    }

    case 'attempt.currentSet': {
      const payload = event.data as CurrentAttemptBundle | Attempt | CurrentAttempt | undefined;
      if (!payload) return state;
      return {
        ...state,
        currentBundle: isBundle(payload) ? payload : state.currentBundle,
        currentAttempt: toCurrentAttemptSummary(
          payload,
          state.registrations,
          context.unknownCompetitorLabel
        ),
      };
    }

    case 'attempt.currentCleared':
      return { ...state, currentBundle: null, currentAttempt: null };

    case 'registration.upserted': {
      const payload = event.data as Registration | undefined;
      if (!payload) return state;
      const index = state.registrations.findIndex((item) => item.id === payload.id);
      const registrations = [...state.registrations];
      const existing = index >= 0 ? registrations[index] : undefined;
      if (existing) {
        registrations[index] = { ...existing, ...payload };
      } else {
        registrations.push(payload);
      }
      return { ...state, registrations };
    }

    case 'registration.deleted': {
      const payload = event.data as { registrationId?: string } | undefined;
      const registrationId = payload?.registrationId;
      if (!registrationId) return state;
      const registrations = state.registrations.filter((entry) => entry.id !== registrationId);
      const removed = registrations.length !== state.registrations.length;
      return {
        ...state,
        registrations,
        attempts: removed
          ? state.attempts.filter((attempt) => attempt.registrationId !== registrationId)
          : state.attempts,
      };
    }

    case 'snapshot': {
      const snapshot = event.data as RealtimeSnapshot | undefined;
      if (!snapshot || !Array.isArray(snapshot.attempts)) return state;
      const currentBundle = snapshot.currentAttempt ?? null;
      return {
        ...state,
        attempts: [...snapshot.attempts],
        currentBundle,
        currentAttempt: currentBundle ? bundleToCurrentAttempt(currentBundle) : null,
      };
    }

    default:
      return state;
  }
}

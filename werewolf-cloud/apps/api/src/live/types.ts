import type { DisplayFilterSync, DisplayQrVisibility } from '@werewolf/domain';

export type AttemptSummary = {
  attemptId: string;
  registrationId: string;
  liftType: 'Squat' | 'Bench' | 'Deadlift';
  attemptNumber: number;
  weight: number;
  status?: string;
};

/**
 * Payload of events that forward a stored row (or a bundle built from rows)
 * after convertKeysToCamelCase.
 */
export type RowPayload = Record<string, unknown>;

export type AttemptDeletedPayload = RowPayload;

export type RegistrationDeletedPayload = {
  registrationId: string;
};

export type QueueUpdatedPayload = {
  flight?: string | null;
  nextAttemptId?: string | null;
};

export type ScoreboardUpdatedPayload = {
  standings?: readonly unknown[];
};

export type ContestStateChangedPayload = {
  status: string;
  currentLift?: string | null;
  currentRound?: number;
};

export type HeartbeatPayload = {
  connections: number;
};

export type LiveEventPayloads = {
  'attempt.upserted': RowPayload;
  'attempt.deleted': AttemptDeletedPayload;
  'attempt.resultUpdated': RowPayload;
  'attempt.currentSet': RowPayload;
  'attempt.currentCleared': RowPayload;
  'registration.upserted': RowPayload;
  'registration.deleted': RegistrationDeletedPayload;
  'queue.updated': QueueUpdatedPayload;
  'scoreboard.updated': ScoreboardUpdatedPayload;
  'contest.stateChanged': ContestStateChangedPayload;
  'display.filtersSynced': DisplayFilterSync;
  'display.qrVisibility': DisplayQrVisibility;
  heartbeat: HeartbeatPayload;
};

export type LiveEventType = keyof LiveEventPayloads;

export type LiveEvent<K extends LiveEventType = LiveEventType> = {
  type: K;
  contestId: string;
  timestamp: string; // ISO
  payload: LiveEventPayloads[K];
};

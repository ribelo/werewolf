export type LiveEventType =
  | 'attempt.upserted'
  | 'attempt.deleted'
  | 'attempt.resultUpdated'
  | 'attempt.currentSet'
  | 'attempt.currentCleared'
  | 'registration.upserted'
  | 'registration.deleted'
  | 'queue.updated'
  | 'scoreboard.updated'
  | 'contest.stateChanged'
  | 'heartbeat';

export type LiveEvent<T = Record<string, unknown>> = {
  type: LiveEventType;
  contestId: string;
  timestamp: string; // ISO
  payload: T;
};

export type AttemptSummary = {
  attemptId: string;
  registrationId: string;
  liftType: 'Squat' | 'Bench' | 'Deadlift';
  attemptNumber: number;
  weight: number;
  status?: string;
};

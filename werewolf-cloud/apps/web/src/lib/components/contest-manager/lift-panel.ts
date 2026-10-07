import type { LiftKind } from '$lib/contest-table';

export type RegistrationFilterTarget = 'weight' | 'age' | 'labels';

/** Payload of an inline attempt weight edit coming from the contest table. */
export interface AttemptWeightChangePayload {
  registrationId: string;
  liftType: LiftKind;
  attemptNumber: number;
  attemptId?: string;
  weight: number;
}

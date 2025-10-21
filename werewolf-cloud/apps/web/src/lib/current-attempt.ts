import type { AttemptNumber, AttemptStatus, CurrentAttempt, CurrentAttemptBundle } from '$lib/types';

export function bundleToCurrentAttempt(bundle: CurrentAttemptBundle): CurrentAttempt {
  const { attempt, competitor, registration } = bundle;
  const competitionOrder = registration.competitionOrder ?? competitor.competitionOrder ?? null;
  return {
    id: attempt.id,
    registrationId: attempt.registrationId,
    competitorName: `${competitor.lastName} ${competitor.firstName}`.trim(),
    liftType: attempt.liftType,
    attemptNumber: attempt.attemptNumber as AttemptNumber,
   weight: attempt.weight,
   status: attempt.status as AttemptStatus,
   competitionOrder,
   updatedAt: attempt.updatedAt ?? null,
 };
}

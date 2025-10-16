import type {
  Attempt,
  AttemptNumber,
  CurrentAttempt,
  LiftType,
  Registration,
} from '$lib/types';

const LIFT_PRIORITY: Record<LiftType, number> = {
  Squat: 0,
  Bench: 1,
  Deadlift: 2,
};

const FLOAT_EPSILON = 1e-6;
const DEFAULT_PHASE: QueuePhase = { liftType: 'Squat', attemptNumber: 1 };

export interface QueuePhase {
  liftType: LiftType;
  attemptNumber: AttemptNumber;
}

export interface RisingBarQueueOptions {
  currentAttempt?: CurrentAttempt | null;
  registrations?: Registration[];
  limit?: number;
}

export interface RisingBarQueueResult {
  phase: QueuePhase;
  attempts: Attempt[];
}

export function buildRisingBarQueue(
  attempts: Attempt[],
  options: RisingBarQueueOptions = {}
): RisingBarQueueResult {
  const { currentAttempt = null, registrations = [], limit = 12 } = options;
  const registrationsMap = registrations.length
    ? new Map(registrations.map((entry) => [entry.id, entry]))
    : undefined;

  const pending = attempts.filter((attempt) => attempt.status === 'Pending');
  const weightedPending = pending.filter((attempt) => Number.isFinite(attempt.weight) && attempt.weight > 0);

  const phase = determinePhase(weightedPending.length > 0 ? weightedPending : pending, currentAttempt);

  const filtered = weightedPending.filter(
    (attempt) => attempt.liftType === phase.liftType && attempt.attemptNumber === phase.attemptNumber
  );

  const sorted = filtered.sort((a, b) => compareAttempts(a, b, registrationsMap));

  return {
    phase,
    attempts: sorted.slice(0, limit),
  };
}

function determinePhase(candidates: Attempt[], current: CurrentAttempt | null): QueuePhase {
  if (current) {
    return {
      liftType: current.liftType,
      attemptNumber: current.attemptNumber,
    };
  }

  if (candidates.length === 0) {
    return DEFAULT_PHASE;
  }

  let best = candidates[0];

  for (let index = 1; index < candidates.length; index += 1) {
    const attempt = candidates[index];
    if (isEarlierPhase(attempt, best)) {
      best = attempt;
    }
  }

  return {
    liftType: best.liftType,
    attemptNumber: best.attemptNumber,
  };
}

function isEarlierPhase(candidate: Attempt, reference: Attempt): boolean {
  const candidatePriority = LIFT_PRIORITY[candidate.liftType];
  const referencePriority = LIFT_PRIORITY[reference.liftType];

  if (candidatePriority !== referencePriority) {
    return candidatePriority < referencePriority;
  }

  return candidate.attemptNumber < reference.attemptNumber;
}

function compareAttempts(
  a: Attempt,
  b: Attempt,
  registrationsMap?: Map<string, Registration>
): number {
  const weightDiff = a.weight - b.weight;
  if (Math.abs(weightDiff) > FLOAT_EPSILON) {
    return weightDiff;
  }

  const orderA = resolveCompetitionOrder(a, registrationsMap);
  const orderB = resolveCompetitionOrder(b, registrationsMap);
  if (orderA !== orderB) {
    return orderA - orderB;
  }

  const nameA = resolveName(a, registrationsMap).toLowerCase();
  const nameB = resolveName(b, registrationsMap).toLowerCase();

  return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
}

function resolveCompetitionOrder(
  attempt: Attempt,
  registrationsMap?: Map<string, Registration>
): number {
  if (Number.isFinite(attempt.competitionOrder as number)) {
    return attempt.competitionOrder as number;
  }
  const registration = registrationsMap?.get(attempt.registrationId);
  if (Number.isFinite(registration?.competitionOrder)) {
    return registration!.competitionOrder as number;
  }
  return Number.POSITIVE_INFINITY;
}

function resolveName(attempt: Attempt, registrationsMap?: Map<string, Registration>): string {
  if (attempt.competitorName) {
    return attempt.competitorName;
  }
  const registration = registrationsMap?.get(attempt.registrationId);
  if (registration) {
    return `${registration.firstName} ${registration.lastName}`.trim();
  }
  return 'Unknown competitor';
}

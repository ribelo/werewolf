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

  const [firstCandidate, ...remainingCandidates] = candidates;
  if (!firstCandidate) {
    return DEFAULT_PHASE;
  }

  let best = firstCandidate;

  for (const attempt of remainingCandidates) {
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
  const attemptOrder = attempt.competitionOrder;
  if (typeof attemptOrder === 'number' && Number.isFinite(attemptOrder)) {
    return attemptOrder;
  }
  const registrationOrder = registrationsMap?.get(attempt.registrationId)?.competitionOrder;
  if (typeof registrationOrder === 'number' && Number.isFinite(registrationOrder)) {
    return registrationOrder;
  }
  return Number.POSITIVE_INFINITY;
}

function resolveName(attempt: Attempt, registrationsMap?: Map<string, Registration>): string {
  if (attempt.competitorName) {
    return attempt.competitorName;
  }
  const registration = registrationsMap?.get(attempt.registrationId);
  if (registration) {
    return `${registration.lastName} ${registration.firstName}`.trim();
  }
  return 'Unknown competitor';
}

export interface ScoreComputationContext {
  attempts: { status: 'Pending' | 'Successful' | 'Failed'; weight: number; liftType: 'Squat' | 'Bench' | 'Deadlift' }[];
  coefficients: {
    reshel?: number;
    mccullough?: number;
  };
}

export interface ScoreResult {
  bestSquat: number;
  bestBench: number;
  bestDeadlift: number;
  totalWeight: number;
  coefficientPoints: number;
  isDisqualified: boolean;
  disqualificationReason?: string;
}

export const computeResult = (context: ScoreComputationContext): ScoreResult => {
  // Get best successful attempts for each lift type
  const bestSquat = getBestLiftWeight(context.attempts, 'Squat');
  const bestBench = getBestLiftWeight(context.attempts, 'Bench');
  const bestDeadlift = getBestLiftWeight(context.attempts, 'Deadlift');

  // Calculate total weight
  const totalWeight = bestSquat + bestBench + bestDeadlift;

  // Apply coefficients (default to 1.0 if not provided)
  const reshel = context.coefficients.reshel ?? 1.0;
  const mccullough = context.coefficients.mccullough ?? 1.0;
  const coefficientPoints = totalWeight * reshel * mccullough;

  // Check for disqualification (e.g., if missing required lifts)
  const isDisqualified = checkDisqualification(bestSquat, bestBench, bestDeadlift);

  const result: ScoreResult = {
    bestSquat,
    bestBench,
    bestDeadlift,
    totalWeight,
    coefficientPoints,
    isDisqualified,
  };

  if (isDisqualified) {
    return {
      ...result,
      disqualificationReason: 'Missing required lifts',
    };
  }

  return result;
};

/**
 * Get the best (highest) successful weight for a specific lift type
 */
function getBestLiftWeight(
  attempts: ScoreComputationContext['attempts'],
  liftType: 'Squat' | 'Bench' | 'Deadlift'
): number {
  const successfulAttempts = attempts
    .filter(attempt => attempt.liftType === liftType && attempt.status === 'Successful')
    .map(attempt => attempt.weight);

  if (successfulAttempts.length === 0) {
    return 0;
  }

  return Math.max(...successfulAttempts);
}

/**
 * Check if the lifter should be disqualified based on their attempts
 */
function checkDisqualification(bestSquat: number, bestBench: number, bestDeadlift: number): boolean {
  // In powerlifting, typically need at least one successful attempt in each lift
  // This is a simplified check - can be expanded based on federation rules
  return bestSquat === 0 || bestBench === 0 || bestDeadlift === 0;
}

/**
 * Calculate ranking based on coefficient points and total weight
 */
export function calculateRanking(
  results: ScoreResult[],
  rankingType: 'open' | 'age' | 'weight' = 'open'
): Array<ScoreResult & { place: number }> {
  // Filter out disqualified lifters
  const eligibleResults = results.filter(result => !result.isDisqualified);

  // Sort by coefficient points (descending), then by total weight (descending)
  const sorted = [...eligibleResults].sort((a, b) => {
    if (a.coefficientPoints !== b.coefficientPoints) {
      return b.coefficientPoints - a.coefficientPoints;
    }
    return b.totalWeight - a.totalWeight;
  });

  // Assign places, handling ties
  return sorted.map((result, index) => ({
    ...result,
    place: index + 1,
  }));
}

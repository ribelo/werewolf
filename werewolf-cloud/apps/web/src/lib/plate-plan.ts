const FLOAT_EPSILON = 1e-6;
const LOAD_TOLERANCE = 0.01;

export type GenderValue = 'Male' | 'Female';

const DEFAULT_PLATE_SET = [
  { weight: 25, pairs: 4 },
  { weight: 20, pairs: 4 },
  { weight: 15, pairs: 4 },
  { weight: 10, pairs: 6 },
  { weight: 5, pairs: 6 },
  { weight: 2.5, pairs: 6 },
  { weight: 1.25, pairs: 4 },
  { weight: 0.5, pairs: 4 },
] as const;

const DEFAULT_BAR_WEIGHTS: Record<GenderValue, number> = {
  Male: 20,
  Female: 15,
};

type PlatePlanSummary = {
  exact: boolean;
  total: number;
  increment: number;
  barWeight: number;
};

type LoadCheckResult = {
  loadable: boolean;
  normalized: number;
  increment: number;
  barWeight: number;
  reason: 'unloadable' | 'below_bar' | null;
};

function computeIncrement(): number {
  const smallest = DEFAULT_PLATE_SET.reduce((acc, entry) => {
    if (entry.pairs <= 0) return acc;
    return acc === 0 || entry.weight < acc ? entry.weight : acc;
  }, 0);
  return smallest > 0 ? smallest * 2 : 2.5;
}

function buildDefaultPlatePlan(targetWeight: number, gender: GenderValue): PlatePlanSummary {
  const barWeight = DEFAULT_BAR_WEIGHTS[gender] ?? DEFAULT_BAR_WEIGHTS.Male;
  const weightToLoad = Math.max(0, targetWeight - barWeight);
  const increment = computeIncrement();

  let remainingPerSide = weightToLoad / 2;

  for (const plate of DEFAULT_PLATE_SET) {
    if (remainingPerSide <= FLOAT_EPSILON) {
      break;
    }

    const { weight, pairs } = plate;
    if (weight <= 0 || pairs <= 0) {
      continue;
    }

    if (weight - remainingPerSide > FLOAT_EPSILON) {
      continue;
    }

    const maxPairs = Math.floor(remainingPerSide / weight);
    const usablePairs = Math.min(maxPairs, pairs);

    if (usablePairs > 0) {
      remainingPerSide -= usablePairs * weight;
    }
  }

  const requiredPerSide = weightToLoad / 2;
  const actualSideLoad = Math.max(0, requiredPerSide - remainingPerSide);
  const total = barWeight + actualSideLoad * 2;

  return {
    exact: remainingPerSide <= FLOAT_EPSILON,
    total,
    increment,
    barWeight,
  };
}

export function evaluateAttemptWeight(weight: number, gender: GenderValue): LoadCheckResult {
  const barWeight = DEFAULT_BAR_WEIGHTS[gender] ?? DEFAULT_BAR_WEIGHTS.Male;
  const increment = computeIncrement();

  if (!Number.isFinite(weight) || weight <= 0) {
    return {
      loadable: false,
      normalized: barWeight,
      increment,
      barWeight,
      reason: 'below_bar',
    };
  }

  if (weight < barWeight - LOAD_TOLERANCE) {
    return {
      loadable: false,
      normalized: barWeight,
      increment,
      barWeight,
      reason: 'below_bar',
    };
  }

  const plan = buildDefaultPlatePlan(weight, gender);
  const normalized = Number(plan.total.toFixed(2));
  const loadable = plan.exact && Math.abs(plan.total - weight) <= LOAD_TOLERANCE;

  return {
    loadable,
    normalized,
    increment: plan.increment,
    barWeight: plan.barWeight,
    reason: loadable ? null : 'unloadable',
  };
}

export function normalizeAttemptWeight(weight: number, gender: GenderValue): number {
  const result = evaluateAttemptWeight(weight, gender);
  return Number(result.normalized.toFixed(2));
}

export function isAttemptWeightLoadable(weight: number, gender: GenderValue): boolean {
  return evaluateAttemptWeight(weight, gender).loadable;
}

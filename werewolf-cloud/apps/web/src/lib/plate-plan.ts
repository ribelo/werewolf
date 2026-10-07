import { solvePlatePlan } from '@werewolf/domain/services/plate-plan';
import type { PlateInventoryEntry } from '@werewolf/domain/services/plate-plan';

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

// POST /contests hard-codes 20 kg for men and 15 kg for women (migration 0005),
// so the wizard plans against the same bars.
const DEFAULT_BAR_WEIGHTS: Record<GenderValue, number> = {
  Male: 20,
  Female: 15,
};

export type PlatePlanOptions = {
  /** Weight of a single clamp/collar; omit to keep the clamp-less default. */
  clampWeightPerClamp?: number | null;
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

function defaultInventory(): PlateInventoryEntry[] {
  return DEFAULT_PLATE_SET.map((plate) => ({
    plateWeight: plate.weight,
    quantity: plate.pairs,
  }));
}

function buildDefaultPlatePlan(
  targetWeight: number,
  gender: GenderValue,
  options?: PlatePlanOptions,
): PlatePlanSummary {
  const barWeight = DEFAULT_BAR_WEIGHTS[gender] ?? DEFAULT_BAR_WEIGHTS.Male;
  const plan = solvePlatePlan({
    targetWeight,
    barWeight,
    clampWeightPerClamp: options?.clampWeightPerClamp ?? 0,
    plates: defaultInventory(),
  });

  return {
    exact: plan.exact,
    total: plan.total,
    increment: plan.increment,
    barWeight: plan.barWeight,
  };
}

export function evaluateAttemptWeight(
  weight: number,
  gender: GenderValue,
  options?: PlatePlanOptions,
): LoadCheckResult {
  const barWeight = DEFAULT_BAR_WEIGHTS[gender] ?? DEFAULT_BAR_WEIGHTS.Male;
  const clampWeightPerClamp = Math.max(0, options?.clampWeightPerClamp ?? 0);
  const plan = buildDefaultPlatePlan(weight, gender, options);
  // The lightest weight the solver can assemble is the bar plus both clamps, so
  // callers can suggest it without re-adding the clamp weight themselves.
  const minimumWeight = Number((barWeight + clampWeightPerClamp * 2).toFixed(2));

  if (!Number.isFinite(weight) || weight <= 0 || weight < barWeight - LOAD_TOLERANCE) {
    return {
      loadable: false,
      normalized: minimumWeight,
      increment: plan.increment,
      barWeight,
      reason: 'below_bar',
    };
  }

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

export function normalizeAttemptWeight(
  weight: number,
  gender: GenderValue,
  options?: PlatePlanOptions,
): number {
  const result = evaluateAttemptWeight(weight, gender, options);
  return Number(result.normalized.toFixed(2));
}

export function isAttemptWeightLoadable(
  weight: number,
  gender: GenderValue,
  options?: PlatePlanOptions,
): boolean {
  return evaluateAttemptWeight(weight, gender, options).loadable;
}

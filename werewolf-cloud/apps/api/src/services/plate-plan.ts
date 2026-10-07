import type { Database } from '../utils/database';
import { executeQuery, executeQueryOne } from '../utils/database';
import { solvePlatePlan } from '@werewolf/domain/services/plate-plan';
import type { PlateInventoryEntry } from '@werewolf/domain/services/plate-plan';

type PlateDbRow = {
  plate_weight: number;
  quantity: number;
  color?: string | null;
};

type ContestBarWeightsRow = {
  mens_bar_weight?: number | null;
  womens_bar_weight?: number | null;
  clamp_weight?: number | null;
};

export type PlatePlanEntry = {
  plateWeight: number;
  count: number;
  color: string;
};

export type PlatePlan = {
  plates: PlatePlanEntry[];
  exact: boolean;
  total: number;
  increment: number;
  targetWeight: number;
  barWeight: number;
  weightToLoad: number;
  clampWeight: number;
  clampWeightPerClamp: number;
};

const DEFAULT_MENS_BAR_WEIGHT = 20;
const DEFAULT_WOMENS_BAR_WEIGHT = 15;
const DEFAULT_CLAMP_WEIGHT_PER_CLAMP = 2.5;

function deriveBarWeight(row: ContestBarWeightsRow | null, gender?: string, override?: number | null): number {
  if (override !== undefined && override !== null && !Number.isNaN(override)) {
    return override;
  }

  const mens = row?.mens_bar_weight ?? DEFAULT_MENS_BAR_WEIGHT;
  const womens = row?.womens_bar_weight ?? DEFAULT_WOMENS_BAR_WEIGHT;

  if (gender && gender.toLowerCase() === 'female') {
    return womens ?? DEFAULT_WOMENS_BAR_WEIGHT;
  }

  return mens ?? DEFAULT_MENS_BAR_WEIGHT;
}

export async function buildPlatePlan(
  db: Database,
  contestId: string,
  targetWeight: number,
  options?: { gender?: string | null; barWeightOverride?: number | null }
): Promise<PlatePlan> {
  const barWeightsRow = await executeQueryOne<ContestBarWeightsRow>(
    db,
    'SELECT mens_bar_weight, womens_bar_weight, clamp_weight FROM contests WHERE id = ?',
    [contestId]
  );

  const barWeight = deriveBarWeight(barWeightsRow, options?.gender ?? undefined, options?.barWeightOverride ?? undefined);
  const clampWeightPerClamp = barWeightsRow?.clamp_weight ?? DEFAULT_CLAMP_WEIGHT_PER_CLAMP;

  const plateRows = await executeQuery<PlateDbRow>(
    db,
    'SELECT plate_weight, quantity, color FROM plate_sets WHERE contest_id = ?',
    [contestId]
  );

  const inventory: PlateInventoryEntry[] = plateRows.map((plate) => ({
    plateWeight: plate.plate_weight,
    quantity: plate.quantity,
    color: plate.color ?? null,
  }));

  const plan = solvePlatePlan({
    targetWeight,
    barWeight,
    clampWeightPerClamp,
    plates: inventory,
  });

  return {
    plates: plan.plates,
    exact: plan.exact,
    total: plan.total,
    increment: plan.increment,
    targetWeight: plan.targetWeight,
    barWeight: plan.barWeight,
    weightToLoad: plan.weightToLoad,
    clampWeight: plan.clampWeight,
    clampWeightPerClamp: plan.clampWeightPerClamp,
  };
}

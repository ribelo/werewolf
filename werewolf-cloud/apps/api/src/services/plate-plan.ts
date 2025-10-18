import type { Database } from '../utils/database';
import { executeQuery, executeQueryOne } from '../utils/database';

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
const EPSILON = 1e-6;

function getDefaultPlateColor(weight: number): string {
  switch (weight) {
    case 25:
    case 2.5:
      return '#DC2626';
    case 20:
    case 2:
      return '#2563EB';
    case 15:
    case 1.5:
      return '#EAB308';
    case 10:
    case 1.25:
    case 1:
      return '#16A34A';
    case 5:
      return '#F8FAFC';
    case 0.5:
      return '#6B7280';
    default:
      return '#374151';
  }
}

function normaliseColor(weight: number, color?: string | null): string {
  if (color && color.trim().length > 0) {
    return color;
  }
  return getDefaultPlateColor(weight);
}

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
  const clampWeightPerClamp = barWeightsRow?.clamp_weight ?? 2.5;
  const clampWeightTotal = clampWeightPerClamp * 2;
  const baseAssemblyWeight = barWeight + clampWeightTotal;
  const weightToLoad = Math.max(0, targetWeight - baseAssemblyWeight);

  const availablePlates = await executeQuery<PlateDbRow>(
    db,
    `
      SELECT plate_weight, quantity, color
      FROM plate_sets
      WHERE contest_id = ? AND quantity > 0
      ORDER BY plate_weight DESC
    `,
    [contestId]
  );

  const smallestPlate = availablePlates
    .filter((plate) => plate.quantity > 0 && plate.plate_weight > 0)
    .map((plate) => plate.plate_weight)
    .reduce((min, weight) => (min === 0 || weight < min ? weight : min), 0);

  const increment = smallestPlate > 0 ? smallestPlate * 2 : 2.5;

  if (weightToLoad <= EPSILON || availablePlates.length === 0) {
    return {
      plates: [],
      exact: weightToLoad <= EPSILON,
      total: baseAssemblyWeight,
      increment,
      targetWeight,
      barWeight,
      clampWeight: clampWeightTotal,
      clampWeightPerClamp,
      weightToLoad,
    };
  }

  const plates: PlatePlanEntry[] = [];
  let remainingPerSide = weightToLoad / 2;

  for (const plate of availablePlates) {
    if (remainingPerSide <= EPSILON) {
      break;
    }

    const plateWeight = plate.plate_weight;
    if (plateWeight <= 0) {
      continue;
    }

    if (plateWeight - remainingPerSide > EPSILON) {
      continue;
    }

    const maxPairs = Math.floor(remainingPerSide / plateWeight);
    const usable = Math.min(maxPairs, plate.quantity);

    if (usable > 0) {
      plates.push({
        plateWeight,
        count: usable,
        color: normaliseColor(plateWeight, plate.color),
      });
      remainingPerSide -= plateWeight * usable;
    }
  }

  const actualSideLoad = Math.max(0, weightToLoad / 2 - remainingPerSide);
  const actualTotal = baseAssemblyWeight + actualSideLoad * 2;

  return {
    plates,
    exact: remainingPerSide <= EPSILON,
    total: actualTotal,
    increment,
    targetWeight,
    barWeight,
    clampWeight: clampWeightTotal,
    clampWeightPerClamp,
    weightToLoad,
  };
}

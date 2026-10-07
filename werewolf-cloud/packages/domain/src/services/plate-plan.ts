/**
 * Bounded-inventory plate solver shared by the API worker and the web client.
 *
 * A greedy pass that always starts from the heaviest plate that fits rejects
 * weights that are in fact loadable: with 1.25 kg and enough 0.5 kg plates,
 * 1.5 kg per side picks 1.25 kg and stops. The inventory is small, so the
 * solver enumerates per-side plate counts exactly and then selects a solution:
 *
 * 1. the heaviest total load that does not exceed the target (an exact plan wins),
 * 2. the fewest plates per side,
 * 3. the heaviest plates first (lexicographic on descending plate weights),
 *
 * which keeps the previous plans for ordinary targets while accepting every
 * loadable weight. Weights are resolved to grams (1e-3 kg) so the search
 * compares integers instead of floats.
 */

const EPSILON = 1e-6;
const UNITS_PER_KILOGRAM = 1000;
const FALLBACK_INCREMENT = 2.5;

export type PlateInventoryEntry = {
  /** Plate weight in kilograms. */
  plateWeight: number;
  /** Plates available for one side of the bar. */
  quantity: number;
  /** Optional hex colour; the default colour for the weight is used when empty. */
  color?: string | null;
};

export type PlatePlanPlate = {
  plateWeight: number;
  /** Plates to load on each side of the bar. */
  count: number;
  color: string;
};

export type PlatePlanRequest = {
  targetWeight: number;
  barWeight: number;
  /** Weight of a single clamp/collar; two of them are loaded, one per side. */
  clampWeightPerClamp?: number | null;
  /** Inventory available for one side of the bar. */
  plates: readonly PlateInventoryEntry[];
};

export type PlatePlanSolution = {
  /** Loaded plates, heaviest first. Empty when nothing fits or nothing is needed. */
  plates: PlatePlanPlate[];
  total: number;
  exact: boolean;
  increment: number;
  targetWeight: number;
  barWeight: number;
  weightToLoad: number;
  /** Combined weight of both clamps. */
  clampWeight: number;
  clampWeightPerClamp: number;
};

export function defaultPlateColor(plateWeight: number): string {
  switch (plateWeight) {
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

function resolveColor(plateWeight: number, color?: string | null): string {
  if (color && color.trim().length > 0) {
    return color;
  }
  return defaultPlateColor(plateWeight);
}

/** Kilograms to whole grams, truncating so a solution can never overshoot the target. */
function toUnits(kilograms: number): number {
  if (!Number.isFinite(kilograms) || kilograms <= 0) {
    return 0;
  }
  return Math.floor(kilograms * UNITS_PER_KILOGRAM + EPSILON);
}

function fromUnits(units: number): number {
  return units / UNITS_PER_KILOGRAM;
}

type SolverItem = {
  plateWeight: number;
  units: number;
  quantity: number;
  color: string;
};

type SideSelection = {
  /** Plates per side for each solver item, aligned with the item list. */
  counts: number[];
  plateCount: number;
  units: number;
};

function collectItems(plates: readonly PlateInventoryEntry[]): SolverItem[] {
  return plates
    .filter((plate) => plate.plateWeight > 0 && plate.quantity > 0)
    .map((plate) => ({
      plateWeight: plate.plateWeight,
      units: toUnits(plate.plateWeight),
      quantity: Math.floor(plate.quantity),
      color: resolveColor(plate.plateWeight, plate.color),
    }))
    .filter((item) => item.units > 0)
    .sort((left, right) => right.units - left.units);
}

function resolveIncrement(items: readonly SolverItem[]): number {
  const smallest = items.reduce((min, item) => (min === 0 || item.plateWeight < min ? item.plateWeight : min), 0);
  return smallest > 0 ? smallest * 2 : FALLBACK_INCREMENT;
}

/** Fewer plates wins; among equally short plans the heavier plates come first. */
function preferredSelection(candidate: SideSelection, current: SideSelection): boolean {
  if (candidate.plateCount !== current.plateCount) {
    return candidate.plateCount < current.plateCount;
  }

  for (let index = 0; index < candidate.counts.length; index += 1) {
    const candidateCount = candidate.counts[index] ?? 0;
    const currentCount = current.counts[index] ?? 0;
    if (candidateCount !== currentCount) {
      return candidateCount > currentCount;
    }
  }

  return false;
}

function selectSidePlates(items: readonly SolverItem[], targetUnits: number): SideSelection {
  const empty: SideSelection = {
    counts: items.map(() => 0),
    plateCount: 0,
    units: 0,
  };

  if (items.length === 0 || targetUnits <= 0) {
    return empty;
  }

  // Best selection per achievable side load; only the best candidate for a load
  // has to survive, because the remaining (lighter) items extend it identically.
  let selections = new Map<number, SideSelection>([[0, empty]]);

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (!item) {
      continue;
    }

    // Candidates land in a copy so a plate weight is never stacked onto itself.
    const next = new Map(selections);

    for (const selection of selections.values()) {
      const maxCount = Math.min(item.quantity, Math.floor((targetUnits - selection.units) / item.units));

      for (let count = 1; count <= maxCount; count += 1) {
        const units = selection.units + count * item.units;
        const counts = selection.counts.slice();
        counts[index] = count;
        const candidate: SideSelection = {
          counts,
          plateCount: selection.plateCount + count,
          units,
        };
        const current = next.get(units);
        if (!current || preferredSelection(candidate, current)) {
          next.set(units, candidate);
        }
      }
    }

    selections = next;
  }

  let best = empty;
  for (const selection of selections.values()) {
    if (
      selection.units > best.units ||
      (selection.units === best.units && preferredSelection(selection, best))
    ) {
      best = selection;
    }
  }

  return best;
}

export function solvePlatePlan(request: PlatePlanRequest): PlatePlanSolution {
  const barWeight = Math.max(0, request.barWeight);
  const clampWeightPerClamp = Math.max(0, request.clampWeightPerClamp ?? 0);
  const barUnits = toUnits(barWeight);
  const clampUnits = toUnits(clampWeightPerClamp);
  const baseUnits = barUnits + clampUnits * 2;
  const targetUnits = toUnits(request.targetWeight);
  const items = collectItems(request.plates);

  const build = (plates: PlatePlanPlate[], totalUnits: number): PlatePlanSolution => ({
    plates,
    exact: totalUnits === targetUnits,
    total: fromUnits(totalUnits),
    increment: resolveIncrement(items),
    targetWeight: request.targetWeight,
    barWeight,
    weightToLoad: Math.max(0, request.targetWeight - fromUnits(baseUnits)),
    clampWeight: fromUnits(clampUnits * 2),
    clampWeightPerClamp,
  });

  if (targetUnits <= baseUnits) {
    return build([], baseUnits);
  }

  const sideTargetUnits = Math.floor((targetUnits - baseUnits) / 2);
  const selection = selectSidePlates(items, sideTargetUnits);
  const plates = items
    .map((item, index) => ({ item, count: selection.counts[index] ?? 0 }))
    .filter(({ count }) => count > 0)
    .map(({ item, count }) => ({
      plateWeight: item.plateWeight,
      count,
      color: item.color,
    }));

  return build(plates, baseUnits + selection.units * 2);
}

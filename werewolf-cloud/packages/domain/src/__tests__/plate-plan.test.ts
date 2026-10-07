import { describe, it, expect } from 'vitest';
import { defaultPlateColor, solvePlatePlan } from '../services/plate-plan';
import type { PlateInventoryEntry, PlatePlanSolution } from '../services/plate-plan';

const FULL_HOME_SET: PlateInventoryEntry[] = [
  { plateWeight: 25, quantity: 4 },
  { plateWeight: 20, quantity: 4 },
  { plateWeight: 15, quantity: 4 },
  { plateWeight: 10, quantity: 6 },
  { plateWeight: 5, quantity: 6 },
  { plateWeight: 2.5, quantity: 6 },
  { plateWeight: 1.25, quantity: 4 },
  { plateWeight: 0.5, quantity: 4 },
];

function sideLoad(plan: PlatePlanSolution): number {
  return (plan.total - plan.barWeight - plan.clampWeight) / 2;
}

function bruteForceMaxSideLoad(plates: readonly PlateInventoryEntry[], sideTarget: number): number {
  const targetUnits = Math.floor(sideTarget * 1000 + 1e-6);
  let best = 0;
  const total = plates.length;

  const visit = (index: number, loadUnits: number): void => {
    if (index === total) {
      if (loadUnits <= targetUnits && loadUnits > best) {
        best = loadUnits;
      }
      return;
    }

    const plate = plates[index];
    if (!plate) {
      return;
    }

    const plateUnits = Math.round(plate.plateWeight * 1000);
    const quantity = Math.floor(plate.quantity);
    for (let count = 0; count <= quantity; count += 1) {
      const next = loadUnits + count * plateUnits;
      if (next > targetUnits) {
        break;
      }
      visit(index + 1, next);
    }
  };

  visit(0, 0);
  return best / 1000;
}

function createRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

describe('solvePlatePlan', () => {
  it('loads 1.5 kg per side instead of stopping on a single 1.25 kg plate', () => {
    const plan = solvePlatePlan({
      targetWeight: 23,
      barWeight: 20,
      plates: [
        { plateWeight: 1.25, quantity: 4 },
        { plateWeight: 0.5, quantity: 4 },
      ],
    });

    expect(plan.exact).toBe(true);
    expect(plan.total).toBeCloseTo(23, 6);
    expect(plan.plates).toEqual([{ plateWeight: 0.5, count: 3, color: '#6B7280' }]);
  });

  it('loads 28 kg with three 0.5 kg plates per side and 2.5 kg clamps', () => {
    const plan = solvePlatePlan({
      targetWeight: 28,
      barWeight: 20,
      clampWeightPerClamp: 2.5,
      plates: [{ plateWeight: 0.5, quantity: 3 }],
    });

    expect(plan.exact).toBe(true);
    expect(plan.total).toBeCloseTo(28, 6);
    expect(plan.weightToLoad).toBeCloseTo(3, 6);
    expect(plan.clampWeight).toBeCloseTo(5, 6);
    expect(plan.plates).toEqual([{ plateWeight: 0.5, count: 3, color: '#6B7280' }]);
  });

  it('reports a target below the assembled bar as inexact', () => {
    const plan = solvePlatePlan({
      targetWeight: 22,
      barWeight: 20,
      clampWeightPerClamp: 2.5,
      plates: [{ plateWeight: 0.5, quantity: 4 }],
    });

    expect(plan.exact).toBe(false);
    expect(plan.total).toBeCloseTo(25, 6);
    expect(plan.plates).toEqual([]);
    expect(plan.weightToLoad).toBe(0);
  });

  it('treats the bar plus clamps as an exact empty plan', () => {
    const plan = solvePlatePlan({
      targetWeight: 25,
      barWeight: 20,
      clampWeightPerClamp: 2.5,
      plates: [{ plateWeight: 0.5, quantity: 4 }],
    });

    expect(plan.exact).toBe(true);
    expect(plan.total).toBeCloseTo(25, 6);
    expect(plan.plates).toEqual([]);
  });

  it('keeps the previous plan for ordinary targets', () => {
    const plan = solvePlatePlan({ targetWeight: 140, barWeight: 20, clampWeightPerClamp: 2.5, plates: FULL_HOME_SET });

    expect(plan.exact).toBe(true);
    expect(plan.total).toBeCloseTo(140, 6);
    expect(plan.plates).toEqual([
      { plateWeight: 25, count: 2, color: '#DC2626' },
      { plateWeight: 5, count: 1, color: '#F8FAFC' },
      { plateWeight: 2.5, count: 1, color: '#DC2626' },
    ]);
  });

  it('prefers fewer plates when the same load is achievable in different ways', () => {
    const plan = solvePlatePlan({ targetWeight: 25, barWeight: 20, plates: FULL_HOME_SET });

    expect(plan.exact).toBe(true);
    expect(plan.plates).toEqual([{ plateWeight: 2.5, count: 1, color: '#DC2626' }]);
  });

  it('prefers the heavier plates when two plans use the same number of plates', () => {
    const plan = solvePlatePlan({
      targetWeight: 8,
      barWeight: 0,
      plates: [
        { plateWeight: 3, quantity: 1 },
        { plateWeight: 2, quantity: 2 },
        { plateWeight: 1, quantity: 2 },
      ],
    });

    expect(plan.exact).toBe(true);
    expect(plan.total).toBeCloseTo(8, 6);
    expect(plan.plates).toEqual([
      { plateWeight: 3, count: 1, color: '#374151' },
      { plateWeight: 1, count: 1, color: '#16A34A' },
    ]);
  });

  it('never uses more plates than the inventory holds', () => {
    const plan = solvePlatePlan({
      targetWeight: 28.5,
      barWeight: 20,
      plates: [
        { plateWeight: 2.5, quantity: 1 },
        { plateWeight: 1.25, quantity: 1 },
        { plateWeight: 0.5, quantity: 2 },
      ],
    });

    expect(plan.exact).toBe(true);
    expect(plan.total).toBeCloseTo(28.5, 6);
    expect(plan.plates).toEqual([
      { plateWeight: 2.5, count: 1, color: '#DC2626' },
      { plateWeight: 1.25, count: 1, color: '#16A34A' },
      { plateWeight: 0.5, count: 1, color: '#6B7280' },
    ]);
  });

  it('returns the best achievable load when no exact plan exists', () => {
    const plan = solvePlatePlan({
      targetWeight: 28,
      barWeight: 20,
      clampWeightPerClamp: 2.5,
      plates: [{ plateWeight: 0.5, quantity: 2 }],
    });

    expect(plan.exact).toBe(false);
    expect(plan.total).toBeCloseTo(27, 6);
    expect(plan.plates).toEqual([{ plateWeight: 0.5, count: 2, color: '#6B7280' }]);
  });

  it('returns no plates when the inventory is empty', () => {
    const plan = solvePlatePlan({ targetWeight: 100, barWeight: 20, clampWeightPerClamp: 2.5, plates: [] });

    expect(plan.exact).toBe(false);
    expect(plan.total).toBeCloseTo(25, 6);
    expect(plan.plates).toEqual([]);
    expect(plan.increment).toBeCloseTo(2.5, 6);
  });

  it('derives the increment from the smallest available plate', () => {
    const plan = solvePlatePlan({
      targetWeight: 100,
      barWeight: 20,
      plates: [
        { plateWeight: 25, quantity: 8 },
        { plateWeight: 1.25, quantity: 2 },
      ],
    });

    expect(plan.increment).toBeCloseTo(2.5, 6);
  });

  it('keeps custom plate colours and fills in the defaults', () => {
    const plan = solvePlatePlan({
      targetWeight: 51,
      barWeight: 0,
      plates: [
        { plateWeight: 25, quantity: 4, color: '#111111' },
        { plateWeight: 0.5, quantity: 4, color: '  ' },
      ],
    });

    expect(plan.exact).toBe(true);
    expect(plan.plates).toEqual([
      { plateWeight: 25, count: 1, color: '#111111' },
      { plateWeight: 0.5, count: 1, color: '#6B7280' },
    ]);
  });

  it('maps the default plate colours', () => {
    expect(defaultPlateColor(25)).toBe('#DC2626');
    expect(defaultPlateColor(20)).toBe('#2563EB');
    expect(defaultPlateColor(15)).toBe('#EAB308');
    expect(defaultPlateColor(10)).toBe('#16A34A');
    expect(defaultPlateColor(5)).toBe('#F8FAFC');
    expect(defaultPlateColor(0.5)).toBe('#6B7280');
    expect(defaultPlateColor(7.5)).toBe('#374151');
  });

  it('never exceeds the target or the inventory for random inputs', () => {
    const random = createRandom(20260320);
    const pond = [0.5, 1, 1.25, 2, 2.5, 5, 10, 20, 25];
    const barWeight = 20;
    const clampWeightPerClamp = 2.5;
    const baseWeight = barWeight + clampWeightPerClamp * 2;

    for (let iteration = 0; iteration < 300; iteration += 1) {
      const plates: PlateInventoryEntry[] = pond
        .filter(() => random() < 0.45)
        .map((plateWeight) => ({ plateWeight, quantity: Math.floor(random() * 4) }));
      const targetWeight = Math.round((baseWeight + random() * 120) * 4) / 4;
      const plan = solvePlatePlan({ targetWeight, barWeight, clampWeightPerClamp, plates });

      for (const plate of plan.plates) {
        const inventory = plates.find((entry) => entry.plateWeight === plate.plateWeight);
        expect(inventory).toBeDefined();
        expect(plate.count).toBeGreaterThan(0);
        expect(plate.count).toBeLessThanOrEqual(inventory?.quantity ?? 0);
      }

      expect(plan.total).toBeLessThanOrEqual(targetWeight + 1e-9);

      const loaded = plan.plates.reduce((sum, plate) => sum + plate.count * plate.plateWeight, 0) * 2;
      expect(plan.total).toBeCloseTo(baseWeight + loaded, 6);
      expect(plan.exact).toBe(Math.abs(plan.total - targetWeight) < 1e-9);
    }
  });

  it('matches a brute force search for the best achievable load', () => {
    const random = createRandom(777001);
    const pond = [0.5, 1, 1.25, 2, 2.5, 5];
    const barWeight = 20;
    const clampWeightPerClamp = 2.5;
    const baseWeight = barWeight + clampWeightPerClamp * 2;

    for (let iteration = 0; iteration < 200; iteration += 1) {
      const plates: PlateInventoryEntry[] = pond.map((plateWeight) => ({
        plateWeight,
        quantity: Math.floor(random() * 3),
      }));
      const weightToLoad = Math.round(random() * 60 * 4) / 4;
      const targetWeight = baseWeight + weightToLoad;
      const plan = solvePlatePlan({ targetWeight, barWeight, clampWeightPerClamp, plates });

      const expected = bruteForceMaxSideLoad(plates, weightToLoad / 2);
      expect(sideLoad(plan)).toBeCloseTo(expected, 6);
      expect(plan.exact).toBe(Math.abs(weightToLoad / 2 - expected) < 1e-9);
    }
  });
});

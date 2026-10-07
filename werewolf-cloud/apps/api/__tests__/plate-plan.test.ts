import { describe, it, expect } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';
import { buildPlatePlan } from '../src/services/plate-plan';

type StubRow = Record<string, unknown>;

function createStubDatabase(contest: StubRow | null, plates: StubRow[]): D1Database {
  const prepare = (sql: string) => ({
    bind: (..._params: unknown[]) => ({
      first: async () => (sql.includes('FROM contests') ? contest : null),
      all: async () => ({
        results: sql.includes('FROM plate_sets') ? plates : [],
        success: true,
        meta: {},
      }),
      run: async () => ({ success: true, meta: { changes: 1 } }),
    }),
  });

  return { prepare } as unknown as D1Database;
}

const DEFAULT_CONTEST: StubRow = {
  mens_bar_weight: 20,
  womens_bar_weight: 15,
  clamp_weight: 2.5,
};

describe('buildPlatePlan', () => {
  it('loads 28 kg with three 0.5 kg plates per side and the default 2.5 kg clamps', async () => {
    const db = createStubDatabase(DEFAULT_CONTEST, [{ plate_weight: 0.5, quantity: 3, color: null }]);

    const plan = await buildPlatePlan(db, 'contest-1', 28);

    expect(plan.exact).toBe(true);
    expect(plan.total).toBeCloseTo(28, 6);
    expect(plan.weightToLoad).toBeCloseTo(3, 6);
    expect(plan.clampWeight).toBeCloseTo(5, 6);
    expect(plan.clampWeightPerClamp).toBeCloseTo(2.5, 6);
    expect(plan.increment).toBeCloseTo(1, 6);
    expect(plan.plates).toEqual([{ plateWeight: 0.5, count: 3, color: '#6B7280' }]);
  });

  it('does not report a target below the assembled bar as exact', async () => {
    const db = createStubDatabase(DEFAULT_CONTEST, [{ plate_weight: 0.5, quantity: 4, color: null }]);

    const plan = await buildPlatePlan(db, 'contest-1', 22);

    expect(plan.exact).toBe(false);
    expect(plan.total).toBeCloseTo(25, 6);
    expect(plan.weightToLoad).toBe(0);
    expect(plan.plates).toEqual([]);
  });

  it('treats the assembled bar weight as an exact empty plan', async () => {
    const db = createStubDatabase(DEFAULT_CONTEST, [{ plate_weight: 0.5, quantity: 4, color: null }]);

    const plan = await buildPlatePlan(db, 'contest-1', 25);

    expect(plan.exact).toBe(true);
    expect(plan.total).toBeCloseTo(25, 6);
    expect(plan.plates).toEqual([]);
  });

  it('returns the best achievable load when the inventory is too small', async () => {
    const db = createStubDatabase(DEFAULT_CONTEST, [{ plate_weight: 0.5, quantity: 2, color: null }]);

    const plan = await buildPlatePlan(db, 'contest-1', 28);

    expect(plan.exact).toBe(false);
    expect(plan.total).toBeCloseTo(27, 6);
    expect(plan.plates).toEqual([{ plateWeight: 0.5, count: 2, color: '#6B7280' }]);
  });

  it('uses the contest clamp weight and loads an exact total above it', async () => {
    const db = createStubDatabase({ ...DEFAULT_CONTEST, clamp_weight: 4 }, [
      { plate_weight: 25, quantity: 10, color: '#DC2626' },
      { plate_weight: 20, quantity: 10, color: '#2563EB' },
    ]);

    const plan = await buildPlatePlan(db, 'contest-1', 178);

    expect(plan.exact).toBe(true);
    expect(plan.total).toBeCloseTo(178, 6);
    expect(plan.clampWeight).toBeCloseTo(8, 6);
    expect(plan.clampWeightPerClamp).toBeCloseTo(4, 6);
    expect(plan.plates).toEqual([{ plateWeight: 25, count: 3, color: '#DC2626' }]);
  });

  it('derives the womens bar weight from the contest', async () => {
    const db = createStubDatabase(DEFAULT_CONTEST, [{ plate_weight: 20, quantity: 4, color: null }]);

    const plan = await buildPlatePlan(db, 'contest-1', 60, { gender: 'Female' });

    expect(plan.barWeight).toBeCloseTo(15, 6);
    expect(plan.exact).toBe(true);
    expect(plan.total).toBeCloseTo(60, 6);
  });

  it('honours a bar weight override', async () => {
    const db = createStubDatabase(DEFAULT_CONTEST, [{ plate_weight: 20, quantity: 4, color: null }]);

    const plan = await buildPlatePlan(db, 'contest-1', 60, { barWeightOverride: 15 });

    expect(plan.barWeight).toBeCloseTo(15, 6);
    expect(plan.total).toBeCloseTo(60, 6);
    expect(plan.plates).toEqual([{ plateWeight: 20, count: 1, color: '#2563EB' }]);
  });

  it('falls back to the default bar and clamp weights when the contest is missing', async () => {
    const db = createStubDatabase(null, [{ plate_weight: 25, quantity: 4, color: null }]);

    const plan = await buildPlatePlan(db, 'contest-1', 26);

    expect(plan.barWeight).toBeCloseTo(20, 6);
    expect(plan.clampWeightPerClamp).toBeCloseTo(2.5, 6);
    expect(plan.exact).toBe(false);
    expect(plan.total).toBeCloseTo(25, 6);
    expect(plan.plates).toEqual([]);
  });
});

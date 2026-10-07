import { afterEach, describe, expect, it } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';
import {
  getMcCulloughCoefficient,
  getReshelCoefficient,
  resetCoefficientCaches,
} from '../src/services/coefficients';

/** Minimal D1 stand-in: every table query returns no rows. */
function createEmptyDb(): D1Database {
  const statement = {
    all: async () => ({ success: false, results: [] }),
  };
  return { prepare: () => statement } as unknown as D1Database;
}

describe('api coefficient service', () => {
  afterEach(() => {
    resetCoefficientCaches();
  });

  it('falls back to the bundled reshel table when D1 is empty', async () => {
    await expect(getReshelCoefficient(createEmptyDb(), 'Male', 82.5)).resolves.toBeCloseTo(1.029, 3);
  });

  it('computes masters age from calendar fields, not the host timezone', async () => {
    // Regression: the local Date-based age calculation shifted a day west of UTC,
    // so 2025-03-01 gave age 64 (1.45) instead of 65 (1.48).
    await expect(getMcCulloughCoefficient(createEmptyDb(), '1960-03-01', '2025-03-01')).resolves.toBeCloseTo(1.48, 2);
  });

  it('uses the previous age before the birthday', async () => {
    await expect(getMcCulloughCoefficient(createEmptyDb(), '1960-03-02', '2025-03-01')).resolves.toBeCloseTo(1.45, 2);
    await expect(getMcCulloughCoefficient(createEmptyDb(), '1960-02-29', '2025-02-28')).resolves.toBeCloseTo(1.45, 2);
  });

  it('returns the base coefficient for malformed or impossible dates', async () => {
    await expect(getMcCulloughCoefficient(createEmptyDb(), 'not-a-date', '2025-03-01')).resolves.toBe(1.0);
    await expect(getMcCulloughCoefficient(createEmptyDb(), '1960-03-01', '2025-02-31')).resolves.toBe(1.0);
  });
});

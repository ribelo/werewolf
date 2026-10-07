import { describe, expect, it } from 'vitest';
import {
  calculateMcCulloughCoefficient,
  calculateReshelCoefficient,
  determineAgeCategory,
} from '../services/coefficients';

describe('calculateReshelCoefficient', () => {
  it('calculates coefficient for male lifter', () => {
    const coeff = calculateReshelCoefficient(82.5, 'Male');
    expect(coeff).toBeCloseTo(1.029, 3);
  });

  it('calculates coefficient for female lifter', () => {
    const coeff = calculateReshelCoefficient(63, 'Female');
    expect(coeff).toBeCloseTo(1.715, 3);
  });

  it('returns default coefficient for unknown gender', () => {
    const coeff = calculateReshelCoefficient(80, 'Unknown');
    expect(coeff).toBe(1.0);
  });
});

describe('calculateMcCulloughCoefficient', () => {
  it('returns base coefficient for lifters under 40', () => {
    const coeff = calculateMcCulloughCoefficient('2008-01-01', '2025-01-01');
    expect(coeff).toBe(1.0); // WUAP table covers 40+, younger lifters stay at 1.0
  });

  it('calculates senior coefficient', () => {
    const coeff = calculateMcCulloughCoefficient('1995-01-01', '2025-01-01');
    expect(coeff).toBe(1.0); // Senior
  });

  it('calculates veteran coefficient', () => {
    const coeff = calculateMcCulloughCoefficient('1960-01-01', '2025-01-01');
    expect(coeff).toBeCloseTo(1.48, 2); // Masters table entry for age 65
  });

  it('handles invalid dates gracefully', () => {
    const coeff = calculateMcCulloughCoefficient('invalid-date', '2025-01-01');
    expect(coeff).toBe(1.0); // Default
  });

  it('uses the birthday on the contest date, whatever the host timezone', () => {
    // Regression: parsing the date-only strings as UTC and reading local fields
    // turned 2025-03-01 into 2025-02-28 west of UTC and returned age 64.
    expect(calculateMcCulloughCoefficient('1960-03-01', '2025-03-01')).toBeCloseTo(1.48, 2);
    expect(calculateMcCulloughCoefficient('1960-03-02', '2025-03-01')).toBeCloseTo(1.45, 2);
  });

  it('handles leap-day birthdays', () => {
    expect(calculateMcCulloughCoefficient('1960-02-29', '2024-02-29')).toBeCloseTo(1.45, 2);
    expect(calculateMcCulloughCoefficient('1960-02-29', '2025-02-28')).toBeCloseTo(1.45, 2);
    expect(calculateMcCulloughCoefficient('1960-02-29', '2025-03-01')).toBeCloseTo(1.48, 2);
  });

  it('returns the base coefficient for impossible calendar dates', () => {
    expect(calculateMcCulloughCoefficient('1960-03-01', '2025-02-31')).toBe(1.0);
    expect(calculateMcCulloughCoefficient('1960-02-30', '2025-03-01')).toBe(1.0);
    expect(calculateMcCulloughCoefficient('prefix1960-03-01suffix', '2025-03-01')).toBe(1.0);
  });
});

describe('determineAgeCategory age boundaries', () => {
  it('assigns the category of the calendar age on the contest date', () => {
    expect(determineAgeCategory('2001-03-01', '2025-03-01')).toBe('SENIOR'); // turns 24 that day
    expect(determineAgeCategory('2001-03-02', '2025-03-01')).toBe('JUNIOR'); // still 23
    expect(determineAgeCategory('1965-03-01', '2025-03-01')).toBe('M60'); // turns 60 that day
    expect(determineAgeCategory('1965-03-02', '2025-03-01')).toBe('M50'); // still 59
  });

  it('falls back to the senior category for impossible birth dates', () => {
    expect(determineAgeCategory('1960-02-30', '2025-03-01')).toBe('SENIOR');
    expect(determineAgeCategory('prefix1960-03-01suffix', '2025-03-01')).toBe('SENIOR');
  });
});

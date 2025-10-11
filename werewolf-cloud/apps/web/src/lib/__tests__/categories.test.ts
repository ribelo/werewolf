import { describe, it, expect } from 'vitest';
import {
  createDefaultAgeCategories,
  createDefaultWeightClasses,
  validateCategories,
  formatCategoryIssues,
} from '$lib/categories';
import type { AgeCategory, WeightClass } from '$lib/types';

describe('contest category helpers', () => {
  it('creates default age and weight collections', () => {
    const ages = createDefaultAgeCategories();
    const weights = createDefaultWeightClasses();

    expect(ages.length).toBeGreaterThan(0);
    expect(weights.length).toBeGreaterThan(0);
    expect(ages[0]?.code).toBe('T16');
    expect(weights[0]?.gender).toBe('Female');
  });

  it('detects duplicate codes and invalid ranges', () => {
    const ages: AgeCategory[] = [
      { code: 'OPEN', name: 'Open', minAge: 24, maxAge: null, sortOrder: 10 },
      { code: 'OPEN', name: 'Duplicate', minAge: 26, maxAge: 25, sortOrder: 20 },
    ];

    const weights: WeightClass[] = [
      { code: 'M105', name: 'Men 105', gender: 'Male', minWeight: 90, maxWeight: 105, sortOrder: 10 },
      { code: 'M105', name: 'Duplicate', gender: 'Male', minWeight: 106, maxWeight: 100, sortOrder: 20 },
    ];

    const issues = validateCategories(ages, weights);
    expect(issues.length).toBeGreaterThanOrEqual(3);
    const messages = formatCategoryIssues(issues, (key, params) => `${key}:${JSON.stringify(params ?? {})}`);
    expect(messages.some((msg) => msg.includes('duplicate_code'))).toBe(true);
    expect(messages.some((msg) => msg.includes('invalid_range'))).toBe(true);
  });
});

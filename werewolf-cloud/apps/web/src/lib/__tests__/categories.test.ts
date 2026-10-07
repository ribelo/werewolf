import { describe, it, expect } from 'vitest';
import {
  buildCategoryPayload,
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
      { code: 'SENIOR', name: 'Senior (24-39)', minAge: 24, maxAge: 39, sortOrder: 10 },
      { code: 'SENIOR', name: 'Duplicate', minAge: 26, maxAge: 25, sortOrder: 20 },
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

  it('reports duplicate codes without a row index and keeps 1-based indices elsewhere', () => {
    const ages: AgeCategory[] = [
      { code: 'SENIOR', name: 'Senior', minAge: 24, maxAge: 39 },
      { code: 'senior', name: 'Senior duplicate', minAge: 30, maxAge: 25 },
    ];

    const weights: WeightClass[] = [
      { code: 'M105', name: 'Men 105', gender: 'Male', minWeight: 90, maxWeight: 105 },
      { code: 'M105', name: 'Men 105 duplicate', gender: 'Male', minWeight: 106, maxWeight: 100 },
      { code: 'X1', name: 'Unknown gender', gender: 'other', minWeight: 1, maxWeight: 2 },
    ];

    const issues = validateCategories(ages, weights);
    const duplicateAge = issues.find((issue) => issue.scope === 'age' && issue.code === 'duplicate_code');
    const duplicateWeight = issues.find(
      (issue) => issue.scope === 'weight' && issue.code === 'duplicate_code',
    );

    expect(duplicateAge).toEqual({ scope: 'age', code: 'duplicate_code', codeValue: 'SENIOR' });
    expect(duplicateWeight).toEqual({
      scope: 'weight',
      code: 'duplicate_code',
      codeValue: 'M105',
      gender: 'Male',
    });

    const messages = formatCategoryIssues(issues, (key, params) => `${key}:${JSON.stringify(params ?? {})}`);
    const ageInvalidRange = messages.find((msg) => msg.includes('age.invalid_range'));

    expect(ageInvalidRange).toContain('"index":2');
    expect(messages.some((msg) => msg.includes('weight.duplicate_code'))).toBe(true);
    expect(messages.some((msg) => msg.includes('weight.invalid_gender'))).toBe(true);
  });

  it('keeps category metadata when building the contest payload', () => {
    const ages: AgeCategory[] = [
      { code: 'senior', name: ' Senior ', minAge: 24, maxAge: 39, metadata: { note: 'keep' } },
      { code: 'junior', name: 'Junior', minAge: null, maxAge: null },
    ];

    const weights: WeightClass[] = [
      { code: 'm105', name: 'Men 105', gender: 'm', minWeight: 90, maxWeight: 105, metadata: { note: 'keep' } },
      { code: 'f57', name: 'Women 57', gender: 'female', minWeight: null, maxWeight: null, metadata: null },
    ];

    const payload = buildCategoryPayload(ages, weights);

    expect(payload.ageCategories[0]).toMatchObject({
      code: 'SENIOR',
      name: 'Senior',
      minAge: 24,
      maxAge: 39,
      metadata: { note: 'keep' },
    });
    expect(payload.ageCategories[1]?.metadata).toBeNull();
    expect(payload.weightClasses[0]).toMatchObject({
      code: 'M105',
      name: 'Men 105',
      gender: 'Male',
      metadata: { note: 'keep' },
    });
    expect(payload.weightClasses[1]).toMatchObject({
      code: 'F57',
      name: 'Women 57',
      gender: 'Female',
      metadata: null,
    });
  });
});

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CONTEST_AGE_CATEGORY_TEMPLATES,
  DEFAULT_CONTEST_WEIGHT_CLASS_TEMPLATES,
} from '../constants/categories';
import {
  determineAgeCategory,
  determineWeightClass,
  DEFAULT_AGE_CATEGORY_DESCRIPTORS,
  DEFAULT_WEIGHT_CLASS_DESCRIPTORS,
} from '../services/coefficients';

describe('contest category helpers', () => {
  it('maps defaults into age descriptors', () => {
    expect(DEFAULT_AGE_CATEGORY_DESCRIPTORS).toHaveLength(DEFAULT_CONTEST_AGE_CATEGORY_TEMPLATES.length);
    const openDescriptor = DEFAULT_AGE_CATEGORY_DESCRIPTORS.find((item) => item.code === 'OPEN');
    expect(openDescriptor).toMatchObject({ minAge: 24, maxAge: 39, sortOrder: 40 });
  });

  it('maps defaults into weight descriptors', () => {
    expect(DEFAULT_WEIGHT_CLASS_DESCRIPTORS).toHaveLength(DEFAULT_CONTEST_WEIGHT_CLASS_TEMPLATES.length);
    const female52 = DEFAULT_WEIGHT_CLASS_DESCRIPTORS.find((item) => item.code === 'F_52');
    expect(female52).toMatchObject({ gender: 'Female', maxWeight: 52 });
  });

  it('determines age category using contest descriptors', () => {
    const descriptors = DEFAULT_CONTEST_AGE_CATEGORY_TEMPLATES.map((template) => ({
      id: template.code,
      code: template.code,
      minAge: template.minAge,
      maxAge: template.maxAge,
      sortOrder: template.sortOrder,
    }));

    const code = determineAgeCategory('2008-04-15', '2025-09-21', descriptors);
    expect(code).toBe('T19');
  });

  it('determines weight class using contest descriptors', () => {
    const classes = DEFAULT_CONTEST_WEIGHT_CLASS_TEMPLATES.map((template) => ({
      id: template.code,
      code: template.code,
      gender: template.gender,
      minWeight: template.minWeight,
      maxWeight: template.maxWeight,
      sortOrder: template.sortOrder,
    }));

    const code = determineWeightClass(94.3, 'Male', classes);
    expect(code).toBe('M_95');
  });
});

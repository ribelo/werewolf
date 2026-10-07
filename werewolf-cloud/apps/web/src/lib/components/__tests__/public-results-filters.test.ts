import { describe, it, expect } from 'vitest';
import { buildPublicFilterOptions } from '../public-results-filters';
import type { AgeCategory, Registration, WeightClass } from '$lib/types';

function registration(overrides: Partial<Registration> = {}): Registration {
  return {
    id: 'reg-1',
    competitorId: 'comp-1',
    firstName: 'Jan',
    lastName: 'Kowalski',
    birthDate: '2000-01-01',
    gender: 'Male',
    weightClassId: 'wc-m-83',
    ageCategoryId: 'ac-senior',
    bodyweight: 83,
    lifts: ['Bench'],
    ...overrides,
  };
}

function weightClass(overrides: Partial<WeightClass> & { id: string }): WeightClass {
  return {
    code: overrides.id,
    name: overrides.id,
    gender: 'Male',
    minWeight: null,
    maxWeight: null,
    ...overrides,
  };
}

function ageCategory(overrides: Partial<AgeCategory> & { id: string }): AgeCategory {
  return {
    code: overrides.id,
    name: overrides.id,
    minAge: null,
    maxAge: null,
    ...overrides,
  };
}

const translate = (key: string) => `T:${key}`;

const weightClasses: WeightClass[] = [
  weightClass({ id: 'wc-m-93', name: '93 kg', gender: 'Male', sortOrder: 3 }),
  weightClass({ id: 'wc-f-57', name: '57 kg', gender: 'Female', sortOrder: 1 }),
  weightClass({ id: 'wc-m-83', name: '83 kg', gender: 'Male', sortOrder: 2 }),
];

const ageCategories: AgeCategory[] = [
  ageCategory({ id: 'ac-master', name: 'Master 1', sortOrder: 2 }),
  ageCategory({ id: 'ac-senior', name: 'Senior', sortOrder: 1 }),
];

describe('buildPublicFilterOptions', () => {
  it('splits weight classes by gender, ordered by sort order', () => {
    const options = buildPublicFilterOptions({
      weightClasses,
      ageCategories,
      registrations: [registration()],
      translate,
    });

    expect(options.weightGroups.female.map((option) => option.id)).toEqual(['wc-f-57']);
    expect(options.weightGroups.male.map((option) => option.id)).toEqual(['wc-m-83', 'wc-m-93']);
  });

  it('orders the weight dropdown as all, female, male', () => {
    const options = buildPublicFilterOptions({
      weightClasses,
      ageCategories,
      registrations: [registration()],
      translate,
    });

    expect(options.weight.map((option) => option.id)).toEqual([
      'ALL',
      'FEMALE_OPEN',
      'wc-f-57',
      'MALE_OPEN',
      'wc-m-83',
      'wc-m-93',
    ]);
    expect(options.weight[0]?.label).toBe(`T:${'contest_detail.registrations.filters.all'}`);
  });

  it('offers a gender without weight classes as soon as a registration has it', () => {
    const options = buildPublicFilterOptions({
      weightClasses: [],
      ageCategories: [],
      registrations: [registration({ gender: 'Female' })],
      translate,
    });

    expect(options.weight.map((option) => option.id)).toEqual(['ALL', 'FEMALE_OPEN']);
  });

  it('lists unassigned and translated senior age categories', () => {
    const options = buildPublicFilterOptions({
      weightClasses,
      ageCategories,
      registrations: [registration({ ageCategoryId: '' })],
      translate,
    });

    expect(options.age.map((option) => option.id)).toEqual(['ALL', 'UNASSIGNED', 'ac-senior', 'ac-master']);
    expect(options.age[2]?.label).toBe(`T:${'contest_detail.registrations.filters.age_senior'}`);
    expect(options.age[3]?.label).toBe('Master 1');
  });

  it('deduplicates labels case-insensitively and keeps unlabeled registrations', () => {
    const options = buildPublicFilterOptions({
      weightClasses,
      ageCategories,
      registrations: [
        registration({ id: 'reg-1', labels: ['Open', 'open '] }),
        registration({ id: 'reg-2', labels: [] }),
      ],
      translate,
    });

    expect(options.label.map((option) => option.id)).toEqual([
      'ALL',
      'UNLABELED',
      'LABEL:Open',
    ]);
    expect(options.label[2]?.label).toBe('Open');
  });
});

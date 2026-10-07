import { describe, expect, it } from 'vitest';
import { buildPublicFilterOptions } from '$lib/components/public-results-filters';
import {
  isFemaleGender,
  isMaleGender,
  LABEL_FILTER_PREFIX,
  type AgeFilter,
  type LabelFilter,
  type WeightFilter,
} from '$lib/filters/registrations';
import { normaliseAgeCategoryLabel } from '$lib/utils';
import type { AgeCategory, Registration, WeightClass } from '$lib/types';

type Option<Id extends string> = { id: Id; label: string };

function t(key: string): string {
  return key;
}

function registration(overrides: Partial<Registration> = {}): Registration {
  return {
    id: 'reg-1',
    competitorId: 'comp-1',
    firstName: 'Anna',
    lastName: 'Nowak',
    birthDate: '1995-01-01',
    gender: 'Female',
    weightClassId: 'wc-1',
    ageCategoryId: 'ac-1',
    bodyweight: 61,
    labels: [],
    lifts: ['Squat'],
    ...overrides,
  };
}

const weightClasses: WeightClass[] = [
  { id: 'wc-2', code: '93', name: 'Up to 93 kg', gender: 'Male', minWeight: 0, maxWeight: 93, sortOrder: 2 },
  { id: 'wc-1', code: '63', name: 'Up to 63 kg', gender: 'Female', minWeight: 0, maxWeight: 63, sortOrder: 1 },
  { id: 'wc-3', code: 'open', name: 'Open class', gender: 'Mixed', minWeight: null, maxWeight: null },
  { id: 'wc-1', code: '63', name: 'Up to 63 kg', gender: 'Female', minWeight: 0, maxWeight: 63, sortOrder: 1 },
];

const ageCategories: AgeCategory[] = [
  { id: 'ac-2', code: 'SR', name: 'Senior', minAge: 24, maxAge: 39, sortOrder: 2 },
  { id: 'ac-1', code: 'JR', name: 'Junior', minAge: 14, maxAge: 23, sortOrder: 1 },
  { id: 'ac-3', code: 'OP', name: 'Open', minAge: null, maxAge: null },
];

const registrations: Registration[] = [
  registration({ id: 'reg-1', labels: ['Open', 'open'] }),
  registration({ id: 'reg-2', gender: 'Male', ageCategoryId: '', weightClassId: null, labels: [] }),
  registration({ id: 'reg-3', gender: 'Male', labels: [' Masters '] }),
];

// Reference: the option construction ContestManagerView used before it was
// replaced with buildPublicFilterOptions.
function referenceWeightFilterGroups(classes: WeightClass[]) {
  const female: Option<WeightFilter>[] = [];
  const male: Option<WeightFilter>[] = [];
  const femaleSeen = new Set<string>();
  const maleSeen = new Set<string>();

  classes
    .slice()
    .sort((a, b) => {
      const orderA = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
      const orderB = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;
      const nameA = (a.name ?? a.code ?? '').toString();
      const nameB = (b.name ?? b.code ?? '').toString();
      return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
    })
    .forEach((entry) => {
      const id = (entry.id ?? entry.code ?? '').toString();
      const label = (entry.name ?? entry.code ?? '').toString();
      if (!id || !label) return;
      const gender = (entry.gender ?? '').toString().toLowerCase();
      if (gender.startsWith('f')) {
        if (femaleSeen.has(id)) return;
        femaleSeen.add(id);
        female.push({ id: id as WeightFilter, label });
      } else if (gender.startsWith('m')) {
        if (maleSeen.has(id)) return;
        maleSeen.add(id);
        male.push({ id: id as WeightFilter, label });
      }
    });

  return {
    femaleOpen: { id: 'FEMALE_OPEN' as WeightFilter, label: 'contest_detail.registrations.filters.open' },
    maleOpen: { id: 'MALE_OPEN' as WeightFilter, label: 'contest_detail.registrations.filters.open' },
    female,
    male,
  };
}

function referenceAgeFilters(categories: AgeCategory[], regs: Registration[]): Option<AgeFilter>[] {
  const entries: Option<AgeFilter>[] = [
    { id: 'ALL', label: 'contest_detail.registrations.filters.age_all' },
  ];
  if (regs.some((reg) => !reg.ageCategoryId)) {
    entries.push({ id: 'UNASSIGNED', label: 'contest_detail.registrations.filters.age_unassigned' });
  }
  const seen = new Set<string>();
  categories
    .slice()
    .sort((a, b) => {
      const orderA = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
      const orderB = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;
      const labelA = normaliseAgeCategoryLabel(a.name, a.code) || (a.code ?? '').toString();
      const labelB = normaliseAgeCategoryLabel(b.name, b.code) || (b.code ?? '').toString();
      return labelA.localeCompare(labelB, undefined, { sensitivity: 'base' });
    })
    .forEach((category) => {
      const id = (category.id ?? category.code ?? '').toString();
      let label = normaliseAgeCategoryLabel(category.name, category.code) || id;
      if (label.toLowerCase() === 'senior') {
        label = 'contest_detail.registrations.filters.age_senior';
      }
      if (!id || !label) return;
      if (seen.has(id)) return;
      seen.add(id);
      entries.push({ id: id as AgeFilter, label });
    });
  return entries;
}

function referenceLabelFilters(regs: Registration[]): Option<LabelFilter>[] {
  const base: Option<LabelFilter>[] = [
    { id: 'ALL', label: 'contest_detail.registrations.filters.labels_all' },
  ];
  let hasUnlabeled = false;
  const labelMap = new Map<string, string>();
  regs.forEach((reg) => {
    const labels = Array.isArray(reg.labels) ? reg.labels : [];
    if (labels.length === 0) {
      hasUnlabeled = true;
      return;
    }
    labels.forEach((label) => {
      const trimmed = (label ?? '').trim();
      if (!trimmed) return;
      const key = trimmed.toLowerCase();
      if (!labelMap.has(key)) labelMap.set(key, trimmed);
    });
  });
  if (hasUnlabeled) {
    base.push({ id: 'UNLABELED', label: 'contest_detail.registrations.filters.labels_unlabeled' });
  }
  Array.from(labelMap.values())
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    .forEach((label) => base.push({ id: `${LABEL_FILTER_PREFIX}${label}` as LabelFilter, label }));
  return base;
}

describe('buildPublicFilterOptions reuse on the contest desk', () => {
  const options = buildPublicFilterOptions({
    weightClasses,
    ageCategories,
    registrations,
    translate: t,
  });

  it('produces the same weight groups as the previous inline construction', () => {
    expect(options.weightGroups).toEqual(referenceWeightFilterGroups(weightClasses));
  });

  it('produces the same age options as the previous inline construction', () => {
    expect(options.age).toEqual(referenceAgeFilters(ageCategories, registrations));
  });

  it('produces the same label options as the previous inline construction', () => {
    expect(options.label).toEqual(referenceLabelFilters(registrations));
  });

  it('produces the same gender split and combined weight option lists', () => {
    const groups = options.weightGroups;
    const female = groups.female.length > 0 || registrations.some((reg) => isFemaleGender(reg.gender))
      ? [groups.femaleOpen, ...groups.female]
      : [];
    const male = groups.male.length > 0 || registrations.some((reg) => isMaleGender(reg.gender))
      ? [groups.maleOpen, ...groups.male]
      : [];
    const combined = [groups.femaleOpen, groups.maleOpen, ...groups.female, ...groups.male];

    const reference = referenceWeightFilterGroups(weightClasses);
    expect(female).toEqual([reference.femaleOpen, ...reference.female]);
    expect(male).toEqual([reference.maleOpen, ...reference.male]);
    expect(combined).toEqual([
      reference.femaleOpen,
      reference.maleOpen,
      ...reference.female,
      ...reference.male,
    ]);
  });
});

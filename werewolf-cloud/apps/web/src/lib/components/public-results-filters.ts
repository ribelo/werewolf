import {
  LABEL_FILTER_PREFIX,
  isFemaleGender,
  isMaleGender,
  normaliseLabelKey,
  type AgeFilter,
  type LabelFilter,
  type WeightFilter,
} from '$lib/filters/registrations';
import { normaliseAgeCategoryLabel } from '$lib/utils';
import type { AgeCategory, Registration, WeightClass } from '$lib/types';

export type FilterOptionTranslate = (key: string, values?: Record<string, string | number>) => string;

export interface PublicFilterOption<Id extends string> {
  id: Id;
  label: string;
}

export type PublicWeightFilterOption = PublicFilterOption<WeightFilter>;
export type PublicAgeFilterOption = PublicFilterOption<AgeFilter>;
export type PublicLabelFilterOption = PublicFilterOption<LabelFilter>;

export interface PublicWeightFilterGroups {
  femaleOpen: PublicWeightFilterOption;
  maleOpen: PublicWeightFilterOption;
  female: PublicWeightFilterOption[];
  male: PublicWeightFilterOption[];
}

/** Filter options of the public results page, ready to render in the three dropdowns. */
export interface PublicFilterOptions {
  weightGroups: PublicWeightFilterGroups;
  weight: PublicWeightFilterOption[];
  age: PublicAgeFilterOption[];
  label: PublicLabelFilterOption[];
}

export interface BuildPublicFilterOptionsInput {
  weightClasses: WeightClass[];
  ageCategories: AgeCategory[];
  registrations: Registration[];
  translate: FilterOptionTranslate;
}

function weightClassLabel(entry: WeightClass): string {
  return (entry.name ?? entry.code ?? '').toString();
}

function compareWeightClasses(a: WeightClass, b: WeightClass): number {
  const orderA = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
  const orderB = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
  if (orderA !== orderB) return orderA - orderB;
  return weightClassLabel(a).localeCompare(weightClassLabel(b), undefined, { sensitivity: 'base' });
}

function buildWeightFilterGroups(
  weightClasses: WeightClass[],
  translate: FilterOptionTranslate
): PublicWeightFilterGroups {
  const female: PublicWeightFilterOption[] = [];
  const male: PublicWeightFilterOption[] = [];
  const femaleSeen = new Set<string>();
  const maleSeen = new Set<string>();

  weightClasses
    .slice()
    .sort(compareWeightClasses)
    .forEach((entry) => {
      const id = (entry.id ?? entry.code ?? '').toString();
      const label = weightClassLabel(entry);
      if (!id || !label) return;

      const gender = (entry.gender ?? '').toString().toLowerCase();
      if (gender.startsWith('f')) {
        if (femaleSeen.has(id)) return;
        femaleSeen.add(id);
        female.push({ id, label });
      } else if (gender.startsWith('m')) {
        if (maleSeen.has(id)) return;
        maleSeen.add(id);
        male.push({ id, label });
      }
    });

  return {
    femaleOpen: { id: 'FEMALE_OPEN', label: translate('contest_detail.registrations.filters.open') },
    maleOpen: { id: 'MALE_OPEN', label: translate('contest_detail.registrations.filters.open') },
    female,
    male,
  };
}

function buildWeightFilterOptions(
  groups: PublicWeightFilterGroups,
  registrations: Registration[],
  translate: FilterOptionTranslate
): PublicWeightFilterOption[] {
  const options: PublicWeightFilterOption[] = [
    { id: 'ALL', label: translate('contest_detail.registrations.filters.all') },
  ];
  const hasFemale =
    groups.female.length > 0 || registrations.some((registration) => isFemaleGender(registration.gender));
  const hasMale =
    groups.male.length > 0 || registrations.some((registration) => isMaleGender(registration.gender));

  if (hasFemale) {
    options.push(groups.femaleOpen, ...groups.female);
  }
  if (hasMale) {
    options.push(groups.maleOpen, ...groups.male);
  }
  return options;
}

function buildAgeFilterOptions(
  ageCategories: AgeCategory[],
  registrations: Registration[],
  translate: FilterOptionTranslate
): PublicAgeFilterOption[] {
  const options: PublicAgeFilterOption[] = [
    { id: 'ALL', label: translate('contest_detail.registrations.filters.age_all') },
  ];
  const hasUnassigned = registrations.some((registration) => !registration.ageCategoryId);
  if (hasUnassigned) {
    options.push({
      id: 'UNASSIGNED',
      label: translate('contest_detail.registrations.filters.age_unassigned'),
    });
  }

  const seen = new Set<string>();
  ageCategories
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
        label = translate('contest_detail.registrations.filters.age_senior');
      }
      if (!id || !label) return;
      if (seen.has(id)) return;
      seen.add(id);
      options.push({ id, label });
    });

  return options;
}

function buildLabelFilterOptions(
  registrations: Registration[],
  translate: FilterOptionTranslate
): PublicLabelFilterOption[] {
  const options: PublicLabelFilterOption[] = [
    { id: 'ALL', label: translate('contest_detail.registrations.filters.labels_all') },
  ];
  let hasUnlabeled = false;
  const labelMap = new Map<string, string>();

  registrations.forEach((registration) => {
    const labels = Array.isArray(registration.labels) ? registration.labels : [];
    if (labels.length === 0) {
      hasUnlabeled = true;
      return;
    }
    labels.forEach((label) => {
      const trimmed = (label ?? '').trim();
      if (!trimmed) return;
      const key = normaliseLabelKey(trimmed);
      if (!labelMap.has(key)) {
        labelMap.set(key, trimmed);
      }
    });
  });

  if (hasUnlabeled) {
    options.push({
      id: 'UNLABELED',
      label: translate('contest_detail.registrations.filters.labels_unlabeled'),
    });
  }

  Array.from(labelMap.values())
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    .forEach((label) => {
      options.push({ id: `${LABEL_FILTER_PREFIX}${label}`, label });
    });

  return options;
}

/** Builds every filter dropdown of the public results page from the loaded scoreboard. */
export function buildPublicFilterOptions(input: BuildPublicFilterOptionsInput): PublicFilterOptions {
  const { weightClasses, ageCategories, registrations, translate } = input;
  const weightGroups = buildWeightFilterGroups(weightClasses, translate);

  return {
    weightGroups,
    weight: buildWeightFilterOptions(weightGroups, registrations, translate),
    age: buildAgeFilterOptions(ageCategories, registrations, translate),
    label: buildLabelFilterOptions(registrations, translate),
  };
}

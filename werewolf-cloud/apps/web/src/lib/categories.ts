import type { AgeCategory, ContestCategories, WeightClass } from '$lib/types';
import {
  DEFAULT_CONTEST_AGE_CATEGORY_TEMPLATES,
  DEFAULT_CONTEST_WEIGHT_CLASS_TEMPLATES,
} from '@werewolf/domain/constants/categories';

export function createDefaultAgeCategories(): AgeCategory[] {
  return DEFAULT_CONTEST_AGE_CATEGORY_TEMPLATES.map((template) => ({
    id: template.code,
    contestId: undefined,
    code: template.code,
    name: template.name,
    minAge: template.minAge,
    maxAge: template.maxAge,
    sortOrder: template.sortOrder,
    metadata: null,
  }));
}

export function createDefaultWeightClasses(): WeightClass[] {
  return DEFAULT_CONTEST_WEIGHT_CLASS_TEMPLATES.map((template) => ({
    id: template.code,
    contestId: undefined,
    code: template.code,
    name: template.name,
    gender: template.gender,
    minWeight: template.minWeight,
    maxWeight: template.maxWeight,
    sortOrder: template.sortOrder,
    metadata: null,
  }));
}

export function cloneContestCategories(categories: ContestCategories): ContestCategories {
  return {
    ageCategories: categories.ageCategories.map((category) => ({ ...category })),
    weightClasses: categories.weightClasses.map((weightClass) => ({ ...weightClass })),
  };
}

const MALE_CODES = new Set(['MALE', 'M']);
const FEMALE_CODES = new Set(['FEMALE', 'F']);

export type CategoryValidationIssue =
  | { scope: 'age'; code: 'empty_code' | 'empty_name' | 'invalid_range'; index: number }
  | { scope: 'age'; code: 'duplicate_code'; codeValue: string }
  | { scope: 'weight'; code: 'empty_code' | 'empty_name' | 'invalid_range' | 'invalid_gender'; index: number }
  | { scope: 'weight'; code: 'duplicate_code'; codeValue: string; gender: string };

function normaliseAgeCategory(category: AgeCategory, index: number): AgeCategory {
  const code = (category.code ?? '').trim().toUpperCase();
  const name = (category.name ?? '').trim();
  const sortOrder = category.sortOrder ?? (index + 1) * 10;
  return {
    ...category,
    code,
    name,
    sortOrder,
    minAge: category.minAge ?? null,
    maxAge: category.maxAge ?? null,
  };
}

function normaliseWeightClass(weightClass: WeightClass, index: number): WeightClass {
  const code = (weightClass.code ?? '').trim().toUpperCase();
  const name = (weightClass.name ?? '').trim();
  const sortOrder = weightClass.sortOrder ?? (index + 1) * 10;
  const genderRaw = (weightClass.gender ?? '').trim();
  const genderCanonical = FEMALE_CODES.has(genderRaw.toUpperCase())
    ? 'Female'
    : MALE_CODES.has(genderRaw.toUpperCase())
      ? 'Male'
      : genderRaw;

  return {
    ...weightClass,
    code,
    name,
    sortOrder,
    gender: genderCanonical,
    minWeight: weightClass.minWeight ?? null,
    maxWeight: weightClass.maxWeight ?? null,
  };
}

export function normaliseContestCategories(categories: ContestCategories): ContestCategories {
  return {
    ageCategories: categories.ageCategories.map(normaliseAgeCategory),
    weightClasses: categories.weightClasses.map(normaliseWeightClass),
  };
}

export function validateCategories(
  ageCategories: AgeCategory[],
  weightClasses: WeightClass[],
): CategoryValidationIssue[] {
  const issues: CategoryValidationIssue[] = [];

  const ageCodes = new Set<string>();
  ageCategories.forEach((category, index) => {
    const normalised = normaliseAgeCategory(category, index);
    if (!normalised.code) {
      issues.push({ scope: 'age', code: 'empty_code', index });
    }
    if (!normalised.name) {
      issues.push({ scope: 'age', code: 'empty_name', index });
    }
    if (
      normalised.minAge !== null &&
      normalised.maxAge !== null &&
      normalised.minAge > normalised.maxAge
    ) {
      issues.push({ scope: 'age', code: 'invalid_range', index });
    }
    if (normalised.code) {
      const key = normalised.code.toUpperCase();
      if (ageCodes.has(key)) {
        issues.push({ scope: 'age', code: 'duplicate_code', codeValue: key });
      } else {
        ageCodes.add(key);
      }
    }
  });

  const weightKeys = new Set<string>();
  weightClasses.forEach((weightClass, index) => {
    const normalised = normaliseWeightClass(weightClass, index);
    if (!normalised.code) {
      issues.push({ scope: 'weight', code: 'empty_code', index });
    }
    if (!normalised.name) {
      issues.push({ scope: 'weight', code: 'empty_name', index });
    }
    const genderKey = normalised.gender?.toUpperCase() ?? '';
    if (!FEMALE_CODES.has(genderKey) && !MALE_CODES.has(genderKey)) {
      issues.push({ scope: 'weight', code: 'invalid_gender', index });
    }
    if (
      normalised.minWeight !== null &&
      normalised.maxWeight !== null &&
      normalised.minWeight > normalised.maxWeight
    ) {
      issues.push({ scope: 'weight', code: 'invalid_range', index });
    }
    if (normalised.code) {
      const key = `${normalised.gender}:${normalised.code}`.toUpperCase();
      if (weightKeys.has(key)) {
        issues.push({
          scope: 'weight',
          code: 'duplicate_code',
          codeValue: normalised.code,
          gender: normalised.gender,
        });
      } else {
        weightKeys.add(key);
      }
    }
  });

  return issues;
}

export function buildCategoryPayload(ageCategories: AgeCategory[], weightClasses: WeightClass[]) {
  const normalisedAges = ageCategories.map(normaliseAgeCategory);
  const normalisedWeights = weightClasses.map(normaliseWeightClass);

  return {
    ageCategories: normalisedAges.map(({ metadata, ...category }) => ({
      ...category,
      metadata: metadata ?? null,
    })),
    weightClasses: normalisedWeights.map(({ metadata, ...weightClass }) => ({
      ...weightClass,
      metadata: weightClass.metadata ?? null,
    })),
  };
}

export function categoriesEqual(a: ContestCategories, b: ContestCategories): boolean {
  const serialise = (categories: ContestCategories) =>
    JSON.stringify(normaliseContestCategories(categories));
  return serialise(a) === serialise(b);
}

export type CategoryTranslate = (
  key: string,
  values?: Record<string, unknown>
) => string;

export function formatCategoryIssues(
  issues: CategoryValidationIssue[],
  translate: CategoryTranslate,
): string[] {
  return issues.map((issue) => {
    switch (issue.scope) {
      case 'age': {
        const rowValues = { index: issue.index + 1 };
        if (issue.code === 'duplicate_code') {
          return translate('contest.categories.validation.age.duplicate_code', {
            code: issue.codeValue,
          });
        }
        if (issue.code === 'invalid_range') {
          return translate('contest.categories.validation.age.invalid_range', rowValues);
        }
        if (issue.code === 'empty_name') {
          return translate('contest.categories.validation.age.empty_name', rowValues);
        }
        return translate('contest.categories.validation.age.empty_code', rowValues);
      }
      case 'weight': {
        const rowValues = { index: issue.index + 1 };
        if (issue.code === 'duplicate_code') {
          return translate('contest.categories.validation.weight.duplicate_code', {
            code: issue.codeValue,
            gender: issue.gender,
          });
        }
        if (issue.code === 'invalid_range') {
          return translate('contest.categories.validation.weight.invalid_range', rowValues);
        }
        if (issue.code === 'invalid_gender') {
          return translate('contest.categories.validation.weight.invalid_gender', rowValues);
        }
        if (issue.code === 'empty_name') {
          return translate('contest.categories.validation.weight.empty_name', rowValues);
        }
        return translate('contest.categories.validation.weight.empty_code', rowValues);
      }
      default:
        return translate('contest.categories.validation.unknown');
    }
  });
}

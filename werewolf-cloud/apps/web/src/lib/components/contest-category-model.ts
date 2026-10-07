import type { AgeCategory, ContestCategories, WeightClass } from '$lib/types';

/** Columns of the age category table that accept free text input. */
export type AgeCategoryEditableField = 'code' | 'name' | 'minAge' | 'maxAge' | 'sortOrder';

/** Columns of the weight class table that accept free text input. */
export type WeightClassEditableField =
  | 'code'
  | 'name'
  | 'gender'
  | 'minWeight'
  | 'maxWeight'
  | 'sortOrder';

/**
 * Age category row while it is being edited in ContestCategoryModal.
 *
 * `id` is null for rows that have not been persisted yet; the DTOs in
 * $lib/types only carry an id once the API has stored the row.
 */
export type AgeCategoryDraft = {
  id: string | null;
  contestId: string | null;
  code: string;
  name: string;
  minAge: number | null;
  maxAge: number | null;
  sortOrder: number | null;
  metadata: Record<string, unknown> | null;
};

export type WeightClassDraft = {
  id: string | null;
  contestId: string | null;
  code: string;
  name: string;
  gender: string;
  minWeight: number | null;
  maxWeight: number | null;
  sortOrder: number | null;
  metadata: Record<string, unknown> | null;
};

function parseOptionalNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function toAgeCategoryDraft(category: AgeCategory): AgeCategoryDraft {
  return {
    id: category.id ?? null,
    contestId: category.contestId ?? null,
    code: category.code,
    name: category.name,
    minAge: category.minAge,
    maxAge: category.maxAge,
    sortOrder: category.sortOrder ?? null,
    metadata: category.metadata ?? null,
  };
}

export function toWeightClassDraft(weightClass: WeightClass): WeightClassDraft {
  return {
    id: weightClass.id ?? null,
    contestId: weightClass.contestId ?? null,
    code: weightClass.code,
    name: weightClass.name,
    gender: weightClass.gender,
    minWeight: weightClass.minWeight,
    maxWeight: weightClass.maxWeight,
    sortOrder: weightClass.sortOrder ?? null,
    metadata: weightClass.metadata ?? null,
  };
}

export function createAgeCategoryDraft(contestId: string, sortOrder: number): AgeCategoryDraft {
  return {
    id: null,
    contestId,
    code: '',
    name: '',
    minAge: null,
    maxAge: null,
    sortOrder,
    metadata: null,
  };
}

export function createWeightClassDraft(
  contestId: string,
  sortOrder: number,
  gender: 'Female' | 'Male',
): WeightClassDraft {
  return {
    id: null,
    contestId,
    code: '',
    name: '',
    gender,
    minWeight: null,
    maxWeight: null,
    sortOrder,
    metadata: null,
  };
}

/** DTO sent to the API; persisted ids are preserved so existing rows update in place. */
export function toAgeCategory(draft: AgeCategoryDraft): AgeCategory {
  const category: AgeCategory = {
    code: draft.code,
    name: draft.name,
    minAge: draft.minAge,
    maxAge: draft.maxAge,
    sortOrder: draft.sortOrder,
    metadata: draft.metadata,
  };
  if (draft.id) {
    category.id = draft.id;
  }
  if (draft.contestId) {
    category.contestId = draft.contestId;
  }
  return category;
}

export function toWeightClass(draft: WeightClassDraft): WeightClass {
  const weightClass: WeightClass = {
    code: draft.code,
    name: draft.name,
    gender: draft.gender,
    minWeight: draft.minWeight,
    maxWeight: draft.maxWeight,
    sortOrder: draft.sortOrder,
    metadata: draft.metadata,
  };
  if (draft.id) {
    weightClass.id = draft.id;
  }
  if (draft.contestId) {
    weightClass.contestId = draft.contestId;
  }
  return weightClass;
}

export function toContestCategories(
  ageCategories: AgeCategoryDraft[],
  weightClasses: WeightClassDraft[],
): ContestCategories {
  return {
    ageCategories: ageCategories.map(toAgeCategory),
    weightClasses: weightClasses.map(toWeightClass),
  };
}

export function withAgeCategoryInput(
  draft: AgeCategoryDraft,
  field: AgeCategoryEditableField,
  value: string,
): AgeCategoryDraft {
  switch (field) {
    case 'code':
      return { ...draft, code: value.trim().toUpperCase() };
    case 'name':
      return { ...draft, name: value };
    case 'minAge':
      return { ...draft, minAge: parseOptionalNumber(value) };
    case 'maxAge':
      return { ...draft, maxAge: parseOptionalNumber(value) };
    case 'sortOrder':
      return { ...draft, sortOrder: parseOptionalNumber(value) };
  }
}

export function withWeightClassInput(
  draft: WeightClassDraft,
  field: WeightClassEditableField,
  value: string,
): WeightClassDraft {
  switch (field) {
    case 'code':
      return { ...draft, code: value.trim().toUpperCase() };
    case 'name':
      return { ...draft, name: value };
    case 'gender':
      return { ...draft, gender: value.trim().toUpperCase().startsWith('F') ? 'Female' : 'Male' };
    case 'minWeight':
      return { ...draft, minWeight: parseOptionalNumber(value) };
    case 'maxWeight':
      return { ...draft, maxWeight: parseOptionalNumber(value) };
    case 'sortOrder':
      return { ...draft, sortOrder: parseOptionalNumber(value) };
  }
}

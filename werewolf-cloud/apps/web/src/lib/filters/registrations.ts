import type { Registration } from '$lib/types';
import type { UnifiedRow } from '$lib/contest-table';

export type WeightFilter = 'ALL' | 'FEMALE_OPEN' | 'MALE_OPEN' | string;
export type AgeFilter = 'ALL' | 'UNASSIGNED' | string;
export type LabelFilter = 'ALL' | 'UNLABELED' | string;

export interface RegistrationFilterState {
  weight: WeightFilter;
  age: AgeFilter;
  label: LabelFilter;
}

export const LABEL_FILTER_PREFIX = 'LABEL:';

export function normaliseLabelKey(label: string): string {
  return label.trim().toLowerCase();
}

export function isFemaleGender(value: string | null | undefined): boolean {
  const lowered = (value ?? '').trim().toLowerCase();
  return lowered.startsWith('f') || lowered.startsWith('k');
}

export function isMaleGender(value: string | null | undefined): boolean {
  const lowered = (value ?? '').trim().toLowerCase();
  return lowered.startsWith('m');
}

export function registrationMatchesFilters(
  registration: Registration,
  filters: RegistrationFilterState
): boolean {
  const { weight, age, label } = filters;

  let weightMatch = false;
  if (weight === 'ALL') {
    weightMatch = true;
  } else if (weight === 'FEMALE_OPEN') {
    weightMatch = isFemaleGender(registration.gender);
  } else if (weight === 'MALE_OPEN') {
    weightMatch = isMaleGender(registration.gender);
  } else {
    weightMatch = registration.weightClassId === weight;
  }

  if (!weightMatch) {
    return false;
  }

  const ageId = registration.ageCategoryId ?? '';
  const ageMatch =
    age === 'ALL' || (age === 'UNASSIGNED' ? !ageId : ageId === age);

  if (!ageMatch) {
    return false;
  }

  const labels = Array.isArray(registration.labels) ? registration.labels : [];
  if (label === 'ALL') {
    return true;
  }
  if (label === 'UNLABELED') {
    return labels.length === 0;
  }

  const targetLabel = label.startsWith(LABEL_FILTER_PREFIX)
    ? label.slice(LABEL_FILTER_PREFIX.length)
    : label;
  const targetKey = normaliseLabelKey(targetLabel);

  return labels.some((entry) => normaliseLabelKey(entry) === targetKey);
}

export function applyRegistrationFilters(
  rows: UnifiedRow[],
  filters: RegistrationFilterState
): UnifiedRow[] {
  return rows.filter((row) => registrationMatchesFilters(row.registration, filters));
}

import type { ContestWeightClass } from '../models/category';

export interface ContestAgeCategoryTemplate {
  code: string;
  name: string;
  minAge: number | null;
  maxAge: number | null;
  sortOrder: number;
}

export interface ContestWeightClassTemplate {
  gender: ContestWeightClass['gender'];
  code: string;
  name: string;
  minWeight: number | null;
  maxWeight: number | null;
  sortOrder: number;
}

export const DEFAULT_CONTEST_AGE_CATEGORY_TEMPLATES: readonly ContestAgeCategoryTemplate[] = Object.freeze([
  { code: 'T16', name: 'T16 (≤16)', minAge: null, maxAge: 16, sortOrder: 10 },
  { code: 'T19', name: 'T19 (16-19)', minAge: 16, maxAge: 19, sortOrder: 20 },
  { code: 'JUNIOR', name: 'Junior (20-23)', minAge: 20, maxAge: 23, sortOrder: 30 },
  { code: 'OPEN', name: 'Open', minAge: 24, maxAge: null, sortOrder: 40 },
  { code: 'M40', name: 'Master 40-49', minAge: 40, maxAge: 49, sortOrder: 50 },
  { code: 'M50', name: 'Master 50-59', minAge: 50, maxAge: 59, sortOrder: 60 },
  { code: 'M60', name: 'Master 60+', minAge: 60, maxAge: null, sortOrder: 70 },
]);

export const DEFAULT_CONTEST_WEIGHT_CLASS_TEMPLATES: readonly ContestWeightClassTemplate[] = Object.freeze([
  { gender: 'Female', code: 'F_52', name: 'Do 52 kg', minWeight: null, maxWeight: 52.0, sortOrder: 10 },
  { gender: 'Female', code: 'F_60', name: 'Do 60 kg', minWeight: 52.01, maxWeight: 60.0, sortOrder: 20 },
  { gender: 'Female', code: 'F_67_5', name: 'Do 67.5 kg', minWeight: 60.01, maxWeight: 67.5, sortOrder: 30 },
  { gender: 'Female', code: 'F_82_5', name: 'Do 82.5 kg', minWeight: 67.51, maxWeight: 82.5, sortOrder: 40 },
  { gender: 'Female', code: 'F_82_5_PLUS', name: '82.5+ kg', minWeight: 82.51, maxWeight: null, sortOrder: 50 },
  { gender: 'Male', code: 'M_67_5', name: 'Do 67.5 kg', minWeight: null, maxWeight: 67.5, sortOrder: 10 },
  { gender: 'Male', code: 'M_82_5', name: 'Do 82.5 kg', minWeight: 67.51, maxWeight: 82.5, sortOrder: 20 },
  { gender: 'Male', code: 'M_95', name: 'Do 95 kg', minWeight: 82.51, maxWeight: 95.0, sortOrder: 30 },
  { gender: 'Male', code: 'M_110', name: 'Do 110 kg', minWeight: 95.01, maxWeight: 110.0, sortOrder: 40 },
  { gender: 'Male', code: 'M_125', name: 'Do 125 kg', minWeight: 110.01, maxWeight: 125.0, sortOrder: 50 },
  { gender: 'Male', code: 'M_125_PLUS', name: '125+ kg', minWeight: 125.01, maxWeight: null, sortOrder: 60 },
]);

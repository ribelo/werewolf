// werewolf/werewolf-cloud/packages/domain/src/services/coefficients.ts

import reshelMenDataset from '../data/reshel-men.json';
import reshelWomenDataset from '../data/reshel-women.json';
import mcculloughDataset from '../data/mccullough.json';
import {
  DEFAULT_CONTEST_AGE_CATEGORY_TEMPLATES,
  DEFAULT_CONTEST_WEIGHT_CLASS_TEMPLATES,
} from '../constants/categories';

type Gender = 'male' | 'female';

export interface ReshelEntry {
  bodyweightKg: number;
  coefficient: number;
}

export interface ReshelTables {
  male: ReshelEntry[];
  female: ReshelEntry[];
  incrementKg: number;
}

export interface McCulloughEntry {
  age: number;
  coefficient: number;
}

const DEFAULT_RESHEL_TABLES: ReshelTables = {
  male: reshelMenDataset.entries,
  female: reshelWomenDataset.entries,
  incrementKg: reshelMenDataset.incrementKg ?? 0.25,
};

const DEFAULT_MCCULLOUGH_ENTRIES: McCulloughEntry[] = mcculloughDataset.entries;

export interface AgeCategoryDescriptor {
  id: string;
  code: string;
  minAge: number | null;
  maxAge: number | null;
  sortOrder?: number | null;
}

export interface WeightClassDescriptor {
  id: string;
  code: string;
  gender: string;
  minWeight: number | null;
  maxWeight: number | null;
  sortOrder?: number | null;
}

const SENIOR_CODE_PREFERENCES = ['SENIOR', 'OPEN'] as const;

export const DEFAULT_AGE_CATEGORY_DESCRIPTORS: AgeCategoryDescriptor[] =
  DEFAULT_CONTEST_AGE_CATEGORY_TEMPLATES.map((template) => ({
    id: template.code,
    code: template.code,
    minAge: template.minAge,
    maxAge: template.maxAge,
    sortOrder: template.sortOrder,
  }));

export const DEFAULT_WEIGHT_CLASS_DESCRIPTORS: WeightClassDescriptor[] =
  DEFAULT_CONTEST_WEIGHT_CLASS_TEMPLATES.map((template) => ({
    id: template.code,
    code: template.code,
    gender: template.gender,
    minWeight: template.minWeight,
    maxWeight: template.maxWeight,
    sortOrder: template.sortOrder,
  }));

function normalizeGender(input: string): Gender | null {
  const value = input.toLowerCase();
  if (value === 'male' || value === 'm') return 'male';
  if (value === 'female' || value === 'f') return 'female';
  return null;
}

function roundToIncrement(value: number, increment: number): number {
  return Number((Math.round(value / increment) * increment).toFixed(2));
}

function findClosestWeight(entries: ReshelEntry[], target: number): ReshelEntry | undefined {
  let best: ReshelEntry | undefined;
  let bestDiff = Number.POSITIVE_INFINITY;

  for (const entry of entries) {
    const diff = Math.abs(entry.bodyweightKg - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = entry;
    }
  }

  return best;
}

function sortDescriptors<T extends { sortOrder?: number | null }>(items: T[]): T[] {
  return [...items].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

export function getDefaultReshelTables(): ReshelTables {
  return DEFAULT_RESHEL_TABLES;
}

export function getDefaultMcCulloughEntries(): McCulloughEntry[] {
  return DEFAULT_MCCULLOUGH_ENTRIES;
}

export function resolveReshelCoefficient(
  bodyweight: number,
  gender: string,
  tables: ReshelTables = DEFAULT_RESHEL_TABLES,
): number {
  if (!Number.isFinite(bodyweight) || bodyweight <= 0) {
    return 1.0;
  }

  const normalizedGender = normalizeGender(gender);
  if (!normalizedGender) {
    return 1.0;
  }

  const entries = normalizedGender === 'male' ? tables.male : tables.female;
  if (!entries || entries.length === 0) {
    return 1.0;
  }

  const increment = tables.incrementKg ?? 0.25;
  const minWeight = entries[0]!.bodyweightKg;
  const maxWeight = entries[entries.length - 1]!.bodyweightKg;

  const rounded = roundToIncrement(bodyweight, increment);
  const clamped = Math.min(maxWeight, Math.max(minWeight, rounded));

  const match = entries.find((entry) => Math.abs(entry.bodyweightKg - clamped) < 0.0001)
    ?? findClosestWeight(entries, clamped);

  return match?.coefficient ?? 1.0;
}

function calculateAge(birthDate: string, contestDate: string): number | null {
  try {
    const birth = new Date(birthDate);
    const contest = new Date(contestDate);

    if (Number.isNaN(birth.getTime()) || Number.isNaN(contest.getTime())) {
      return null;
    }

    const yearDiff = contest.getFullYear() - birth.getFullYear();
    const monthDiff = contest.getMonth() - birth.getMonth();
    const isBeforeBirthday = monthDiff < 0 || (monthDiff === 0 && contest.getDate() < birth.getDate());

    return isBeforeBirthday ? yearDiff - 1 : yearDiff;
  } catch (error) {
    console.warn('Failed to calculate age:', error);
    return null;
  }
}

export function resolveMcCulloughCoefficient(
  age: number,
  entries: McCulloughEntry[] = DEFAULT_MCCULLOUGH_ENTRIES,
): number {
  if (!Number.isFinite(age) || age < 0) {
    return 1.0;
  }

  if (entries.length === 0) {
    return 1.0;
  }

  const minAge = entries[0]!.age;
  const maxAge = entries[entries.length - 1]!.age;

  const clampedAge = Math.min(maxAge, Math.max(minAge, Math.floor(age)));
  const exactMatch = entries.find((entry) => entry.age === clampedAge);
  if (exactMatch) {
    return exactMatch.coefficient;
  }

  let closest = entries[0]!;
  let closestDiff = Math.abs(closest.age - clampedAge);
  for (const entry of entries) {
    const diff = Math.abs(entry.age - clampedAge);
    if (diff < closestDiff) {
      closest = entry;
      closestDiff = diff;
    }
  }

  return closest.coefficient;
}

export function determineAgeCategory(
  birthDate: string,
  contestDate: string,
  categories: AgeCategoryDescriptor[] = DEFAULT_AGE_CATEGORY_DESCRIPTORS,
): string {
  const fallback =
    categories.find((category) =>
      SENIOR_CODE_PREFERENCES.some((legacy) => category.code.toUpperCase() === legacy)
    )?.code
    ?? categories[0]?.code
    ?? 'SENIOR';

  try {
    const age = calculateAge(birthDate, contestDate);
    if (age === null) {
      return fallback;
    }

    const ordered = sortDescriptors(categories);
    const rangeMatch = ordered.find((category) => {
      const definesRange = category.minAge !== null || category.maxAge !== null;
      if (!definesRange) {
        return false;
      }
      const minOk = category.minAge === null || age >= category.minAge;
      const maxOk = category.maxAge === null || age <= category.maxAge;
      return minOk && maxOk;
    });

    if (rangeMatch) {
      return rangeMatch.code;
    }

    const seniorMatch = ordered.find((category) =>
      SENIOR_CODE_PREFERENCES.some((legacy) => category.code.toUpperCase() === legacy)
    );
    if (seniorMatch) {
      return seniorMatch.code;
    }

    return fallback;
  } catch (error) {
    console.warn('Failed to determine age category:', error);
    return fallback;
  }
}

export function determineWeightClass(
  bodyweight: number,
  gender: string,
  classes: WeightClassDescriptor[] = DEFAULT_WEIGHT_CLASS_DESCRIPTORS,
): string {
  const normalisedGender = gender.toLowerCase().startsWith('f') ? 'Female' : 'Male';
  const safeWeight = Number.isFinite(bodyweight) ? bodyweight : 0;

  const genderClasses = classes.filter((cls) => cls.gender.toLowerCase() === normalisedGender.toLowerCase());
  const ordered = sortDescriptors(genderClasses.length > 0 ? genderClasses : classes);

  for (const cls of ordered) {
    const minOk = cls.minWeight === null || safeWeight >= cls.minWeight;
    const maxOk = cls.maxWeight === null || safeWeight <= cls.maxWeight;
    if (minOk && maxOk) {
      return cls.code;
    }
  }

  return ordered[ordered.length - 1]?.code ?? classes[0]?.code ?? 'SENIOR';
}

/**
 * Calculate Reshel coefficient based on bodyweight and gender.
 */
export function calculateReshelCoefficient(bodyweight: number, gender: string): number {
  return resolveReshelCoefficient(bodyweight, gender, DEFAULT_RESHEL_TABLES);
}

/**
 * Calculate McCullough coefficient based on age (WUAP masters table for 40+, 1.0 below 40).
 */
export function calculateMcCulloughCoefficient(birthDate: string, contestDate: string): number {
  const age = calculateAge(birthDate, contestDate);
  if (age === null) {
    return 1.0;
  }
  return resolveMcCulloughCoefficient(age, DEFAULT_MCCULLOUGH_ENTRIES);
}

/**
 * Calculate total points for a lifter
 */
export function calculatePoints(totalWeight: number, reshel: number, mccullough: number): number {
  if (totalWeight <= 0) return 0;
  return totalWeight * reshel * mccullough;
}

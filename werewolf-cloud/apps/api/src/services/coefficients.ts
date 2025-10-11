import type { D1Database } from '@cloudflare/workers-types';
import {
  type ReshelEntry,
  type ReshelTables,
  type McCulloughEntry,
  calculateMcCulloughCoefficient as calculateMcCulloughFromDefaults,
  calculateReshelCoefficient as calculateReshelFromDefaults,
  getDefaultMcCulloughEntries,
  getDefaultReshelTables,
  resolveMcCulloughCoefficient,
  resolveReshelCoefficient,
} from '@werewolf/domain/services/coefficients';

interface ReshelCache {
  tables: ReshelTables;
  loaded: boolean;
}

interface McCulloughCache {
  entries: McCulloughEntry[];
  loaded: boolean;
}

const defaultReshel = getDefaultReshelTables();
const defaultMcc = getDefaultMcCulloughEntries();

const reshelCache: ReshelCache = {
  tables: defaultReshel,
  loaded: false,
};

const mccCache: McCulloughCache = {
  entries: defaultMcc,
  loaded: false,
};

function normaliseGender(value: string): 'male' | 'female' | null {
  const lower = value.toLowerCase();
  if (lower === 'male' || lower === 'm') return 'male';
  if (lower === 'female' || lower === 'f') return 'female';
  return null;
}

async function loadReshelTables(db: D1Database): Promise<void> {
  const result = await db
    .prepare('SELECT gender, bodyweight_kg, coefficient FROM reshel_coefficients ORDER BY gender, bodyweight_kg ASC')
    .all();

  if (!result.success || !result.results?.length) {
    console.warn('Reshel table query returned no rows; falling back to bundled dataset');
    reshelCache.tables = defaultReshel;
    reshelCache.loaded = true;
    return;
  }

  const table: ReshelTables = {
    male: [],
    female: [],
    incrementKg: defaultReshel.incrementKg,
  };

  for (const row of result.results as Array<{ gender: string; bodyweight_kg: number; coefficient: number }>) {
    const gender = normaliseGender(row.gender);
    if (!gender) continue;
    const entry: ReshelEntry = {
      bodyweightKg: Number(row.bodyweight_kg),
      coefficient: Number(row.coefficient),
    };
    table[gender].push(entry);
  }

  table.male.sort((a, b) => a.bodyweightKg - b.bodyweightKg);
  table.female.sort((a, b) => a.bodyweightKg - b.bodyweightKg);

  reshelCache.tables = table;
  reshelCache.loaded = true;
}

async function loadMcCulloughEntries(db: D1Database): Promise<void> {
  const result = await db
    .prepare('SELECT age, coefficient FROM mccullough_coefficients ORDER BY age ASC')
    .all();

  if (!result.success || !result.results?.length) {
    console.warn('McCullough table query returned no rows; falling back to bundled dataset');
    mccCache.entries = defaultMcc;
    mccCache.loaded = true;
    return;
  }

  const entries: McCulloughEntry[] = (result.results as Array<{ age: number; coefficient: number }>).map((row) => ({
    age: Number(row.age),
    coefficient: Number(row.coefficient),
  }));

  entries.sort((a, b) => a.age - b.age);
  mccCache.entries = entries;
  mccCache.loaded = true;
}

export async function getReshelCoefficient(
  db: D1Database,
  gender: string,
  bodyweight: number,
): Promise<number> {
  if (!reshelCache.loaded) {
    await loadReshelTables(db);
  }
  return resolveReshelCoefficient(bodyweight, gender, reshelCache.tables);
}

export async function getMcCulloughCoefficient(
  db: D1Database,
  birthDate: string,
  contestDate: string,
): Promise<number> {
  if (!mccCache.loaded) {
    await loadMcCulloughEntries(db);
  }

  const age = calculateAge(birthDate, contestDate);

  if (age === null) {
    return calculateMcCulloughFromDefaults(birthDate, contestDate);
  }

  return resolveMcCulloughCoefficient(age, mccCache.entries);
}

function calculateAge(birthDate: string, contestDate: string): number | null {
  const birth = new Date(birthDate);
  const contest = new Date(contestDate);
  if (Number.isNaN(birth.getTime()) || Number.isNaN(contest.getTime())) {
    return null;
  }
  const yearDiff = contest.getFullYear() - birth.getFullYear();
  const monthDiff = contest.getMonth() - birth.getMonth();
  const isBeforeBirthday = monthDiff < 0 || (monthDiff === 0 && contest.getDate() < birth.getDate());
  return isBeforeBirthday ? yearDiff - 1 : yearDiff;
}

export function resetCoefficientCaches(): void {
  reshelCache.loaded = false;
  reshelCache.tables = defaultReshel;
  mccCache.loaded = false;
  mccCache.entries = defaultMcc;
}

export function fallbackReshelCoefficient(bodyweight: number, gender: string): number {
  return calculateReshelFromDefaults(bodyweight, gender);
}

export function fallbackMcCulloughCoefficient(birthDate: string, contestDate: string): number {
  return calculateMcCulloughFromDefaults(birthDate, contestDate);
}

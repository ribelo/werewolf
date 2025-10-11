import type { Database } from './database';
import { executeMutation, executeQuery } from './database';
import { generateId } from './database';
import type { AgeCategoryDescriptor, WeightClassDescriptor } from '@werewolf/domain/services/coefficients';
import type {
  ContestAgeCategory,
  ContestWeightClass,
  ContestAgeCategoryInput,
  ContestWeightClassInput,
} from '@werewolf/domain/models/category';
import {
  DEFAULT_CONTEST_AGE_CATEGORY_TEMPLATES,
  DEFAULT_CONTEST_WEIGHT_CLASS_TEMPLATES,
} from '@werewolf/domain/constants/categories';

export interface ContestAgeCategoryRow {
  id: string;
  contest_id: string;
  code: string;
  name: string;
  min_age: number | null;
  max_age: number | null;
  sort_order: number | null;
  metadata: string | null;
}

export interface ContestWeightClassRow {
  id: string;
  contest_id: string;
  gender: string;
  code: string;
  name: string;
  min_weight: number | null;
  max_weight: number | null;
  sort_order: number | null;
  metadata: string | null;
}

export async function seedContestCategories(db: Database, contestId: string) {
  const existing = await executeQuery<{ count: number }>(
    db,
    'SELECT COUNT(*) as count FROM contest_age_categories WHERE contest_id = ?',
    [contestId]
  );
  if (Number(existing?.[0]?.count ?? 0) === 0) {
    for (const template of DEFAULT_CONTEST_AGE_CATEGORY_TEMPLATES) {
      await executeMutation(
        db,
        `INSERT INTO contest_age_categories (id, contest_id, code, name, min_age, max_age, sort_order, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL)` ,
        [generateId(), contestId, template.code, template.name, template.minAge, template.maxAge, template.sortOrder]
      );
    }
  }

  const existingWeight = await executeQuery<{ count: number }>(
    db,
    'SELECT COUNT(*) as count FROM contest_weight_classes WHERE contest_id = ?',
    [contestId]
  );
  if (Number(existingWeight?.[0]?.count ?? 0) === 0) {
    for (const template of DEFAULT_CONTEST_WEIGHT_CLASS_TEMPLATES) {
      await executeMutation(
        db,
        `INSERT INTO contest_weight_classes (id, contest_id, gender, code, name, min_weight, max_weight, sort_order, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)` ,
        [generateId(), contestId, template.gender, template.code, template.name, template.minWeight, template.maxWeight, template.sortOrder]
      );
    }
  }
}

export async function getContestAgeDescriptors(db: Database, contestId: string): Promise<AgeCategoryDescriptor[]> {
  const rows = await executeQuery<ContestAgeCategoryRow>(
    db,
    `SELECT id, contest_id, code, name, min_age, max_age, sort_order, metadata
     FROM contest_age_categories
     WHERE contest_id = ?
     ORDER BY sort_order ASC, name ASC`,
    [contestId]
  );

  if (rows.length === 0) {
    await seedContestCategories(db, contestId);
    return getContestAgeDescriptors(db, contestId);
  }

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    minAge: row.min_age,
    maxAge: row.max_age,
    sortOrder: row.sort_order ?? null,
  }));
}

export async function getContestWeightDescriptors(db: Database, contestId: string): Promise<WeightClassDescriptor[]> {
  const rows = await executeQuery<ContestWeightClassRow>(
    db,
    `SELECT id, contest_id, gender, code, name, min_weight, max_weight, sort_order, metadata
     FROM contest_weight_classes
     WHERE contest_id = ?
     ORDER BY gender ASC, sort_order ASC, name ASC`,
    [contestId]
  );

  if (rows.length === 0) {
    await seedContestCategories(db, contestId);
    return getContestWeightDescriptors(db, contestId);
  }

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    gender: row.gender,
    minWeight: row.min_weight,
    maxWeight: row.max_weight,
    sortOrder: row.sort_order ?? null,
  }));
}

function parseMetadata(value: string | null): Record<string, unknown> | null {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch (error) {
    console.warn('Failed to parse category metadata payload', error);
    return null;
  }
}

export async function listContestAgeCategories(db: Database, contestId: string): Promise<ContestAgeCategory[]> {
  const rows = await executeQuery<ContestAgeCategoryRow>(
    db,
    `SELECT id, contest_id, code, name, min_age, max_age, sort_order, metadata
     FROM contest_age_categories
     WHERE contest_id = ?
     ORDER BY sort_order ASC, name ASC`,
    [contestId]
  );

  return rows.map((row) => ({
    id: row.id,
    contestId: row.contest_id,
    code: row.code,
    name: row.name,
    minAge: row.min_age,
    maxAge: row.max_age,
    sortOrder: row.sort_order ?? 0,
    metadata: parseMetadata(row.metadata),
  }));
}

export async function listContestWeightClasses(db: Database, contestId: string): Promise<ContestWeightClass[]> {
  const rows = await executeQuery<ContestWeightClassRow>(
    db,
    `SELECT id, contest_id, gender, code, name, min_weight, max_weight, sort_order, metadata
     FROM contest_weight_classes
     WHERE contest_id = ?
     ORDER BY gender ASC, sort_order ASC, name ASC`,
    [contestId]
  );

  return rows.map((row) => ({
    id: row.id,
    contestId: row.contest_id,
    gender: row.gender as ContestWeightClass['gender'],
    code: row.code,
    name: row.name,
    minWeight: row.min_weight,
    maxWeight: row.max_weight,
    sortOrder: row.sort_order ?? 0,
    metadata: parseMetadata(row.metadata),
  }));
}

export async function replaceContestAgeCategories(
  db: Database,
  contestId: string,
  categories: ContestAgeCategoryInput[],
): Promise<void> {
  const existing = await executeQuery<{ id: string }>(
    db,
    'SELECT id FROM contest_age_categories WHERE contest_id = ?',
    [contestId]
  );

  const existingIds = new Set(existing.map((row) => row.id));
  const keepIds = new Set<string>();

  for (const category of categories) {
    const id = category.id ?? generateId();
    keepIds.add(id);

    const metadata = category.metadata ? JSON.stringify(category.metadata) : null;
    const sortOrder = category.sortOrder ?? 0;

    if (existingIds.has(id)) {
      await executeMutation(
        db,
        `UPDATE contest_age_categories
         SET code = ?, name = ?, min_age = ?, max_age = ?, sort_order = ?, metadata = ?
         WHERE id = ? AND contest_id = ?`,
        [category.code, category.name, category.minAge, category.maxAge, sortOrder, metadata, id, contestId]
      );
    } else {
      await executeMutation(
        db,
        `INSERT INTO contest_age_categories (id, contest_id, code, name, min_age, max_age, sort_order, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)` ,
        [id, contestId, category.code, category.name, category.minAge, category.maxAge, sortOrder, metadata]
      );
    }
  }

  const idsToDelete = [...existingIds].filter((id) => !keepIds.has(id));
  if (idsToDelete.length > 0) {
    const placeholders = idsToDelete.map(() => '?').join(',');
    const usage = await executeQuery<{ total: number }>(
      db,
      `SELECT COUNT(*) as total FROM registrations WHERE contest_id = ? AND age_category_id IN (${placeholders})`,
      [contestId, ...idsToDelete]
    );

    if (Number(usage[0]?.total ?? 0) > 0) {
      throw new Error('AGE_CATEGORY_IN_USE');
    }

    await executeMutation(
      db,
      `DELETE FROM contest_age_categories WHERE contest_id = ? AND id IN (${placeholders})`,
      [contestId, ...idsToDelete]
    );
  }
}

export async function replaceContestWeightClasses(
  db: Database,
  contestId: string,
  classes: ContestWeightClassInput[],
): Promise<void> {
  const existing = await executeQuery<{ id: string }>(
    db,
    'SELECT id FROM contest_weight_classes WHERE contest_id = ?',
    [contestId]
  );

  const existingIds = new Set(existing.map((row) => row.id));
  const keepIds = new Set<string>();

  for (const weightClass of classes) {
    const id = weightClass.id ?? generateId();
    keepIds.add(id);

    const metadata = weightClass.metadata ? JSON.stringify(weightClass.metadata) : null;
    const sortOrder = weightClass.sortOrder ?? 0;

    if (existingIds.has(id)) {
      await executeMutation(
        db,
        `UPDATE contest_weight_classes
         SET gender = ?, code = ?, name = ?, min_weight = ?, max_weight = ?, sort_order = ?, metadata = ?
         WHERE id = ? AND contest_id = ?`,
        [weightClass.gender, weightClass.code, weightClass.name, weightClass.minWeight, weightClass.maxWeight, sortOrder, metadata, id, contestId]
      );
    } else {
      await executeMutation(
        db,
        `INSERT INTO contest_weight_classes (id, contest_id, gender, code, name, min_weight, max_weight, sort_order, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
        [id, contestId, weightClass.gender, weightClass.code, weightClass.name, weightClass.minWeight, weightClass.maxWeight, sortOrder, metadata]
      );
    }
  }

  const idsToDelete = [...existingIds].filter((id) => !keepIds.has(id));
  if (idsToDelete.length > 0) {
    const placeholders = idsToDelete.map(() => '?').join(',');
    const usage = await executeQuery<{ total: number }>(
      db,
      `SELECT COUNT(*) as total FROM registrations WHERE contest_id = ? AND weight_class_id IN (${placeholders})`,
      [contestId, ...idsToDelete]
    );

    if (Number(usage[0]?.total ?? 0) > 0) {
      throw new Error('WEIGHT_CLASS_IN_USE');
    }

    await executeMutation(
      db,
      `DELETE FROM contest_weight_classes WHERE contest_id = ? AND id IN (${placeholders})`,
      [contestId, ...idsToDelete]
    );
  }
}

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { WerewolfEnvironment } from '../env';
import {
  contestCategoryUpsertSchema,
  type ContestAgeCategoryInput,
  type ContestWeightClassInput,
} from '@werewolf/domain/models/category';
import {
  listContestAgeCategories,
  listContestWeightClasses,
  replaceContestAgeCategories,
  replaceContestWeightClasses,
  seedContestCategories,
} from '../utils/category-templates';
import { executeMutation, executeQueryOne, convertKeysToCamelCase, type Database } from '../utils/database';

const categories = new Hono<WerewolfEnvironment>();

const contestIdParamSchema = z.object({ contestId: z.string().uuid() });

async function ensureContest(db: Database, contestId: string): Promise<boolean> {
  const exists = await executeQueryOne<{ id: string }>(
    db,
    'SELECT id FROM contests WHERE id = ?',
    [contestId]
  );
  return Boolean(exists);
}

function normalizeAgeInputs(inputs: ContestAgeCategoryInput[]): ContestAgeCategoryInput[] {
  return inputs.map((item, index) => ({
    ...item,
    code: item.code.toUpperCase(),
    name: item.name.trim(),
    sortOrder: item.sortOrder ?? (index + 1) * 10,
  }));
}

function normalizeWeightInputs(inputs: ContestWeightClassInput[]): ContestWeightClassInput[] {
  return inputs.map((item, index) => ({
    ...item,
    gender: item.gender.toLowerCase().startsWith('f') ? 'Female' : 'Male',
    code: item.code.toUpperCase(),
    name: item.name.trim(),
    sortOrder: item.sortOrder ?? (index + 1) * 10,
  }));
}

function ensureUniqueCodes(
  ageCategories: ContestAgeCategoryInput[],
  weightClasses: ContestWeightClassInput[],
): void {
  const ageCodes = new Set<string>();
  for (const category of ageCategories) {
    const code = category.code.toUpperCase();
    if (ageCodes.has(code)) {
      throw new Error(`DUPLICATE_AGE_CODE:${code}`);
    }
    ageCodes.add(code);
  }

  const weightKeys = new Set<string>();
  for (const weightClass of weightClasses) {
    const key = `${weightClass.gender}:${weightClass.code.toUpperCase()}`;
    if (weightKeys.has(key)) {
      throw new Error(`DUPLICATE_WEIGHT_CODE:${weightClass.gender}:${weightClass.code}`);
    }
    weightKeys.add(key);
  }
}

categories.get('/', async (c) => {
  const db = c.env.DB;
  const paramsResult = contestIdParamSchema.safeParse(c.req.param());
  if (!paramsResult.success) {
    return c.json({ data: null, error: 'Invalid contest id', requestId: c.get('requestId') }, 400);
  }
  const { contestId } = paramsResult.data;

  if (!(await ensureContest(db, contestId))) {
    return c.json({ data: null, error: 'Contest not found', requestId: c.get('requestId') }, 404);
  }

  await seedContestCategories(db, contestId);

  const [ageCategories, weightClasses] = await Promise.all([
    listContestAgeCategories(db, contestId),
    listContestWeightClasses(db, contestId),
  ]);

  return c.json({
    data: convertKeysToCamelCase({ ageCategories, weightClasses }),
    error: null,
    requestId: c.get('requestId'),
  });
});

categories.put('/', zValidator('json', contestCategoryUpsertSchema), async (c) => {
  const db = c.env.DB;
  const paramsResult = contestIdParamSchema.safeParse(c.req.param());
  if (!paramsResult.success) {
    return c.json({ data: null, error: 'Invalid contest id', requestId: c.get('requestId') }, 400);
  }
  const { contestId } = paramsResult.data;
  const payload = c.req.valid('json');

  if (!(await ensureContest(db, contestId))) {
    return c.json({ data: null, error: 'Contest not found', requestId: c.get('requestId') }, 404);
  }

  const normalizedAge = normalizeAgeInputs(payload.ageCategories);
  const normalizedWeight = normalizeWeightInputs(payload.weightClasses);

  try {
    ensureUniqueCodes(normalizedAge, normalizedWeight);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('DUPLICATE')) {
      return c.json({ data: null, error: error.message, requestId: c.get('requestId') }, 400);
    }
    throw error;
  }

  try {
    await replaceContestAgeCategories(db, contestId, normalizedAge);
    await replaceContestWeightClasses(db, contestId, normalizedWeight);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'AGE_CATEGORY_IN_USE') {
        return c.json({ data: null, error: 'AGE_CATEGORY_IN_USE', requestId: c.get('requestId') }, 409);
      }
      if (error.message === 'WEIGHT_CLASS_IN_USE') {
        return c.json({ data: null, error: 'WEIGHT_CLASS_IN_USE', requestId: c.get('requestId') }, 409);
      }
    }
    throw error;
  }

  const [ageCategories, weightClasses] = await Promise.all([
    listContestAgeCategories(db, contestId),
    listContestWeightClasses(db, contestId),
  ]);

  return c.json({
    data: convertKeysToCamelCase({ ageCategories, weightClasses }),
    error: null,
    requestId: c.get('requestId'),
  });
});

categories.post('/defaults', async (c) => {
  const db = c.env.DB;
  const paramsResult = contestIdParamSchema.safeParse(c.req.param());
  if (!paramsResult.success) {
    return c.json({ data: null, error: 'Invalid contest id', requestId: c.get('requestId') }, 400);
  }
  const { contestId } = paramsResult.data;

  if (!(await ensureContest(db, contestId))) {
    return c.json({ data: null, error: 'Contest not found', requestId: c.get('requestId') }, 404);
  }

  const registrationCount = await executeQueryOne<{ total: number }>(
    db,
    'SELECT COUNT(*) as total FROM registrations WHERE contest_id = ?',
    [contestId]
  );

  if (Number(registrationCount?.total ?? 0) > 0) {
    return c.json({ data: null, error: 'CONTEST_HAS_REGISTRATIONS', requestId: c.get('requestId') }, 409);
  }

  await executeMutation(db, 'DELETE FROM contest_age_categories WHERE contest_id = ?', [contestId]);
  await executeMutation(db, 'DELETE FROM contest_weight_classes WHERE contest_id = ?', [contestId]);
  await seedContestCategories(db, contestId);

  const [ageCategories, weightClasses] = await Promise.all([
    listContestAgeCategories(db, contestId),
    listContestWeightClasses(db, contestId),
  ]);

  return c.json({
    data: convertKeysToCamelCase({ ageCategories, weightClasses }),
    error: null,
    requestId: c.get('requestId'),
  }, 201);
});

export default categories;

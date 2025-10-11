import { Hono } from 'hono';
import type { WerewolfEnvironment } from '../env';
import { convertKeysToCamelCase } from '../utils/database';
import {
  DEFAULT_CONTEST_AGE_CATEGORY_TEMPLATES,
  DEFAULT_CONTEST_WEIGHT_CLASS_TEMPLATES,
} from '@werewolf/domain/constants/categories';

const reference = new Hono<WerewolfEnvironment>();

// GET /reference/weight-classes - List all weight classes
reference.get('/weight-classes', async (c) => {
  return c.json({
    data: convertKeysToCamelCase(
      DEFAULT_CONTEST_WEIGHT_CLASS_TEMPLATES.map((item) => ({
        id: item.code,
        code: item.code,
        name: item.name,
        gender: item.gender,
        min_weight: item.minWeight,
        max_weight: item.maxWeight,
        sort_order: item.sortOrder,
      }))
    ),
    error: null,
    requestId: c.get('requestId'),
  });
});

// GET /reference/age-categories - List all age categories
reference.get('/age-categories', async (c) => {
  return c.json({
    data: convertKeysToCamelCase(
      DEFAULT_CONTEST_AGE_CATEGORY_TEMPLATES.map((item) => ({
        id: item.code,
        code: item.code,
        name: item.name,
        min_age: item.minAge,
        max_age: item.maxAge,
        sort_order: item.sortOrder,
      }))
    ),
    error: null,
    requestId: c.get('requestId'),
  });
});

export default reference;

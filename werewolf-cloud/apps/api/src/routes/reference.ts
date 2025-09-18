import { Hono } from 'hono';
import type { WerewolfEnvironment } from '../env';
import { executeQuery, convertKeysToCamelCase } from '../utils/database';

const reference = new Hono<WerewolfEnvironment>();

// GET /reference/weight-classes - List all weight classes
reference.get('/weight-classes', async (c) => {
  const db = c.env.DB;

  const weightClasses = await executeQuery(
    db,
    `
    SELECT id, gender, name, weight_min, weight_max
    FROM weight_classes
    ORDER BY gender ASC, weight_min ASC
    `
  );

  return c.json({
    data: convertKeysToCamelCase(weightClasses),
    error: null,
    requestId: c.get('requestId'),
  });
});

// GET /reference/age-categories - List all age categories
reference.get('/age-categories', async (c) => {
  const db = c.env.DB;

  const ageCategories = await executeQuery(
    db,
    `
    SELECT id, name, min_age, max_age
    FROM age_categories
    ORDER BY min_age ASC
    `
  );

  return c.json({
    data: convertKeysToCamelCase(ageCategories),
    error: null,
    requestId: c.get('requestId'),
  });
});

export default reference;

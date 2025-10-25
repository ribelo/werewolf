import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { WerewolfEnvironment } from '../env';
import {
  executeMutation,
  executeQueryOne,
  convertKeysToCamelCase,
  generateId,
  getCurrentTimestamp,
} from '../utils/database';
import {
  listContestTags,
  seedContestTags,
  MANDATORY_TAG_LABEL,
  removeContestTag,
  renameContestTag,
} from '../utils/tags';

export const contestTags = new Hono<WerewolfEnvironment>();

const createSchema = z.object({
  label: z.string().trim().min(1).max(64),
});

const updateSchema = z.object({
  label: z.string().trim().min(1).max(64).optional(),
});

contestTags.get('/', async (c) => {
  const db = c.env.DB;
  const contestId = c.req.param('contestId');

  if (!contestId) {
    return c.json({ data: null, error: 'Contest ID is required', requestId: c.get('requestId') }, 400);
  }

  const tags = await listContestTags(db, contestId);

  return c.json({
    data: convertKeysToCamelCase(tags),
    error: null,
    requestId: c.get('requestId'),
  });
});

contestTags.post('/', zValidator('json', createSchema), async (c) => {
  const db = c.env.DB;
  const contestId = c.req.param('contestId');
  const { label } = c.req.valid('json');

  if (!contestId) {
    return c.json({ data: null, error: 'Contest ID is required', requestId: c.get('requestId') }, 400);
  }

  await seedContestTags(db, contestId);

  const existing = await executeQueryOne<{ id: string }>(
    db,
    'SELECT id FROM contest_tags WHERE contest_id = ? AND label = ?',
    [contestId, label]
  );

  if (existing) {
    return c.json({ data: null, error: 'Tag already exists for contest', requestId: c.get('requestId') }, 409);
  }

  const id = generateId();
  const timestamp = getCurrentTimestamp();

  await executeMutation(
    db,
    `INSERT INTO contest_tags (id, contest_id, label, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)` ,
    [id, contestId, label, timestamp, timestamp]
  );

  const tag = await executeQueryOne(
    db,
    `SELECT id, contest_id, label, created_at, updated_at
     FROM contest_tags WHERE id = ?`,
    [id]
  );

  return c.json({
    data: convertKeysToCamelCase(tag),
    error: null,
    requestId: c.get('requestId'),
  }, 201);
});

contestTags.patch('/:tagId', zValidator('json', updateSchema), async (c) => {
  const db = c.env.DB;
  const contestId = c.req.param('contestId');
  const tagId = c.req.param('tagId');
  const input = c.req.valid('json');

  if (!contestId || !tagId) {
    return c.json({ data: null, error: 'Contest and tag IDs are required', requestId: c.get('requestId') }, 400);
  }

  const existing = await executeQueryOne<{ id: string; label: string }>(
    db,
    'SELECT id, label FROM contest_tags WHERE contest_id = ? AND id = ?',
    [contestId, tagId]
  );

  if (!existing) {
    return c.json({ data: null, error: 'Tag not found', requestId: c.get('requestId') }, 404);
  }

  let labelChanged = false;

  if (input.label !== undefined && input.label !== existing.label) {
    if (existing.label === MANDATORY_TAG_LABEL) {
      return c.json({ data: null, error: 'The Open tag cannot be renamed', requestId: c.get('requestId') }, 400);
    }

    const duplicate = await executeQueryOne<{ id: string }>(
      db,
      'SELECT id FROM contest_tags WHERE contest_id = ? AND label = ? AND id <> ?',
      [contestId, input.label, tagId]
    );

    if (duplicate) {
      return c.json({ data: null, error: 'Another tag already uses this label', requestId: c.get('requestId') }, 409);
    }

    labelChanged = true;
  }

  if (!labelChanged) {
    return c.json({ data: null, error: 'No changes detected', requestId: c.get('requestId') }, 400);
  }

  await renameContestTag(db, contestId, tagId, existing.label, input.label!);

  const refreshed = await executeQueryOne(
    db,
    `SELECT id, contest_id, label, created_at, updated_at
     FROM contest_tags WHERE contest_id = ? AND id = ?`,
    [contestId, tagId]
  );

  return c.json({
    data: convertKeysToCamelCase(refreshed),
    error: null,
    requestId: c.get('requestId'),
  });
});

contestTags.delete('/:tagId', async (c) => {
  const db = c.env.DB;
  const contestId = c.req.param('contestId');
  const tagId = c.req.param('tagId');

  if (!contestId || !tagId) {
    return c.json({ data: null, error: 'Contest and tag IDs are required', requestId: c.get('requestId') }, 400);
  }

  const existing = await executeQueryOne<{ id: string; label: string }>(
    db,
    'SELECT id, label FROM contest_tags WHERE contest_id = ? AND id = ?',
    [contestId, tagId]
  );

  if (!existing) {
    return c.json({ data: null, error: 'Tag not found', requestId: c.get('requestId') }, 404);
  }

  if (existing.label === MANDATORY_TAG_LABEL) {
    return c.json({ data: null, error: 'The Open tag cannot be deleted', requestId: c.get('requestId') }, 400);
  }

  await removeContestTag(db, contestId, tagId, existing.label);

  return c.json({
    data: { success: true },
    error: null,
    requestId: c.get('requestId'),
  });
});

export default contestTags;

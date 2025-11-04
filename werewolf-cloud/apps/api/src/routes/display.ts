import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { WerewolfEnvironment } from '../env';
import { publishEvent } from '../live/publish';
import {
  displayFilterSyncSchema,
  displayQrVisibilitySchema,
  type DisplayFilterSync,
  type DisplayQrVisibility,
} from '@werewolf/domain';

export const contestDisplay = new Hono<WerewolfEnvironment>();

const KV_KEY_PREFIX = 'displaySync:';

contestDisplay.post(
  '/sync',
  zValidator('json', displayFilterSyncSchema),
  async (c) => {
    const contestId = c.req.param('contestId');
    if (!contestId) {
      return c.json(
        {
          data: null,
          error: 'Contest ID is required',
        },
        400
      );
    }
    const payload = c.req.valid('json');

    // Persist to KV for GET endpoint
    try {
      const kvKey = `${KV_KEY_PREFIX}${contestId}`;
      await c.env.KV.put(kvKey, JSON.stringify(payload));
    } catch (error) {
      console.error('Failed to persist display sync to KV:', error);
      // Continue with event publishing even if KV fails
    }

    await publishEvent(c.env, contestId, {
      type: 'display.filtersSynced',
      payload,
    });

    return c.json({
      data: { ok: true, id: payload.id },
      error: null,
    });
  }
);

contestDisplay.post(
  '/qr',
  zValidator('json', displayQrVisibilitySchema),
  async (c) => {
    const contestId = c.req.param('contestId');
    if (!contestId) {
      return c.json(
        {
          data: null,
          error: 'Contest ID is required',
        },
        400
      );
    }

    const payload = c.req.valid('json') as DisplayQrVisibility;

    await publishEvent(c.env, contestId, {
      type: 'display.qrVisibility',
      payload,
    });

    return c.json({
      data: { ok: true, action: payload.action },
      error: null,
    });
  }
);

contestDisplay.get(
  '/sync',
  async (c) => {
    const contestId = c.req.param('contestId');
    if (!contestId) {
      return c.json(
        {
          data: null,
          error: 'Contest ID is required',
        },
        400
      );
    }

    try {
      const kvKey = `${KV_KEY_PREFIX}${contestId}`;
      const value = await c.env.KV.get(kvKey);
      
      if (!value) {
        return new Response(null, { status: 204 });
      }

      const payload: DisplayFilterSync = JSON.parse(value);
      return c.json({ data: payload, error: null });
    } catch (error) {
      console.error('Failed to fetch display sync from KV:', error);
      return c.json(
        {
          data: null,
          error: 'Failed to fetch sync data',
        },
        500
      );
    }
  }
);

export default contestDisplay;

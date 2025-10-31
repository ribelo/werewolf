import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { WerewolfEnvironment } from '../env';
import { publishEvent } from '../live/publish';
import { displayFilterSyncSchema } from '@werewolf/domain';

export const contestDisplay = new Hono<WerewolfEnvironment>();

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

export default contestDisplay;

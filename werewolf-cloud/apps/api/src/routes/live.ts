import { Hono } from 'hono';
import type { WerewolfEnvironment } from '../env';

const live = new Hono<WerewolfEnvironment>();

// WebSocket join endpoint: forwards the upgrade to the Durable Object instance for this contest
live.get('/ws/contests/:contestId', async (c) => {
  const contestId = c.req.param('contestId');
  const namespace = c.env['werewolf-contest-room'];
  const id = namespace.idFromName(contestId);
  const stub = namespace.get(id);
  // Forward the original request (including Upgrade) to the DO
  return await stub.fetch(c.req.raw);
});

export default live;

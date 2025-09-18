import type { MiddlewareHandler } from 'hono';
import type { WerewolfEnvironment } from '../env';

export const requestLogger: MiddlewareHandler<WerewolfEnvironment> = async (c, next) => {
  const start = Date.now();
  c.set('startedAt', start);
  c.set('requestId', crypto.randomUUID());

  await next();

  const duration = Date.now() - start;
  const { method, url } = c.req;
  console.log(`${method} ${url} -> ${c.res.status} (${duration}ms) [${c.get('requestId')}]`);
};

import type { Handler } from 'hono';
import { notImplemented } from '../http/errors';
import type { WerewolfEnvironment } from '../env';

export const todo = (feature: string): Handler<WerewolfEnvironment> => (c) => {
  throw notImplemented(feature);
};

import type { ErrorHandler } from 'hono';
import type { ContentfulStatusCode, StatusCode } from 'hono/utils/http-status';
import { ApiError } from '../http/errors';
import type { WerewolfEnvironment } from '../env';

const isStatusCode = (value: number): value is StatusCode => value >= 100 && value <= 599;
const isContentfulStatusCode = (value: number): value is ContentfulStatusCode => value >= 200 && value <= 599;

export const errorHandler: ErrorHandler<WerewolfEnvironment> = (err, c) => {
  const requestId = c.get('requestId');

  if (err instanceof ApiError) {
    const status: ContentfulStatusCode = isContentfulStatusCode(err.status) ? err.status : 500;

    return c.json({
      data: null,
      error: err.message,
      details: err.details,
      requestId,
    }, status);
  }

  console.error('Unhandled error', {
    requestId,
    message: err.message,
    stack: err.stack,
  });

  return c.json({
    data: null,
    error: 'Internal Server Error',
    requestId,
  }, 500);
};

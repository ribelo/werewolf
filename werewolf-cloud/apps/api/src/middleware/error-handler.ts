import type { ErrorHandler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { HTTPException } from 'hono/http-exception';
import { ApiError } from '../http/errors';
import type { WerewolfEnvironment } from '../env';

const MALFORMED_JSON_ERROR = 'Invalid JSON in request body';

const isErrorStatusCode = (value: number): value is ContentfulStatusCode => value >= 400 && value <= 599;

const isMalformedJsonError = (err: Error): boolean => err.message.includes('Malformed JSON');

export const errorHandler: ErrorHandler<WerewolfEnvironment> = (err, c) => {
  const requestId = c.get('requestId');

  if (err instanceof ApiError) {
    const status: ContentfulStatusCode = isErrorStatusCode(err.status) ? err.status : 500;

    return c.json({
      data: null,
      error: err.message,
      details: err.details,
      requestId,
    }, status);
  }

  if (err instanceof HTTPException) {
    if (err.res) {
      return err.res;
    }

    return c.json({
      data: null,
      error: isMalformedJsonError(err) ? MALFORMED_JSON_ERROR : err.message,
      requestId,
    }, err.status);
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

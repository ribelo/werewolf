import type { MiddlewareHandler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { WerewolfEnvironment } from '../env';

type ZodIssueShape = {
  path?: unknown;
  message?: unknown;
};

type ZodErrorShape = {
  success: false;
  error: {
    issues: ZodIssueShape[];
  };
};

type JsonResponder = (
  object: unknown,
  status?: ContentfulStatusCode,
  headers?: Record<string, string>,
) => Response;

const isZodIssue = (value: unknown): value is ZodIssueShape =>
  typeof value === 'object' && value !== null && 'path' in value && 'message' in value;

const isZodErrorShape = (value: unknown): value is ZodErrorShape => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as { success?: unknown; error?: unknown };

  if (candidate.success !== false || typeof candidate.error !== 'object' || candidate.error === null) {
    return false;
  }

  const issues = (candidate.error as { issues?: unknown }).issues;

  return Array.isArray(issues) && issues.length > 0 && issues.every(isZodIssue);
};

const formatIssues = (issues: readonly ZodIssueShape[]): string =>
  issues
    .map((issue) => {
      const path = Array.isArray(issue.path) ? issue.path.map(String).join('.') : '';
      const message = typeof issue.message === 'string' ? issue.message : 'Invalid value';

      return path.length > 0 ? `${path}: ${message}` : message;
    })
    .join(', ');

/**
 * zValidator answers an invalid payload with the raw ZodError. This middleware
 * swaps that answer for the standard envelope by wrapping the context's json
 * responder, so the body is never read twice and valid responses pass through
 * untouched.
 */
export const validationEnvelope: MiddlewareHandler<WerewolfEnvironment> = async (c, next) => {
  const json = c.json as unknown as JsonResponder;

  c.json = ((object: unknown, status?: ContentfulStatusCode, headers?: Record<string, string>) => {
    if (status === 400 && isZodErrorShape(object)) {
      return json(
        {
          data: null,
          error: `Validation failed: ${formatIssues(object.error.issues)}`,
          requestId: c.get('requestId'),
        },
        400,
        headers,
      );
    }

    return json(object, status, headers);
  }) as unknown as typeof c.json;

  await next();
};

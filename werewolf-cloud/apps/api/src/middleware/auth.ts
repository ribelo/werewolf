import type { MiddlewareHandler } from 'hono';
import { getCookie, deleteCookie } from 'hono/cookie';
import type { WerewolfEnvironment } from '../env';
import {
  SESSION_COOKIE_NAME,
  getSession,
  refreshSession,
} from '../auth/session';

/**
 * Reads that the sign-in page, the public display pages and the public results
 * page perform before an organizer session exists. Every other GET/HEAD needs a
 * session; ':segment' matches exactly one non-empty path segment.
 */
const PUBLIC_READ_ROUTES = [
  '/system/health',
  '/contests/:contestId',
  '/contests/:contestId/registrations',
  '/contests/:contestId/attempts',
  '/contests/:contestId/attempts/current',
  '/contests/:contestId/categories',
  '/contests/:contestId/platesets',
  '/contests/:contestId/display/sync',
  '/contests/:contestId/results/public-bundle',
  '/ws/contests/:contestId',
] as const;

const PUBLIC_PATH_PREFIXES = ['/auth'] as const;

const PUBLIC_EXACT_PATHS = ['/', '/health'] as const;

const READ_METHODS = new Set(['GET', 'HEAD']);

const splitPath = (path: string): string[] => path.split('/').filter((segment) => segment.length > 0);

const matchesRoute = (pattern: string, path: string): boolean => {
  const patternSegments = splitPath(pattern);
  const pathSegments = splitPath(path);

  if (patternSegments.length !== pathSegments.length) {
    return false;
  }

  return patternSegments.every((segment, index) => {
    const pathSegment = pathSegments[index] ?? '';
    return segment.startsWith(':') ? pathSegment.length > 0 : segment === pathSegment;
  });
};

const isPublicRoute = (method: string, path: string): boolean => {
  if (PUBLIC_EXACT_PATHS.some((exact) => exact === path)) {
    return true;
  }

  if (PUBLIC_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    return true;
  }

  if (method === 'OPTIONS') {
    return true;
  }

  if (!READ_METHODS.has(method)) {
    return false;
  }

  return PUBLIC_READ_ROUTES.some((route) => matchesRoute(route, path));
};

export const requireAuth: MiddlewareHandler<WerewolfEnvironment> = async (c, next) => {
  if (c.env.ENV === 'test') {
    return next();
  }

  if (isPublicRoute(c.req.method, c.req.path)) {
    return next();
  }

  const sessionId = getCookie(c, SESSION_COOKIE_NAME);

  if (!sessionId) {
    return c.json({
      data: null,
      error: 'Authentication required',
      requestId: c.get('requestId'),
    }, 401);
  }

  const session = await getSession(c.env, sessionId);

  if (!session) {
    const isProduction = c.env.ENV === 'production';
    deleteCookie(c, SESSION_COOKIE_NAME, {
      path: '/',
      secure: isProduction,
      sameSite: isProduction ? 'None' : 'Lax',
    });

    return c.json({
      data: null,
      error: 'Session expired',
      requestId: c.get('requestId'),
    }, 401);
  }

  const userAgent = c.req.header('User-Agent');
  const ip = c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For');
  const sessionContext: { userAgent?: string; ip?: string } = {};
  if (userAgent) {
    sessionContext.userAgent = userAgent;
  }
  if (ip) {
    sessionContext.ip = ip;
  }
  await refreshSession(c.env, session, sessionContext).catch(() => {});

  c.set('sessionId', session.id);

  return next();
};

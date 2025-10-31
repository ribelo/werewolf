import type { MiddlewareHandler } from 'hono';
import { getCookie, deleteCookie } from 'hono/cookie';
import type { WerewolfEnvironment } from '../env';
import {
  SESSION_COOKIE_NAME,
  deleteSession,
  getSession,
  refreshSession,
} from '../auth/session';

const isSafeMethod = (method: string) =>
  method === 'GET' || method === 'HEAD' || method === 'OPTIONS';

const isExcludedPath = (path: string) => {
  if (path === '/' || path === '/health') {
    return true;
  }

  if (path.startsWith('/auth')) {
    return true;
  }

  return false;
};

export const requireAuth: MiddlewareHandler<WerewolfEnvironment> = async (c, next) => {
  const method = c.req.method;
  const path = c.req.path;

  if (c.env.ENV === 'test') {
    return next();
  }

  if (isSafeMethod(method) || isExcludedPath(path)) {
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

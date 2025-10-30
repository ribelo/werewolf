import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { setCookie, deleteCookie, getCookie } from 'hono/cookie';
import type { WerewolfEnvironment } from '../env';
import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  createSession,
  deleteSession,
  getSession,
  refreshSession,
} from '../auth/session';
import { ApiError } from '../http/errors';

const auth = new Hono<WerewolfEnvironment>();

const loginSchema = z.object({
  password: z.string().min(1),
});

const timingSafeEqual = (a: string, b: string) => {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  const length = Math.max(aBytes.length, bBytes.length);
  let mismatch = aBytes.length ^ bBytes.length;

  for (let i = 0; i < length; i++) {
    const aByte = aBytes[i % aBytes.length];
    const bByte = bBytes[i % bBytes.length];
    mismatch |= aByte ^ bByte;
  }

  return mismatch === 0;
};

const isWriteMethod = (method: string) =>
  method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';

const cookieOptions = (isProduction: boolean) => ({
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? 'None' as const : 'Lax' as const,
  path: '/',
  maxAge: SESSION_TTL_SECONDS,
});

auth.post('/login', zValidator('json', loginSchema), async (c) => {
  const { password } = c.req.valid('json');
  const expectedPassword = c.env.ADMIN_PASSWORD;

  if (!expectedPassword) {
    throw new ApiError('Admin password is not configured', 500);
  }

  if (!timingSafeEqual(password, expectedPassword)) {
    return c.json({
      data: { authenticated: false },
      error: 'Invalid credentials',
      requestId: c.get('requestId'),
    }, 401);
  }

  const existingSessionId = getCookie(c, SESSION_COOKIE_NAME);
  if (existingSessionId) {
    await deleteSession(c.env, existingSessionId).catch(() => {});
  }

  const userAgent = c.req.header('User-Agent');
  const ip = c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For');
  const session = await createSession(c.env, { userAgent, ip });

  const isProduction = c.env.ENV === 'production';
  setCookie(c, SESSION_COOKIE_NAME, session.id, cookieOptions(isProduction));

  return c.json({
    data: { authenticated: true },
    error: null,
    requestId: c.get('requestId'),
  });
});

auth.post('/logout', async (c) => {
  const sessionId = getCookie(c, SESSION_COOKIE_NAME);
  if (sessionId) {
    await deleteSession(c.env, sessionId).catch(() => {});
  }

  const isProduction = c.env.ENV === 'production';
  deleteCookie(c, SESSION_COOKIE_NAME, {
    path: '/',
    secure: isProduction,
    sameSite: isProduction ? 'None' : 'Lax',
  });

  return c.json({
    data: { authenticated: false },
    error: null,
    requestId: c.get('requestId'),
  });
});

auth.get('/session', async (c) => {
  const sessionId = getCookie(c, SESSION_COOKIE_NAME);
  if (!sessionId) {
    return c.json({
      data: { authenticated: false },
      error: null,
      requestId: c.get('requestId'),
    });
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
      data: { authenticated: false },
      error: null,
      requestId: c.get('requestId'),
    });
  }

  const userAgent = c.req.header('User-Agent');
  const ip = c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For');

  await refreshSession(c.env, session, { userAgent, ip }).catch(() => {});

  const isProduction = c.env.ENV === 'production';
  setCookie(c, SESSION_COOKIE_NAME, session.id, cookieOptions(isProduction));

  return c.json({
    data: { authenticated: true },
    error: null,
    requestId: c.get('requestId'),
  });
});

auth.all('*', (c) => {
  if (isWriteMethod(c.req.method)) {
    return c.json({
      data: null,
      error: 'Method Not Allowed',
      requestId: c.get('requestId'),
    }, 405);
  }

  return c.json({
    data: null,
    error: 'Not found',
    requestId: c.get('requestId'),
  }, 404);
});

export default auth;

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { registerRoutes } from './routes';
import { requestLogger } from './middleware/request-logger';
import { errorHandler } from './middleware/error-handler';
import { validationEnvelope } from './middleware/validation-envelope';
import { requireAuth } from './middleware/auth';
import type { WerewolfEnvironment } from './env';

export const createApp = () => {
  const app = new Hono<WerewolfEnvironment>();

  app.use('*', requestLogger);
  app.use(
    '*',
    cors({
      origin: (origin, c) => {
        if (!origin) {
          return undefined;
        }

        const allowedOrigins = new Set([
          'http://localhost:5173',
          'http://127.0.0.1:5173',
          'http://localhost:4173',
          'http://127.0.0.1:4173',
          'https://werewolf.pages.dev',
          'https://werewolf.r-krzywaznia-2c4.workers.dev',
        ]);

        if (allowedOrigins.has(origin)) {
          return origin;
        }

        try {
          const requestUrl = new URL(c.req.url);
          const sameOrigin = `${requestUrl.protocol}//${requestUrl.host}`;
          if (origin === sameOrigin) {
            return origin;
          }
        } catch {
          // ignore URL parsing errors
        }

        return undefined;
      },
      allowHeaders: ['Content-Type', 'Authorization'],
      allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      exposeHeaders: ['Content-Length', 'Content-Type', 'Request-Id'],
      maxAge: 600,
      credentials: true,
    }),
  );
  app.use('*', validationEnvelope);

  app.onError(errorHandler);

  app.get('/', (c) =>
    c.json({
      data: {
        service: 'werewolf-api',
        version: '0.0.0',
        env: c.env.ENV,
      },
      error: null,
      requestId: c.get('requestId'),
    }),
  );

  app.get('/health', (c) =>
    c.json({
      data: {
        status: 'ok',
        timestamp: new Date().toISOString(),
      },
      error: null,
      requestId: c.get('requestId'),
    }),
  );

  app.use('*', requireAuth);

  registerRoutes(app);

  // Catch-all route for 404s - must be last
  app.all('*', (c) => {
    return c.json({
      data: null,
      error: 'Not found',
      requestId: c.get('requestId'),
    }, 404);
  });

  return app;
};

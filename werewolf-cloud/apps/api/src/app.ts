import { Hono } from 'hono';
import { registerRoutes } from './routes';
import { requestLogger } from './middleware/request-logger';
import { errorHandler } from './middleware/error-handler';
import type { WerewolfEnvironment } from './env';
import { requireAuth } from './middleware/auth';
import { cors } from 'hono/cors';

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

  // Middleware to intercept and reformat zValidator responses
  app.use('*', async (c, next) => {
    await next();

    // Check if this is a zValidator error response
    if (c.res.status === 400) {
      try {
        type ZValidatorError = {
          success?: boolean;
          error?: {
            issues?: Array<{ path: (string | number)[]; message: string }>;
          };
        };

        const body = (await c.res.clone().json()) as unknown as ZValidatorError;

        if (
          body &&
          body.success === false &&
          Array.isArray(body.error?.issues)
        ) {
          const requestId = c.get('requestId');
          const errorMessage = body.error.issues
            .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
            .join(', ');

          c.res = new Response(JSON.stringify({
            data: null,
            error: `Validation failed: ${errorMessage}`,
            requestId,
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      } catch (error) {
        // Not a JSON response or not a zValidator error, leave as-is
        if (error instanceof Error && !error.message.includes('Unexpected end of JSON')) {
          console.warn('Failed to normalise validation error response:', error.message);
        }
      }
    }
  });

  // Custom error handler for other errors
  app.onError(async (err, c) => {
    const requestId = c.get('requestId');

    // Handle JSON parsing errors
    if (err.message && err.message.includes('Malformed JSON')) {
      return c.json({
        data: null,
        error: 'Invalid JSON in request body',
        requestId,
      }, 400);
    }

    // Handle other errors with the standard error handler
    return errorHandler(err, c);
  });

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

  app.onError(errorHandler);

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

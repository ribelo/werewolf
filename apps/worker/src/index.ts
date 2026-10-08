import { formatVersion } from '@werewolf/core'
import * as Data from 'effect/Data'
import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'
import {
  clearSession,
  hasSession,
  passwordMatches,
  sessionCookie,
  AuthEnv,
  type SessionCryptoError,
} from './auth.ts'

export interface Env extends AuthEnv {
  readonly ASSETS: Fetcher
}

class InvalidRequest extends Data.TaggedError('InvalidRequest')<{ readonly cause: unknown }> {
  override readonly message = 'Request body is invalid'
}
class WorkerFailure extends Data.TaggedError('WorkerFailure')<{ readonly cause: unknown }> {
  override readonly message = 'Worker adapter failed'
}
const Login = Schema.Struct({ password: Schema.NonEmptyString })

function route(
  request: Request,
  env: Env,
): Effect.Effect<Response, InvalidRequest | WorkerFailure | SessionCryptoError> {
  return Effect.gen(function* () {
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/api/'))
      return yield* Effect.tryPromise({
        try: () => env.ASSETS.fetch(request),
        catch: (cause) => new WorkerFailure({ cause }),
      })
    if (
      request.method !== 'GET' &&
      request.headers.has('Origin') &&
      request.headers.get('Origin') !== url.origin
    )
      return Response.json({ error: 'auth.origin' }, { status: 403 })
    if (url.pathname === '/api/health')
      return Response.json({ status: 'ok', application: 'WerewolfV2', formatVersion })
    const auth = yield* Schema.decodeEffect(AuthEnv)(env).pipe(
      Effect.mapError((cause) => new WorkerFailure({ cause })),
    )
    if (url.pathname === '/api/session' && request.method === 'POST') {
      const raw = yield* Effect.tryPromise({
        try: () => request.json(),
        catch: (cause) => new InvalidRequest({ cause }),
      })
      const body = yield* Schema.decodeUnknownEffect(Login)(raw).pipe(
        Effect.mapError((cause) => new InvalidRequest({ cause })),
      )
      if (!(yield* passwordMatches(body.password, auth.ORGANIZER_PASSWORD)))
        return Response.json({ error: 'auth.invalid' }, { status: 401 })
      return Response.json(
        { authenticated: true },
        {
          headers: {
            'Set-Cookie': yield* sessionCookie(request, auth),
            'Cache-Control': 'no-store',
          },
        },
      )
    }
    if (url.pathname === '/api/session' && request.method === 'DELETE')
      return Response.json(
        { authenticated: false },
        { headers: { 'Set-Cookie': clearSession(request), 'Cache-Control': 'no-store' } },
      )
    const authenticated = yield* hasSession(request, auth)
    if (url.pathname === '/api/session' && request.method === 'GET')
      return Response.json({ authenticated }, { headers: { 'Cache-Control': 'no-store' } })
    if (!authenticated) return Response.json({ error: 'auth.required' }, { status: 401 })
    if (url.pathname === '/api/contests' && request.method === 'GET')
      return Response.json({ contests: [] })
    return Response.json({ error: 'request.notFound' }, { status: 404 })
  })
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return route(request, env).pipe(
      Effect.catchTags({
        InvalidRequest: () =>
          Effect.succeed(Response.json({ error: 'request.invalid' }, { status: 400 })),
        WorkerFailure: () =>
          Effect.succeed(Response.json({ error: 'request.failed' }, { status: 500 })),
        SessionCryptoError: () =>
          Effect.succeed(Response.json({ error: 'request.failed' }, { status: 500 })),
      }),
      Effect.runPromise,
    )
  },
}

import { formatVersion } from '@werewolf/core'
import { ContestDefinition, ContestId, Snapshot } from '@werewolf/sync'
import { editorHeader } from './contest-do.ts'
export { ContestDO, ContestCatalogDO } from './contest-do.ts'
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
  readonly CONTESTS: DurableObjectNamespace
  readonly CATALOG: DurableObjectNamespace
  readonly BACKUPS: R2Bucket
}

class InvalidRequest extends Data.TaggedError('InvalidRequest')<{ readonly cause: unknown }> {
  override readonly message = 'Request body is invalid'
}
class WorkerFailure extends Data.TaggedError('WorkerFailure')<{ readonly cause: unknown }> {
  override readonly message = 'Worker adapter failed'
}
const Login = Schema.Struct({ password: Schema.NonEmptyString })

/** Send a validated backup to the contest actor and list the contest in the catalog. */
function restoreInto(
  env: Env,
  origin: string,
  headers: Headers,
  id: string,
  backup: Snapshot,
): Effect.Effect<Response, WorkerFailure> {
  return Effect.gen(function* () {
    const restored = yield* Effect.tryPromise({
      try: () =>
        env.CONTESTS.getByName(id).fetch(
          new Request(origin + '/api/contests/' + id + '/restore', {
            method: 'POST',
            headers,
            body: JSON.stringify(backup),
          }),
        ),
      catch: (cause) => new WorkerFailure({ cause }),
    })
    if (!restored.ok) return restored
    const summary = {
      id: backup.definition.id,
      name: backup.definition.name,
      date: backup.definition.date,
    }
    const registered = yield* Effect.tryPromise({
      try: () =>
        env.CATALOG.getByName('all').fetch(
          new Request(origin + '/api/contests', {
            method: 'POST',
            headers,
            body: JSON.stringify(summary),
          }),
        ),
      catch: (cause) => new WorkerFailure({ cause }),
    })
    return registered.ok ? restored : registered
  })
}

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
      (request.method !== 'GET' || request.headers.get('Upgrade')?.toLowerCase() === 'websocket') &&
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
    const headers = new Headers(request.headers)
    headers.delete(editorHeader)
    if (authenticated && !url.searchParams.has('token')) headers.set(editorHeader, '1')
    const contestPath = new RegExp(
      '^/api/contests/([^/]+)/(snapshot|events|commands|links|backup|restore)$',
    ).exec(url.pathname)
    if (contestPath) {
      const id = yield* Schema.decodeUnknownEffect(ContestId)(contestPath[1]).pipe(
        Effect.mapError((cause) => new InvalidRequest({ cause })),
      )
      if (contestPath[2] === 'restore' && request.method === 'POST') {
        if (!authenticated) return Response.json({ error: 'auth.required' }, { status: 401 })
        const input = yield* Effect.tryPromise({
          try: () => request.json(),
          catch: (cause) => new InvalidRequest({ cause }),
        })
        const backup = yield* Schema.decodeUnknownEffect(Snapshot)(input).pipe(
          Effect.mapError((cause) => new InvalidRequest({ cause })),
        )
        return yield* restoreInto(env, url.origin, headers, id, {
          ...backup,
          definition: { ...backup.definition, id },
        })
      }
      return yield* Effect.tryPromise({
        try: () => env.CONTESTS.getByName(id).fetch(new Request(request, { headers })),
        catch: (cause) => new WorkerFailure({ cause }),
      })
    }
    if (!authenticated) return Response.json({ error: 'auth.required' }, { status: 401 })
    if (url.pathname === '/api/restore' && request.method === 'POST') {
      // A backup restored into a new contest gets a new identifier, so it never overwrites another contest.
      const input = yield* Effect.tryPromise({
        try: () => request.json(),
        catch: (cause) => new InvalidRequest({ cause }),
      })
      const backup = yield* Schema.decodeUnknownEffect(Snapshot)(input).pipe(
        Effect.mapError((cause) => new InvalidRequest({ cause })),
      )
      const id = crypto.randomUUID()
      return yield* restoreInto(env, url.origin, headers, id, {
        ...backup,
        definition: { ...backup.definition, id: Schema.decodeSync(ContestId)(id) },
      })
    }
    if (url.pathname === '/api/contests' && request.method === 'GET')
      return yield* Effect.tryPromise({
        try: () => env.CATALOG.getByName('all').fetch(new Request(request, { headers })),
        catch: (cause) => new WorkerFailure({ cause }),
      })
    if (url.pathname === '/api/contests' && request.method === 'POST') {
      const input = yield* Effect.tryPromise({
        try: () => request.json(),
        catch: (cause) => new InvalidRequest({ cause }),
      })
      const definition = yield* Schema.decodeUnknownEffect(ContestDefinition)(input).pipe(
        Effect.mapError((cause) => new InvalidRequest({ cause })),
      )
      const created = yield* Effect.tryPromise({
        try: () =>
          env.CONTESTS.getByName(definition.id).fetch(
            new Request(url.origin + '/api/contests/' + definition.id + '/create', {
              method: 'POST',
              headers,
              body: JSON.stringify(definition),
            }),
          ),
        catch: (cause) => new WorkerFailure({ cause }),
      })
      if (!created.ok) return created
      const raw = yield* Effect.tryPromise({
        try: () => created.clone().json(),
        catch: (cause) => new WorkerFailure({ cause }),
      })
      const snapshot = yield* Schema.decodeUnknownEffect(Snapshot)(raw).pipe(
        Effect.mapError((cause) => new WorkerFailure({ cause })),
      )
      const summary = {
        id: snapshot.definition.id,
        name: snapshot.definition.name,
        date: snapshot.definition.date,
      }
      const registered = yield* Effect.tryPromise({
        try: () =>
          env.CATALOG.getByName('all').fetch(
            new Request(url.origin + '/api/contests', {
              method: 'POST',
              headers,
              body: JSON.stringify(summary),
            }),
          ),
        catch: (cause) => new WorkerFailure({ cause }),
      })
      return registered.ok ? created : registered
    }
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

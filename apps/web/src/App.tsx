// ADR 0004 requires Effect Atom. Pin its version because the API is unstable.
// @effect-diagnostics unstableApiUsage:off
import * as Atom from 'effect/reactivity/Atom'
import { useAtom } from '@effect/atom-react'
import * as Schema from 'effect/Schema'
import * as Data from 'effect/Data'
import * as Effect from 'effect/Effect'
import * as Fiber from 'effect/Fiber'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import { useEffect, useState, type FormEvent } from 'react'
import { useMessages, type MessageKey } from './i18n.ts'
import { ContestCatalog } from './ContestCatalog.tsx'
import { ContestDesk } from './ContestDesk.tsx'
import { ViewerScreen } from './ViewerScreen.tsx'
import { ContestId } from '@werewolf/sync'
import { requestJson } from './live-contest.ts'
import { hasEditorGrant, readReplica, setEditorGrant } from './replica-store.ts'

class ShellCacheUnavailable extends Data.TaggedError('ShellCacheUnavailable')<{
  readonly cause: unknown
}> {
  override readonly message = 'Offline shell cache unavailable'
}
const Session = Schema.Struct({ authenticated: Schema.Boolean })
type Auth =
  | { readonly _tag: 'Checking' | 'Guest' | 'Editor' }
  | { readonly _tag: 'OfflineEditor'; readonly id: ContestId }
const authAtom = Atom.make<Auth>({ _tag: 'Checking' })

export function App() {
  const { locale, setLocale, t } = useMessages()
  const viewPath = new RegExp('^/view/([^/]+)/(stage|announcer|results)$').exec(location.pathname)
  const viewerId = Schema.decodeUnknownResult(ContestId)(viewPath?.[1])
  const [deskId] = useState(() =>
    Schema.decodeUnknownResult(ContestId)(
      new RegExp('^/desk/([^/]+)$').exec(location.pathname)?.[1],
    ),
  )
  const token = new URL(location.href).searchParams.get('token')
  const isViewer = Result.isSuccess(viewerId) && !!token
  const [auth, setAuth] = useAtom(authAtom)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<MessageKey | ''>('')
  const [pending, setPending] = useState(false)
  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      setError('storage.failed')
      return
    }
    const fiber = Effect.runFork(
      Effect.tryPromise({
        try: () => navigator.serviceWorker.register('/sw.js'),
        catch: (cause) => new ShellCacheUnavailable({ cause }),
      }).pipe(
        Effect.catchTag('ShellCacheUnavailable', () =>
          Effect.sync(() => setError('storage.failed')),
        ),
      ),
    )
    return () => {
      Effect.runFork(Fiber.interrupt(fiber))
    }
  }, [])
  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])
  useEffect(() => {
    if (isViewer) return
    const check = requestJson(Session, '/api/session').pipe(
      Effect.matchEffect({
        onSuccess: (session) =>
          Effect.gen(function* () {
            setAuth({ _tag: session.authenticated ? 'Editor' : 'Guest' })
            yield* setEditorGrant(session.authenticated)
          }),
        onFailure: (failure) =>
          Effect.gen(function* () {
            if (
              failure._tag === 'NetworkFailure' &&
              Result.isSuccess(deskId) &&
              (yield* hasEditorGrant)
            ) {
              const cached = yield* readReplica(deskId.success, { _tag: 'Editor' })
              if (Option.isSome(cached)) {
                setAuth({ _tag: 'OfflineEditor', id: deskId.success })
                return
              }
            }
            setAuth({ _tag: 'Guest' })
            setError(failure.code)
          }),
      }),
      Effect.catch((failure) => Effect.sync(() => setError(failure.code))),
    )
    const fiber = Effect.runFork(check)
    const online = () => Effect.runFork(check)
    window.addEventListener('online', online)
    return () => {
      window.removeEventListener('online', online)
      Effect.runFork(Fiber.interrupt(fiber))
    }
  }, [setAuth, isViewer, deskId])
  function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError('')
    Effect.runFork(
      requestJson(Session, '/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      }).pipe(
        Effect.andThen((session) =>
          Effect.gen(function* () {
            if (!session.authenticated) {
              setError('auth.invalid')
              return
            }
            setAuth({ _tag: 'Editor' })
            setPassword('')
            yield* setEditorGrant(true)
          }),
        ),
        Effect.catch((failure) =>
          Effect.sync(() =>
            setError(failure._tag === 'HttpFailure' ? 'auth.invalid' : failure.code),
          ),
        ),
        Effect.ensuring(Effect.sync(() => setPending(false))),
      ),
    )
  }
  function logout() {
    Effect.runFork(
      requestJson(Session, '/api/session', { method: 'DELETE' }).pipe(
        Effect.andThen(() => setEditorGrant(false)),
        Effect.andThen(Effect.sync(() => setAuth({ _tag: 'Guest' }))),
        Effect.catch((failure) => Effect.sync(() => setError(failure.code))),
      ),
    )
  }
  return (
    <main>
      <header>
        <h1>{t('app.title')}</h1>
        <label>
          {t('language.label')}
          <select
            value={locale}
            onChange={(event) => setLocale(event.target.value === 'en' ? 'en' : 'pl')}
          >
            <option value="pl">Polski</option>
            <option value="en">English</option>
          </select>
        </label>
      </header>
      {Result.isSuccess(viewerId) && token ? (
        viewPath?.[2] === 'stage' || viewPath?.[2] === 'announcer' ? (
          <ViewerScreen id={viewerId.success} token={token} role={viewPath[2]} />
        ) : (
          <ContestDesk id={viewerId.success} access={{ _tag: 'Viewer', token }} />
        )
      ) : auth._tag === 'Editor' || auth._tag === 'OfflineEditor' ? (
        <section>
          {auth._tag === 'OfflineEditor' ? (
            <ContestDesk id={auth.id} access={{ _tag: 'Editor' }} />
          ) : Result.isSuccess(deskId) ? (
            <>
              <a href="/">{t('contests.back')}</a>
              <ContestDesk id={deskId.success} access={{ _tag: 'Editor' }} />
            </>
          ) : (
            <ContestCatalog />
          )}
          <button onClick={logout}>{t('auth.logout')}</button>
        </section>
      ) : auth._tag === 'Checking' ? (
        <p role="status">{t('desk.connecting')}</p>
      ) : (
        <form onSubmit={login}>
          <h2>{t('auth.title')}</h2>
          <label>
            {t('auth.password')}
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <button disabled={pending} type="submit">
            {t(pending ? 'auth.pending' : 'auth.login')}
          </button>
        </form>
      )}
      {error && <p role="alert">{t(error)}</p>}
    </main>
  )
}

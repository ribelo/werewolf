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
import { Wizard } from './Wizard.tsx'
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
  const viewPath = new RegExp('^/view/([^/]+)/(stage|announcer|scoreboard|results)$').exec(
    location.pathname,
  )
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
  const viewing = Result.isSuccess(viewerId) && !!token
  return (
    <main className={viewing ? '' : 'min-h-screen bg-main-bg text-text-primary'}>
      {!viewing && (
        <header className="border-b-2 border-border-color bg-main-bg">
          <div className="container-full flex flex-wrap items-end justify-between gap-6 py-6">
            <h1 className="text-display tracking-[0.25em] uppercase">{t('app.title')}</h1>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2">
                <span className="input-label mb-0">{t('language.label')}</span>
                <select
                  className="input-field"
                  value={locale}
                  onChange={(event) => setLocale(event.target.value === 'en' ? 'en' : 'pl')}
                >
                  <option value="pl">Polski</option>
                  <option value="en">English</option>
                </select>
              </label>
              {(auth._tag === 'Editor' || auth._tag === 'OfflineEditor') && (
                <button className="btn-secondary" onClick={logout}>
                  {t('auth.logout')}
                </button>
              )}
            </div>
          </div>
        </header>
      )}
      <div className={viewing ? '' : 'container-full py-6'}>
        {Result.isSuccess(viewerId) && token ? (
          viewPath?.[2] === 'stage' ||
          viewPath?.[2] === 'announcer' ||
          viewPath?.[2] === 'scoreboard' ||
          viewPath?.[2] === 'results' ? (
            <ViewerScreen id={viewerId.success} token={token} role={viewPath[2]} />
          ) : (
            <ContestDesk id={viewerId.success} access={{ _tag: 'Viewer', token }} />
          )
        ) : auth._tag === 'Editor' || auth._tag === 'OfflineEditor' ? (
          auth._tag === 'OfflineEditor' ? (
            <ContestDesk id={auth.id} access={{ _tag: 'Editor' }} />
          ) : location.pathname === '/new' ? (
            <Wizard />
          ) : Result.isSuccess(deskId) ? (
            <>
              <a
                className="mb-4 inline-block text-xs tracking-[0.3em] text-text-secondary uppercase hover:text-primary-red"
                href="/"
              >
                {t('contests.back')}
              </a>
              <ContestDesk id={deskId.success} access={{ _tag: 'Editor' }} />
            </>
          ) : (
            <ContestCatalog />
          )
        ) : auth._tag === 'Checking' ? (
          <p role="status" className="text-text-secondary">
            {t('desk.connecting')}
          </p>
        ) : (
          <form className="card mx-auto mt-12 max-w-md" onSubmit={login}>
            <h2 className="text-h2 mb-4">{t('auth.title')}</h2>
            <label className="mb-4 block">
              <span className="input-label">{t('auth.password')}</span>
              <input
                className="input-field w-full"
                type="password"
                name="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <button className="btn-primary" disabled={pending} type="submit">
              {t(pending ? 'auth.pending' : 'auth.login')}
            </button>
          </form>
        )}
        {error && (
          <p role="alert" className="mt-4">
            {t(error)}
          </p>
        )}
      </div>
    </main>
  )
}

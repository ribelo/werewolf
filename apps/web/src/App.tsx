// ADR 0004 requires Effect Atom. Pin its version because the API is unstable.
// @effect-diagnostics unstableApiUsage:off
import * as Atom from 'effect/reactivity/Atom'
import { useAtom } from '@effect/atom-react'
import * as Schema from 'effect/Schema'
import { useEffect, useState, type FormEvent } from 'react'
import { useMessages, type MessageKey } from './i18n.ts'
import { ContestCatalog } from './ContestCatalog.tsx'
import { ContestDesk } from './ContestDesk.tsx'
import { ContestId } from '@werewolf/sync'
import * as Result from 'effect/Result'

const authenticatedAtom = Atom.make(false)

export function App() {
  const { locale, setLocale, t } = useMessages()
  const viewPath = new RegExp('^/view/([^/]+)/(stage|announcer|results)$').exec(location.pathname)
  const viewerId = Schema.decodeUnknownResult(ContestId)(viewPath?.[1])
  const token = new URL(location.href).searchParams.get('token')
  const [authenticated, setAuthenticated] = useAtom(authenticatedAtom)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<MessageKey | ''>('')
  const [pending, setPending] = useState(false)
  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])
  useEffect(() => {
    fetch('/api/session')
      .then((response) => response.json())
      .then((body: unknown) =>
        setAuthenticated(
          Schema.decodeUnknownSync(Schema.Struct({ authenticated: Schema.Boolean }))(body)
            .authenticated,
        ),
      )
      .catch(() => setError('request.failed'))
  }, [setAuthenticated])
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError('')
    try {
      const response = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (response.ok) {
        setAuthenticated(true)
        setPassword('')
      } else setError('auth.invalid')
    } catch {
      setError('request.failed')
    } finally {
      setPending(false)
    }
  }
  async function logout() {
    try {
      const response = await fetch('/api/session', { method: 'DELETE' })
      if (response.ok) setAuthenticated(false)
      else setError('request.failed')
    } catch {
      setError('request.failed')
    }
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
        <ContestDesk id={viewerId.success} access={{ _tag: 'Viewer', token }} />
      ) : authenticated ? (
        <section>
          <ContestCatalog />
          <button
            onClick={() => {
              logout().catch(() => setError('request.failed'))
            }}
          >
            {t('auth.logout')}
          </button>
        </section>
      ) : (
        <form
          onSubmit={(event) => {
            login(event).catch(() => setError('request.failed'))
          }}
        >
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

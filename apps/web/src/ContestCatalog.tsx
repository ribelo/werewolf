import { Catalog } from '@werewolf/sync'
import * as Effect from 'effect/Effect'
import * as Fiber from 'effect/Fiber'
import { useEffect, useState } from 'react'
import { requestJson } from './live-contest.ts'
import { useMessages, type MessageKey } from './i18n.ts'

export function ContestCatalog() {
  const { t } = useMessages()
  const [catalog, setCatalog] = useState<typeof Catalog.Type>({ contests: [] })
  const [error, setError] = useState<MessageKey | ''>('')
  useEffect(() => {
    const fiber = Effect.runFork(
      requestJson(Catalog, '/api/contests').pipe(
        Effect.match({ onSuccess: setCatalog, onFailure: (failure) => setError(failure.code) }),
      ),
    )
    return () => {
      Effect.runFork(Fiber.interrupt(fiber))
    }
  }, [])
  return (
    <section className="space-y-6">
      <h2 className="text-h1 uppercase">{t('contests.title')}</h2>
      {catalog.contests.length === 0 ? (
        <p className="text-text-secondary">{t('contests.empty')}</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {catalog.contests.map((contest) => (
            <li key={contest.id}>
              <button
                type="button"
                className="card w-full text-left font-display text-xl tracking-wide uppercase hover:border-primary-red"
                onClick={() => location.assign('/desk/' + contest.id)}
              >
                {contest.name} — {contest.date}
              </button>
            </li>
          ))}
        </ul>
      )}
      <a className="btn-primary inline-block" href="/new">
        {t('contests.new')}
      </a>
      {error && <p role="alert">{t(error)}</p>}
    </section>
  )
}

import { Catalog } from '@werewolf/sync'
import * as Effect from 'effect/Effect'
import * as Fiber from 'effect/Fiber'
import { useEffect, useState } from 'react'
import { sendBackup } from './Backup.tsx'
import { requestJson } from './live-contest.ts'
import { useMessages, type MessageKey } from './i18n.ts'
import { AppHeader } from './Layout.tsx'

/** The start screen: the contests, newest first, with create and restore in one toolbar. */
export function ContestCatalog({ onLogout }: { readonly onLogout: () => void }) {
  const { t, locale } = useMessages()
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
  const contests = catalog.contests.toSorted((a, b) => b.date.localeCompare(a.date))
  const date = (value: string) =>
    new Date(value + 'T00:00:00').toLocaleDateString(locale === 'pl' ? 'pl-PL' : 'en-GB')
  return (
    <>
      <AppHeader title={t('dashboard.title')} current="contests" onLogout={onLogout} />
      <div className="space-y-3 px-4 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto font-display text-2xl uppercase tracking-[0.2em] text-text-primary">
            {t('dashboard.active.heading')}
          </h2>
          <a href="/new" className="btn-primary px-4 py-2 text-xs">
            {t('dashboard.tiles.create.title')}
          </a>
          <label className="btn-secondary cursor-pointer px-4 py-2 text-xs">
            {t('contests.restore')}
            <input
              className="sr-only"
              type="file"
              accept=".json,application/json"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file)
                  Effect.runFork(
                    Effect.promise(async () => {
                      const response = await sendBackup('/api/restore', file)
                      if (response.ok) location.reload()
                      else setError('request.invalid')
                    }),
                  )
              }}
            />
          </label>
        </div>
        {error && <p role="alert">{t(error)}</p>}
        {contests.length === 0 ? (
          <p className="py-8 text-center text-body text-text-secondary">
            {t('dashboard.active.empty')}
          </p>
        ) : (
          <ul className="divide-y divide-border-color border border-border-color bg-card-bg">
            {contests.map((contest) => (
              <li key={contest.id}>
                <a
                  href={'/desk/' + contest.id}
                  className="flex flex-wrap items-baseline gap-x-6 gap-y-1 px-4 py-3 transition-colors hover:bg-element-bg"
                >
                  <span className="mr-auto font-display text-xl uppercase tracking-[0.1em] text-text-primary">
                    {contest.name}
                  </span>
                  <span className="text-caption uppercase tracking-[0.2em] text-text-secondary">
                    {contest.location || '—'}
                  </span>
                  <span className="w-28 text-right font-mono text-sm text-text-primary">
                    {date(contest.date)}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}

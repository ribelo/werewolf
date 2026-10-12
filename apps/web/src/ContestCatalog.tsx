import { Catalog } from '@werewolf/sync'
import * as Effect from 'effect/Effect'
import * as Fiber from 'effect/Fiber'
import { useEffect, useState } from 'react'
import { sendBackup } from './Backup.tsx'
import { requestJson } from './live-contest.ts'
import { useMessages, type MessageKey } from './i18n.ts'
import { AppHeader } from './Layout.tsx'

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
  const total = catalog.contests.length
  return (
    <>
      <AppHeader
        title={t('dashboard.title')}
        subtitle={t('dashboard.subtitle')}
        current="contests"
        onLogout={onLogout}
      />
      <div className="container-full space-y-12 py-8">
        <section className="grid gap-6 md:grid-cols-2">
          <a href="/new" className="card group no-select">
            <header className="card-header flex items-center justify-between">
              <h2 className="text-h2 text-text-primary">{t('dashboard.tiles.create.title')}</h2>
              <span className="btn-primary">{t('dashboard.tiles.create.cta')}</span>
            </header>
            <p className="text-body text-text-secondary">
              {t('dashboard.tiles.create.description')}
            </p>
          </a>
          <a href="/settings" className="card group no-select">
            <header className="card-header flex items-center justify-between">
              <h2 className="text-h2 text-text-primary">{t('dashboard.tiles.settings.title')}</h2>
              <span className="text-h3 text-text-secondary">
                {t('dashboard.tiles.settings.cta')}
              </span>
            </header>
            <p className="text-body text-text-secondary">
              {t('dashboard.tiles.settings.description')}
            </p>
          </a>
        </section>
        <section className="grid gap-4 md:grid-cols-3">
          <div className="card">
            <h3 className="text-label text-text-secondary mb-2">
              {t('dashboard.stats.contests.label')}
            </h3>
            <p className="text-h1 text-text-primary">{total}</p>
            <p className="text-caption text-text-secondary mt-2">
              {t('dashboard.stats.contests.description')}
            </p>
          </div>
        </section>
        <section>
          <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-h2 text-text-primary uppercase tracking-[0.3em]">
                {t('dashboard.active.heading')}
              </h2>
              <p className="text-body text-text-secondary">{t('dashboard.active.description')}</p>
            </div>
            <span className="text-caption text-text-secondary uppercase tracking-[0.4em]">
              {total} {t('dashboard.active.total_suffix')}
            </span>
          </header>
          {total === 0 ? (
            <div className="card">
              <p className="text-body text-text-secondary">{t('dashboard.active.empty')}</p>
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
              {catalog.contests.map((contest) => (
                <a
                  key={contest.id}
                  href={'/desk/' + contest.id}
                  className="card relative transition-colors hover:border-primary-red"
                >
                  <header className="card-header">
                    <h3 className="text-h2 text-text-primary">{contest.name}</h3>
                    <p className="text-caption text-text-secondary">
                      {(contest.location ?? '').toUpperCase() || '—'} •{' '}
                      {new Date(contest.date + 'T00:00:00').toLocaleDateString(
                        locale === 'pl' ? 'pl-PL' : 'en-US',
                      )}
                    </p>
                  </header>
                  <dl className="space-y-2 text-body text-text-secondary">
                    <div className="flex justify-between">
                      <dt className="text-label">{t('dashboard.contest.start')}</dt>
                      <dd>
                        {new Date(contest.date + 'T00:00:00').toLocaleDateString(
                          locale === 'pl' ? 'pl-PL' : 'en-US',
                        )}
                      </dd>
                    </div>
                  </dl>
                </a>
              ))}
            </div>
          )}
        </section>
        <p className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2">
            <span className="input-label mb-0">{t('contests.restore')}</span>
            <input
              className="input-field"
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
        </p>
        {error && <p role="alert">{t(error)}</p>}
      </div>
    </>
  )
}

import { useEffect, useState } from 'react'
import { useMessages } from './i18n.ts'
import { AppHeader } from './Layout.tsx'
import { useLegacy } from './legacy-i18n.ts'

/** The 2025 settings page: language, and the state of the server where the old app showed D1 and KV. */
export function Settings({ onLogout }: { readonly onLogout: () => void }) {
  const { locale, setLocale, t } = useMessages()
  const { lt } = useLegacy()
  const [health, setHealth] = useState<'checking' | 'ok' | 'failed'>('checking')
  const [contests, setContests] = useState(0)
  const [checked, setChecked] = useState(() => new Date())
  useEffect(() => {
    fetch('/api/health')
      .then((response) => setHealth(response.ok ? 'ok' : 'failed'))
      .catch(() => setHealth('failed'))
    fetch('/api/contests')
      .then((response): Promise<{ readonly contests?: ReadonlyArray<unknown> }> =>
        response.ok ? response.json() : Promise.resolve({}),
      )
      .then((value) => setContests(value.contests?.length ?? 0))
      .catch(() => setContests(0))
    setChecked(new Date())
  }, [])
  return (
    <>
      <AppHeader
        title={t('settings.title')}
        subtitle={t('settings.subtitle')}
        current="settings"
        onLogout={onLogout}
      />
      <div className="container-full space-y-8 py-8">
        <section className="card">
          <header className="card-header flex flex-col gap-2">
            <h2 className="text-h3">{t('settings.language.title')}</h2>
            <p className="text-body text-text-secondary">{t('settings.language.description')}</p>
          </header>
          <label className="flex flex-wrap items-center justify-between gap-4">
            <span>
              <span className="block text-body font-semibold text-text-primary">
                {t('settings.language.label')}
              </span>
              <span className="block text-caption text-text-secondary">
                {t('settings.language.help')}
              </span>
            </span>
            <select
              className="input-field max-w-xs"
              value={locale}
              onChange={(event) => setLocale(event.target.value === 'en' ? 'en' : 'pl')}
            >
              <option value="en">English</option>
              <option value="pl">Polski</option>
            </select>
          </label>
        </section>
        <section className="card">
          <header className="card-header flex flex-col gap-2">
            <h2 className="text-h3">{lt('settings.database_title')}</h2>
            <p className="text-body text-text-secondary">
              {lt('v2.settings.database_description')}
            </p>
          </header>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded border border-border-color bg-element-bg/40 p-4 space-y-2">
              <p className="text-label text-text-secondary">API WORKER</p>
              <span
                className={
                  'status-badge ' +
                  (health === 'ok'
                    ? 'status-active'
                    : health === 'failed'
                      ? 'status-error'
                      : 'status-warning')
                }
              >
                {health === 'ok' ? 'HEALTHY' : health === 'failed' ? 'ERROR' : '…'}
              </span>
              <p className="text-caption text-text-secondary">
                {checked.toLocaleString(locale === 'pl' ? 'pl-PL' : 'en-GB')}
              </p>
            </div>
            <div className="rounded border border-border-color bg-element-bg/40 p-4 space-y-2">
              <p className="text-label text-text-secondary">DURABLE OBJECTS</p>
              <span
                className={'status-badge ' + (health === 'ok' ? 'status-active' : 'status-warning')}
              >
                {health === 'ok' ? 'OK' : '…'}
              </span>
              <p className="text-caption text-text-secondary">
                {lt('dashboard.stats.contests.label')}: {contests}
              </p>
            </div>
          </div>
        </section>
      </div>
    </>
  )
}

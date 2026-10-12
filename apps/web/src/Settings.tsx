import { useMessages } from './i18n.ts'
import { AppHeader } from './Layout.tsx'

export function Settings({ onLogout }: { readonly onLogout: () => void }) {
  const { locale, setLocale, t } = useMessages()
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
      </div>
    </>
  )
}

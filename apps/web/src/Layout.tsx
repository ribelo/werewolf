import { useMessages } from './i18n.ts'

const navClass = (active: boolean) =>
  'px-4 py-2 font-display text-xs tracking-[0.4em] uppercase border-2 transition ' +
  (active
    ? 'bg-primary-red text-black border-primary-red'
    : 'border-border-color text-text-secondary hover:text-text-primary hover:border-primary-red')

/** The page header of the organizer screens: title, subtitle and the navigation of the 2025 app. */
export function AppHeader({
  title,
  subtitle,
  current,
  onLogout,
}: {
  readonly title: string
  readonly subtitle?: string
  readonly current: 'contests' | 'settings'
  readonly onLogout: () => void
}) {
  const { t } = useMessages()
  return (
    <header className="border-b-2 border-border-color bg-main-bg">
      <div className="container-full flex flex-col gap-6 py-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <h1 className="text-display tracking-[0.25em] text-text-primary uppercase">{title}</h1>
          {subtitle && (
            <p className="text-caption tracking-[0.4em] text-text-secondary uppercase">
              {subtitle}
            </p>
          )}
        </div>
        <nav className="flex flex-wrap gap-3">
          <a className={navClass(current === 'contests')} href="/">
            {t('layout.nav.contests')}
          </a>
          <a className={navClass(current === 'settings')} href="/settings">
            {t('layout.nav.settings')}
          </a>
          <button className={navClass(false)} type="button" onClick={onLogout}>
            {t('auth.logout')}
          </button>
        </nav>
      </div>
    </header>
  )
}

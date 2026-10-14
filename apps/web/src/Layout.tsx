import type { ReactNode } from 'react'
import { useMessages } from './i18n.ts'

const navClass = (active: boolean) =>
  'px-3 py-1 font-display text-xs tracking-[0.25em] uppercase border transition ' +
  (active
    ? 'bg-primary-red text-black border-primary-red'
    : 'border-border-color text-text-secondary hover:text-text-primary hover:border-primary-red')

/** The application bar of the organizer screens: one compact line with the title and navigation. */
export function AppHeader({
  title,
  subtitle,
  current,
  onLogout,
  children,
}: {
  readonly title: string
  readonly subtitle?: string
  readonly current: 'contests' | 'settings'
  readonly onLogout: () => void
  /** Extra controls between the title and the navigation, such as the connection state. */
  readonly children?: ReactNode
}) {
  const { t } = useMessages()
  return (
    <header className="sticky top-0 z-30 flex min-h-12 flex-wrap items-center gap-x-4 gap-y-1 border-b border-border-color bg-main-bg px-4 py-2">
      <h1 className="truncate font-display text-xl uppercase tracking-[0.15em] text-text-primary">
        {title}
      </h1>
      {subtitle && (
        <p className="hidden truncate text-xxs uppercase tracking-[0.3em] text-text-secondary xl:block">
          {subtitle}
        </p>
      )}
      {children}
      <nav className="ml-auto flex flex-wrap gap-2">
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
    </header>
  )
}

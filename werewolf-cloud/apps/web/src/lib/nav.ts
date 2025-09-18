export const PAGE_LINKS = {
  contests: {
    href: '/',
    labelKey: 'layout.nav.contests'
  },
  competitors: {
    href: '/competitors',
    labelKey: 'layout.nav.competitors'
  },
  settings: {
    href: '/settings',
    labelKey: 'layout.nav.settings'
  }
} as const;

export type PageKey = keyof typeof PAGE_LINKS;

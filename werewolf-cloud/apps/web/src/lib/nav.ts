export const PAGE_LINKS = {
  contests: {
    href: '/',
    labelKey: 'layout.nav.contests'
  },
  settings: {
    href: '/settings',
    labelKey: 'layout.nav.settings'
  }
} as const;

export type PageKey = keyof typeof PAGE_LINKS;

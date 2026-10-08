import * as Cloudflare from 'alchemy/Cloudflare'
import * as Config from 'effect/Config'
import type { ContestDO, ContestCatalogDO } from '../apps/worker/src/contest-do.ts'

export const Edge = Cloudflare.Worker('Edge', {
  name: 'werewolf-v2',
  main: './apps/worker/src/index.ts',
  compatibility: { date: '2026-10-08', flags: ['nodejs_compat'] },
  assets: {
    directory: './apps/web/dist',
    notFoundHandling: 'single-page-application',
    runWorkerFirst: ['/api/*'],
  },
  observability: { enabled: true },
  env: {
    CONTESTS: Cloudflare.DurableObject<ContestDO>('ContestDO'),
    CATALOG: Cloudflare.DurableObject<ContestCatalogDO>('ContestCatalogDO'),
    ORGANIZER_PASSWORD: Config.Redacted('ORGANIZER_PASSWORD'),
    SESSION_SECRET: Config.Redacted('SESSION_SECRET'),
  },
})

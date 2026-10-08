import * as Cloudflare from 'alchemy/Cloudflare'
import * as Config from 'effect/Config'
import * as Effect from 'effect/Effect'
import type { ContestDO, ContestCatalogDO } from '../apps/worker/src/contest-do.ts'

/** Automatic backups of every contest, written by the contest actor (ticket 14). */
const Backups = Cloudflare.R2.Bucket('Backups')

export const Edge = Effect.gen(function* () {
  const backups = yield* Backups
  return yield* Cloudflare.Worker('Edge', {
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
      BACKUPS: backups,
      ORGANIZER_PASSWORD: Config.Redacted('ORGANIZER_PASSWORD'),
      SESSION_SECRET: Config.Redacted('SESSION_SECRET'),
    },
  })
})

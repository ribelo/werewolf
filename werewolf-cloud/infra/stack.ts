/**
 * Every Cloudflare resource of the Werewolf production deployment (stage `prod`).
 *
 * All of them existed before Alchemy (created with Wrangler) and are adopted in place:
 * the explicit names below are the live physical names, so the first deploy reads the
 * existing resources instead of creating new ones. `RemovalPolicy.retain()` keeps the
 * physical resources even if a declaration is ever removed from this file.
 */
import * as Alchemy from 'alchemy'
import * as Cloudflare from 'alchemy/Cloudflare'
import * as Command from 'alchemy/Command'
import * as Config from 'effect/Config'
import * as Effect from 'effect/Effect'

/**
 * Production D1. Alchemy applies pending files from ./migrations on deploy. Its bookkeeping
 * table is `__alchemy_migrations`; on the first deploy it copies Wrangler's `d1_migrations`
 * history (0001..0026, matched by file name) into it, so no applied migration runs again.
 */
export const Database = Cloudflare.D1.Database('Database', {
  name: 'werewolf-d1',
  migrations: './migrations',
}).pipe(Alchemy.AdoptPolicy.adopt(), Alchemy.RemovalPolicy.retain())

/** Production KV (sessions, backups, display sync). */
export const Kv = Cloudflare.KV.Namespace('Kv', { title: 'werewolf-kv' }).pipe(
  Alchemy.AdoptPolicy.adopt(),
  Alchemy.RemovalPolicy.retain(),
)

/** The API Worker, served at https://werewolf.r-krzywaznia-2c4.workers.dev. */
export const Api = Effect.gen(function* () {
  const db = yield* Database
  const kv = yield* Kv
  return yield* Cloudflare.Worker('Api', {
    name: 'werewolf',
    main: './apps/api/src/index.ts',
    // legacy_module_registry keeps the runtime the Worker had under Wrangler.
    compatibility: { date: '2025-09-17', flags: ['nodejs_compat', 'legacy_module_registry'] },
    workersDev: true,
    env: {
      DB: db,
      KV: kv,
      ENV: 'production',
      // Binding name and class must match the live Durable Object so adoption reuses it.
      'werewolf-contest-room': Cloudflare.DurableObject('ContestRoom', { className: 'ContestRoom' }),
      // The organizer password. Required: a Worker upload replaces all bindings, so the
      // live secret must be re-sent on every deploy (set it in werewolf-cloud/.env).
      ADMIN_PASSWORD: Config.Redacted('ADMIN_PASSWORD'),
    },
  }).pipe(Alchemy.AdoptPolicy.adopt(), Alchemy.RemovalPolicy.retain())
})

/** The Pages project that serves the SvelteKit app at https://werewolf.pages.dev. */
export const WebProject = Cloudflare.Pages.Project('WebProject', {
  name: 'werewolf',
  productionBranch: 'master',
}).pipe(Alchemy.AdoptPolicy.adopt(), Alchemy.RemovalPolicy.retain())

/**
 * Uploads the SvelteKit build (apps/web/.svelte-kit/cloudflare, built by `bun run deploy`)
 * as the production Pages deployment. Alchemy's own Pages.Deployment cannot upload files,
 * so Wrangler does the upload, authenticated with the profile's OAuth access token.
 */
export const WebDeploy = Effect.gen(function* () {
  yield* WebProject
  const credentials = yield* (yield* Cloudflare.Credentials).pipe(Effect.orDie)
  if (credentials.type !== 'oauth' && credentials.type !== 'apiToken') {
    return yield* Effect.die('Pages upload needs an OAuth or API-token Cloudflare profile')
  }
  const { accountId } = yield* yield* Cloudflare.CloudflareEnvironment
  return yield* Command.Exec('WebDeploy', {
    command: './node_modules/.bin/wrangler pages deploy apps/web/.svelte-kit/cloudflare --project-name werewolf --branch master --commit-dirty=true',
    env: {
      CLOUDFLARE_ACCOUNT_ID: accountId,
      CLOUDFLARE_API_TOKEN: credentials.type === 'oauth' ? credentials.accessToken : credentials.apiToken,
    },
    memo: false,
  })
})
# Deployment Guide

Deployment targets Cloudflare Workers (API) and Cloudflare Pages (SvelteKit frontend), both backed by the
production D1 database and KV namespace.

## Credentials — two different things

- **Organizer password** (`ADMIN_PASSWORD`): the app's own login for the desk. It is a Worker secret, entered
  by operators in the browser. It has nothing to do with Cloudflare accounts.
- **Cloudflare credentials**: an API token (`CLOUDFLARE_API_TOKEN`, with Workers Scripts, D1, KV and Pages
  edit permissions) or an OAuth session from `wrangler login`. Needed only to deploy and to apply remote
  migrations. Never share them with operators and never commit them.

Wrangler reads the account from `wrangler.worker.toml` / `wrangler.toml`; the account id and the
provisioned D1/KV ids per environment are listed in
[cloudflare-environments.md](./cloudflare-environments.md).

## Prerequisites

- Bundled dependencies installed: `cd werewolf-cloud && bun install`.
- Cloudflare credentials available to Wrangler (token in the environment or `wrangler login`).
- The `werewolf-d1` D1 database, the production KV namespace and the `ContestRoom` Durable Object are
  already bound in `wrangler.worker.toml`; the Pages project (`werewolf`) exists.
- The Worker URL is known; production currently is `https://werewolf.r-krzywaznia-2c4.workers.dev`.

## Deploying

```bash
cd werewolf-cloud
bun run deploy
```

`scripts/deploy.sh` performs, in order:

1. `wrangler d1 migrations apply werewolf-d1 --config wrangler.worker.toml --env production --remote`.
2. `wrangler deploy --config wrangler.worker.toml --env production`.
3. `cd apps/web && PUBLIC_API_BASE=... SVELTE_ADAPTER=cloudflare bun run build`.
4. `wrangler pages secret put PUBLIC_API_BASE --project-name werewolf` (idempotent).
5. `wrangler pages deploy .svelte-kit/cloudflare --project-name werewolf --branch master`.

`PUBLIC_API_BASE` defaults to the production Worker URL above; export it to point the frontend elsewhere.

### Overrides

- `API_ENV=staging` — Wrangler env used for migrations and the Worker deploy (default `production`).
- `PAGES_PROJECT=werewolf-preview` — different Pages project.
- `PAGES_BRANCH=staging` — branch label for the Pages deployment.
- `PAGES_ENV=preview` — push the Pages secret/deployment to the preview environment.
- `PUBLIC_API_BASE=https://...` — API base baked into the frontend and stored as a Pages secret.

### Single-target commands

```bash
bun run deploy:api    # wrangler deploy --config wrangler.worker.toml --env production
bun run deploy:web    # build + wrangler pages deploy (.svelte-kit/cloudflare)
```

## Manual equivalents

```bash
cd werewolf-cloud

# Apply migrations to production
bunx wrangler@latest d1 migrations apply werewolf-d1 --config wrangler.worker.toml --env production --remote

# Deploy the API Worker
bunx wrangler@latest deploy --config wrangler.worker.toml --env production

# Build and publish the frontend
cd apps/web
PUBLIC_API_BASE="https://werewolf.r-krzywaznia-2c4.workers.dev" \
  SVELTE_ADAPTER=cloudflare bun run build
printf '%s' "https://werewolf.r-krzywaznia-2c4.workers.dev" | \
  bunx wrangler@latest pages secret put PUBLIC_API_BASE --project-name werewolf
bunx wrangler@latest pages deploy .svelte-kit/cloudflare --project-name werewolf --branch master --commit-dirty=true
```

## After deploying

1. `curl https://<worker>/health` returns `{ "data": { "status": "ok" } }`.
2. Sign in at the Pages URL with the organizer password; `POST /auth/login` must set the
   `werewolf_session` cookie (production cookie: `Secure`, `SameSite=None`).
3. Open `/display/current` and `/display/table` and confirm they update when an attempt is set as current.
4. Check `/system/health` and the settings page for D1/KV status.

## Rollback

Redeploy the previous Worker version from the Cloudflare dashboard (`wrangler rollback` also works) and
redeploy the previous Pages deployment. Migrations are forward-only: an applied migration is never edited or
reverted, so ship a new migration to undo a schema mistake.

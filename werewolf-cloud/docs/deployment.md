# Deployment Guide

Production is declared as code with [Alchemy](https://alchemy.run) v2 in
[`alchemy.run.ts`](../alchemy.run.ts) and [`infra/stack.ts`](../infra/stack.ts) (stack `Werewolf`,
stage `prod`):

| Resource | Cloudflare name | Notes |
|----------|-----------------|-------|
| Worker `Api` | `werewolf` | Hono API + `ContestRoom` Durable Object, `https://werewolf.r-krzywaznia-2c4.workers.dev` |
| D1 `Database` | `werewolf-d1` | migrations from `migrations/` applied on deploy |
| KV `Kv` | `werewolf-kv` | sessions, backups, display sync |
| Pages project `WebProject` | `werewolf` | SvelteKit app, `https://werewolf.pages.dev` |
| `WebDeploy` | — | uploads `apps/web/.svelte-kit/cloudflare` to the Pages project |

All of them existed before Alchemy and are adopted in place (explicit names, `adopt()`), and every one is
marked `RemovalPolicy.retain()`: Alchemy never deletes them, even if a declaration is removed.
Alchemy state lives in the account's `alchemy-state-store` Worker.

## Credentials — two different things

- **Organizer password** (`ADMIN_PASSWORD`): the app's own login for the desk, a Worker secret entered by
  operators in the browser. A Worker upload replaces all bindings, so every deploy re-sends it: put it in
  `werewolf-cloud/.env` (gitignored) as `ADMIN_PASSWORD=...`. The deploy fails if it is missing.
- **Cloudflare credentials**: an OAuth session in the Alchemy profile `werewolf`, stored in
  `~/.alchemy-werewolf`. There are no API tokens. Connect once (opens the browser):

  ```bash
  cd werewolf-cloud
  bun run cloudflare-login
  ```

  Alchemy refreshes the token itself. Never share these credentials with operators.

## Deploying

```bash
cd werewolf-cloud
bun run plan     # preview: what would be created, updated or adopted
bun run deploy   # build the web app, then deploy everything
```

`bun run deploy` builds `apps/web` with the Cloudflare adapter and runs `alchemy deploy --stage prod`, which:

1. applies pending D1 migrations to `werewolf-d1`;
2. uploads the Worker `werewolf` (bindings `DB`, `KV`, `ENV=production`, `ADMIN_PASSWORD`,
   Durable Object `werewolf-contest-room` → `ContestRoom`);
3. uploads the web build as the production deployment of the Pages project `werewolf` (branch `master`).
   Alchemy cannot upload Pages files itself, so this step runs the workspace `wrangler pages deploy` with the
   profile's OAuth access token.

The frontend calls the Worker URL hard-coded in `apps/web/src/lib/config.ts` unless `PUBLIC_API_BASE` is set
at build time.

## D1 migrations

Add a new numbered file to `migrations/`; never edit an applied one. The next deploy applies it.
Alchemy keeps its own bookkeeping table `__alchemy_migrations`. On the first Alchemy deploy it copies the
history Wrangler recorded in `d1_migrations` (0001–0026, matched by file name) into that table, so nothing
already applied runs again; `d1_migrations` is then left frozen. Do not apply production migrations with
Wrangler any more — Wrangler would not see Alchemy's table.

## After deploying

1. `curl https://werewolf.r-krzywaznia-2c4.workers.dev/health` returns `{ "data": { "status": "ok" } }`.
2. Sign in at `https://werewolf.pages.dev` with the organizer password; `POST /auth/login` must set the
   `werewolf_session` cookie (production cookie: `Secure`, `SameSite=None`).
3. Open `/display/current` and `/display/table` and confirm they update when an attempt is set as current.
4. Check `/system/health` and the settings page for D1/KV status.

## Rollback

Roll back the Worker to a previous version and promote a previous Pages deployment from the Cloudflare
dashboard. Migrations are forward-only: an applied migration is never edited or reverted, so ship a new
migration to undo a schema mistake.

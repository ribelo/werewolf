# Deployment Guide

## Prerequisites
- Wrangler configured with either an API token (`CLOUDFLARE_API_TOKEN`) or an OAuth session (`wrangler login`).
- Cloudflare D1, KV, and Durable Object bindings already present in `wrangler.worker.toml` (API Worker) and mirrored in `wrangler.toml` (Pages).
- Pages project provisioned (`werewolf`). The first deploy auto-creates the project if needed.
- Know the public Worker URL; production currently lives at `https://werewolf.r-krzywaznia-2c4.workers.dev`.

## One-time setup
```bash
cd werewolf-cloud
# Set the public API base for the frontend build
# Deploy once (the script defaults to https://werewolf.r-krzywaznia-2c4.workers.dev)
bun run deploy
```

The script automatically:
1. Applies D1 migrations to the production database (`werewolf-d1`).
2. Publishes the Worker (`wrangler deploy --env production`).
3. Builds the SvelteKit bundle for Pages and updates the `PUBLIC_API_BASE` secret.
4. Deploys the Pages site (defaults to project `werewolf`, branch `master`).

## Subsequent deployments
```bash
cd werewolf-cloud
# Optional: override the API base
export PUBLIC_API_BASE="https://custom.example.com"
bun run deploy
```

### Optional overrides
- `API_ENV=staging` — Deploy the Worker using another Wrangler environment.
- `PAGES_PROJECT=werewolf-preview` — Target a different Pages project.
- `PAGES_BRANCH=staging` — Mark the deployment with another branch name.
- `PAGES_ENV=preview` — Push the Pages secret/deployment to the preview environment instead of production.

The Pages secret update is idempotent; the script pipes the `PUBLIC_API_BASE` value into `wrangler pages secret put PUBLIC_API_BASE` before every deploy to ensure the UI never falls back to `127.0.0.1`.

## Manual commands (if you prefer)
```bash
# Apply migrations
bunx wrangler@latest d1 migrations apply werewolf-d1 --config wrangler.worker.toml --env production --remote

# Deploy the Worker
bunx wrangler@latest deploy --config wrangler.worker.toml --env production

# Build and deploy the frontend
cd apps/web
PUBLIC_API_BASE="https://werewolf.r-krzywaznia-2c4.workers.dev" \
  SVELTE_ADAPTER=cloudflare bun run build
printf 'https://werewolf.r-krzywaznia-2c4.workers.dev' | \
  npx wrangler@latest pages secret put PUBLIC_API_BASE --project-name werewolf
npx wrangler@latest pages deploy .svelte-kit/cloudflare --project-name werewolf --branch master --commit-dirty=true
```

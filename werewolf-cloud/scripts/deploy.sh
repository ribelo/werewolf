#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_ENV="${API_ENV:-production}"
PAGES_PROJECT="${PAGES_PROJECT:-werewolf}"
PAGES_BRANCH="${PAGES_BRANCH:-master}"
PAGES_ENV="${PAGES_ENV:-production}"
DEFAULT_API_BASE="https://werewolf.r-krzywaznia-2c4.workers.dev"
API_BASE="${PUBLIC_API_BASE:-$DEFAULT_API_BASE}"

cd "$ROOT_DIR"

echo "[deploy] Applying D1 migrations for env=$API_ENV"
bunx wrangler@latest d1 migrations apply "werewolf-d1" --config wrangler.worker.toml --env "$API_ENV" --remote

echo "[deploy] Publishing API worker"
bunx wrangler@latest deploy --config wrangler.worker.toml --env "$API_ENV"

cd apps/web

echo "[deploy] Building SvelteKit Pages bundle"
PUBLIC_API_BASE="$API_BASE" SVELTE_ADAPTER=cloudflare bun run build

SECRET_CMD=(npx wrangler@latest pages secret put PUBLIC_API_BASE --project-name "$PAGES_PROJECT")
if [[ -n "$PAGES_ENV" && "$PAGES_ENV" != "production" ]]; then
  SECRET_CMD+=(--env "$PAGES_ENV")
fi

echo "[deploy] Updating Pages secret PUBLIC_API_BASE"
printf '%s' "$API_BASE" | "${SECRET_CMD[@]}" >/dev/null

DEPLOY_CMD=(npx wrangler@latest pages deploy .svelte-kit/cloudflare --project-name "$PAGES_PROJECT" --branch "$PAGES_BRANCH" --commit-dirty=true)
if [[ -n "$PAGES_ENV" && "$PAGES_ENV" != "production" ]]; then
  DEPLOY_CMD+=(--env "$PAGES_ENV")
fi

echo "[deploy] Publishing Pages site"
"${DEPLOY_CMD[@]}"

echo "[deploy] Done"

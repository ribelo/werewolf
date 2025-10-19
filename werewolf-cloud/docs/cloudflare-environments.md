# Cloudflare Environments

Centralised reference for the provisioned Cloudflare resources that power the Werewolf Cloud stack.

## Accounts & Workers
- **Worker name:** `werewolf`
- **workers.dev URL:** `https://werewolf.r-krzywaznia-2c4.workers.dev`
- **Entry file:** `apps/api/src/index.ts`

## Data Stores
- **D1 (production):** `werewolf-d1`
  - **Database ID:** `4e260168-4bc5-455a-a1e8-b9aa43844004`
  - **Migrated via:** `werewolf-cloud/migrations`
- **D1 (development):** `werewolf-d1-dev`
  - **Database ID:** `952d9b14-6236-4e59-8fc8-66b2df9128b7`
- **KV Namespace (production):** `werewolf-kv`
  - **Namespace ID:** `0a529ddf9e174436a1353b74867ea4d8`
- **KV Namespace (development):** `werewolf-kv-dev`
  - **Namespace ID:** `8cf514e5365c468eb782d0a96f6ad309`

## Deployment Commands

```bash
# Local development (default config points at dev bindings)
wrangler dev --config wrangler.worker.toml --local

# List and apply migrations in production
a bun run typecheck
b wrangler d1 migrations list werewolf --env production
c wrangler d1 migrations apply werewolf --env production --config wrangler.worker.toml

# Publish the worker
wrangler deploy --config wrangler.worker.toml --env production
```

## Data Migration

### SQLite to D1 Import

The `scripts/import-sqlite.ts` script migrates data from the legacy SQLite database export to Cloudflare D1.

#### Prerequisites

1. **Environment Variables**: Set the following in your shell or `.env` file:
   ```bash
   export CLOUDFLARE_ACCOUNT_ID="your_account_id"
   export CLOUDFLARE_D1_DATABASE_ID="your_d1_database_id"
   export CLOUDFLARE_API_TOKEN="your_api_token"
   ```

2. **SQLite Export**: Ensure `werewolf_full_export.sql` exists in the project root.

#### Usage

```bash
# Dry run (recommended first)
bun run scripts/import-sqlite.ts --dry-run

# Full import with database reset
bun run scripts/import-sqlite.ts --reset

# Import without reset (append to existing data)
bun run scripts/import-sqlite.ts
```

#### Options

- `--dry-run`: Parse and validate data without importing
- `--reset`: Clear all existing data before import (destructive!)

#### Rollback Procedures

If import fails or data corruption occurs:

1. **Immediate Rollback**: Use D1 dashboard to manually delete corrupted records
2. **Full Reset**: Run `bun run scripts/import-sqlite.ts --reset` with correct data
3. **Backup Restore**: If using KV backups, restore from a known good backup via API

#### Verification

After import, verify data integrity:

```bash
# Check record counts
curl https://werewolf.r-krzywaznia-2c4.workers.dev/health

# Compare with legacy database
sqlite3 ~/.local/share/werewolf/werewolf.db "SELECT COUNT(*) FROM contests;"
```

> Keep this file up to date if new environments (staging, preview) or additional bindings (R2, Durable Objects) are created.

## API Tokens & Environment Variables

- Generate a Cloudflare API token with **Workers KV:Edit**, **D1:Edit**, **Workers R2:Edit**, and **Cloudflare Pages:Edit** on the `r-krzywaznia-2c4` account. Store it alongside the account ID in a local `.env` file (already gitignored), for example:
  ```bash
  # werewolf-cloud/.env
  CLOUDFLARE_ACCOUNT_ID=2c42f4960f9c28a9235cac01483bd626
  CLOUDFLARE_API_TOKEN=MeKJV3fDOswsV_JB-70ZFjE7YobOich5nLgydGoO
  ```
- Load the credentials before running `wrangler` (either `source .env` or `dotenv -f .env -- wrangler <command>`):
  ```bash
  source .env
  ```
- Frontend env: supply `PUBLIC_API_BASE` (e.g. `PUBLIC_API_BASE=http://127.0.0.1:8787 bun run dev`). Set the same variable in Cloudflare Pages → Settings → Environment Variables, pointing to `https://werewolf.r-krzywaznia-2c4.workers.dev` (and staging values if needed).

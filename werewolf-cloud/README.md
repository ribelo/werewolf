# Werewolf Cloud

Cloudflare-native powerlifting contest manager: a Hono Worker API on D1/KV, a SvelteKit frontend, and a
`ContestRoom` Durable Object for WebSocket fan-out. The legacy Tauri desktop app stays in `../` as frozen
reference material.

## Structure

```
werewolf-cloud/
├── apps/api/         # Worker API (Hono, D1, KV, Durable Objects)
├── apps/web/         # SvelteKit UI (organizer desk, displays, results)
├── packages/domain/  # shared pure domain logic and Zod models
├── config/           # workspace TypeScript/Vitest configuration
├── migrations/       # D1 SQL migrations (local: Wrangler; production: Alchemy on deploy)
├── scripts/          # seed and import utilities
├── docs/             # architecture, API, deployment, SPEC, BACKLOG
├── infra/            # Alchemy declaration of the production Cloudflare resources
├── alchemy.run.ts    # Alchemy entry point (bun run plan / deploy)
└── wrangler.dev.toml # local Worker (bun run dev)
```

## Getting started

```bash
cd werewolf-cloud

# Optional: enter the cloud dev shell (Bun, Node, Wrangler)
nix develop ../#cloud

bun install
cp .dev.vars.example .dev.vars   # set ADMIN_PASSWORD

# Worker API + local D1/KV on http://127.0.0.1:8787 (applies migrations first)
bun run dev
```

In a second terminal:

```bash
cd werewolf-cloud/apps/web
PUBLIC_API_BASE=http://127.0.0.1:8787 bun run dev   # SvelteKit on http://127.0.0.1:5173
```

## Commands

| Command | Purpose |
|---------|---------|
| `bun run dev` | Apply local migrations, then start Wrangler with `wrangler.dev.toml`. |
| `bun run typecheck` | `tsc --build` across the workspace. |
| `bun run lint` | oxlint (the enforced rule is no explicit `any`). |
| `bun run test` | Vitest with `config/vitest.config.ts` (domain, API and `scripts/**` tests). |
| `bun run check` | Everything CI runs: `tsc --build`, oxlint, the root Vitest suites (domain, API, scripts), then `apps/web` svelte-check and its Vitest suite. |
| `bun run cloudflare-login` | One-time: connect the Alchemy profile `werewolf` to Cloudflare via OAuth (no API tokens). |
| `bun run plan` | Preview the production deploy (`alchemy plan --stage prod`). |
| `bun run deploy` | Build the web app, then `alchemy deploy --stage prod`: D1 migrations, Worker, Pages. See [docs/deployment.md](docs/deployment.md). |

## Authentication

- `POST /auth/login` accepts the organizer password and sets an HttpOnly `werewolf_session` cookie.
- Configure the password in `.dev.vars` locally and as `ADMIN_PASSWORD` in `werewolf-cloud/.env` for production (sent on every `bun run deploy`).
- Sessions live in the `KV` binding for 14 days and are refreshed on use.
- `POST /auth/logout` clears the cookie; `GET /auth/session` probes the session for the web client.
- All GET routes (including displays) are public; every non-GET route requires the session.

## Documentation

- [architecture.md](docs/architecture.md) — how the system works.
- [api-endpoints.md](docs/api-endpoints.md) — route reference with auth and envelope rules.
- [deployment.md](docs/deployment.md) — deployment and Cloudflare credentials.
- [cloudflare-environments.md](docs/cloudflare-environments.md) — provisioned ids per environment.
- [SPEC.md](docs/SPEC.md) and [BACKLOG.md](docs/BACKLOG.md) — requirements and open work.
- [../CONTRIBUTING.md](../CONTRIBUTING.md) — setup, checks and migration rules.

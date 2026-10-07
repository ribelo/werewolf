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
├── migrations/       # D1 SQL migrations (applied by Wrangler)
├── scripts/          # deploy, seed and import utilities
├── docs/             # architecture, API, deployment, SPEC, BACKLOG
├── wrangler.dev.toml     # local Worker (bun run dev)
├── wrangler.worker.toml  # deployed API Worker
└── wrangler.toml         # Pages frontend
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
| `bun run test` | Vitest with `config/vitest.config.ts` (API, domain and `src/lib` tests). |
| `bun run check` | typecheck + lint + tests. |
| `bun run deploy` | `scripts/deploy.sh`: remote migrations, then Worker and Pages. |
| `bun run deploy:api` | Deploy only the Worker via `wrangler.worker.toml --env production`. |
| `bun run deploy:web` | Build the SvelteKit bundle and deploy it to Cloudflare Pages. |

## Authentication

- `POST /auth/login` accepts the organizer password and sets an HttpOnly `werewolf_session` cookie.
- Configure the password with `wrangler secret put ADMIN_PASSWORD` (repeat per environment).
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

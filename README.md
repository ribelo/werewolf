# Werewolf Cloud

Powerlifting contest management for meet directors: a Cloudflare-native rewrite of the Werewolf
desktop app (Worker API + D1 + KV + Durable Objects, SvelteKit UI). It keeps the scoring desk,
announcer table, and big-screen displays in sync even when the gym WiFi flakes out.

---

## Quick start

Prerequisites: [Bun](https://bun.sh) 1.2+ — Wrangler, TypeScript and Vitest come from the workspace.

```bash
# 1. Worker API + local D1/KV/Durable Object state → http://127.0.0.1:8787
cd werewolf-cloud
bun install
bun run dev

# 2. Web UI (second terminal) → http://127.0.0.1:5173
cd werewolf-cloud/apps/web
PUBLIC_API_BASE=http://127.0.0.1:8787 bun run dev
```

Local D1 state lives in `werewolf-cloud/.wrangler/state`; delete it to start from an empty database.

## Checks

```bash
cd werewolf-cloud && bun run check                          # typecheck + oxlint + vitest
cd werewolf-cloud/apps/web && bun run check && bun run test:run   # svelte-check + vitest
```

## Deploy

```bash
cd werewolf-cloud
bun run deploy:api   # API Worker  (wrangler.worker.toml)
bun run deploy:web   # Web UI      (Cloudflare Pages, wrangler.toml)
```

Cloudflare accounts, database/namespace IDs and credentials:
[werewolf-cloud/docs/cloudflare-environments.md](werewolf-cloud/docs/cloudflare-environments.md).

---

## Repository layout

| Path | What it is |
| --- | --- |
| `werewolf-cloud/apps/api` | Cloudflare Worker (Hono, D1, KV, Durable Objects) |
| `werewolf-cloud/apps/web` | SvelteKit + Svelte 4 frontend |
| `werewolf-cloud/packages/domain` | Shared pure logic (`@werewolf/domain`) |
| `werewolf-cloud/migrations` | D1 SQL migrations |
| `docs/` | Architecture, user guide, roadmap |
| `src/`, `src-tauri/` | Frozen legacy Tauri desktop app (reference only) |

The desktop app is kept for historical comparison; it is not built, tested, or deployed by the
default pipeline. All new work targets `werewolf-cloud/`.

## Documentation

- [Architecture](werewolf-cloud/docs/architecture.md)
- [API endpoints](werewolf-cloud/docs/api-endpoints.md)
- [User Guide](docs/USER_GUIDE.md)
- [FAQ](docs/FAQ.md)
- [Spec](werewolf-cloud/docs/SPEC.md) and [Backlog](werewolf-cloud/docs/BACKLOG.md)
- Contributor conventions: [CLAUDE.md](CLAUDE.md), [AGENTS.md](AGENTS.md)

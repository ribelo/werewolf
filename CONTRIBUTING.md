# Contributing to Werewolf

Werewolf is a powerlifting contest manager. The active product is **Werewolf Cloud** in
`werewolf-cloud/`; the old Tauri desktop app in `src/` and `src-tauri/` is frozen reference material and
must not be changed or used as a design constraint. New features land in the cloud workspace only.

Read `AGENTS.md` for the P0 scope decisions and `werewolf-cloud/docs/architecture.md` for how the app is
built.

## Prerequisites

- Bun 1.2+ (`packageManager` is pinned in `werewolf-cloud/package.json`).
- Optional: `nix develop` from the repo root for the cloud shell (Bun, Node, Wrangler preinstalled).

## Setup and local development

```bash
cd werewolf-cloud
bun install

# Organizer password for local dev (git-ignored)
cp .dev.vars.example .dev.vars       # then edit ADMIN_PASSWORD

# Terminal 1 — Worker API + local D1/KV/DO on http://127.0.0.1:8787
bun run dev                          # applies pending migrations, then starts Wrangler

# Terminal 2 — SvelteKit UI on http://127.0.0.1:5173
cd apps/web && PUBLIC_API_BASE=http://127.0.0.1:8787 bun run dev
```

Open `http://127.0.0.1:5173`, sign in with the `ADMIN_PASSWORD` you set, and create a contest. Public
display routes (`/display/current`, `/display/table`, `/results/[id]`) need no login; `/`, `/health`
and `/auth/*` are always open.

## Checks before you push

Run these inside `werewolf-cloud/`:

```bash
bun run typecheck                    # tsc --build
bun run lint                         # oxlint; no explicit any is the rule that matters
bun run test                         # Vitest with config/vitest.config.ts (API + domain + lib tests)
bun run check                        # all three
cd apps/web && bunx vitest run       # jsdom route/component tests (apps/web/vitest.config.ts)
cd apps/web && bun run check         # svelte-kit sync + svelte-check
```

The API integration suite is the slow one (~100 s); run a single file with
`bunx vitest run --config config/vitest.config.ts <path>`.

## Coding rules

- Strict TypeScript, no `any` (use `unknown` plus narrowing), 2-space indent, camelCase helpers,
  PascalCase Svelte components.
- API responses use the envelope `{ data, error, requestId }`; validate request bodies with Zod through
  `@hono/zod-validator`, reusing schemas from `@werewolf/domain` where they exist.
- Shared domain logic stays pure and testable in `packages/domain`; the Worker keeps DB access in
  `apps/api/src/utils/database.ts` helpers and `apps/api/src/services/`.
- All user-visible copy goes through `$_('key')` in components or `t('key')` in scripts and must exist in
  **both** `apps/web/src/lib/i18n/locales/pl.json` (default) and `en.json`. Never hardcode Polish or
  English strings in markup.
- Never edit files that are mid-change by another engineer, and never reformat a file you are not touching.

## Migrations

- Migrations live in `werewolf-cloud/migrations/` and are applied by `bun run dev` locally and by
  `bun run deploy` in production.
- Applied SQL is immutable: never edit an existing migration file. Add a new one and note why in its header
  comment. The `migrations/` folder at the repo root belongs to the legacy desktop app — do not touch it.
- Local data reset: stop the dev server, delete `werewolf-cloud/.wrangler/state`, start `bun run dev` again.

## Pull requests

- Keep commits small and imperative; prefix with a scope when it helps
  (`fix(api): reject unloadable attempt weights`).
- Describe motivation, the commands you ran (`bun run check`, targeted Vitest, `svelte-check`) and any
  manual QA. UI changes should say what was checked in the Polish and English UI.
- Do not deploy, do not run Wrangler against `--remote`, and do not commit secrets. Deployment is done by
  the maintainers following `werewolf-cloud/docs/deployment.md`.

## Documentation map

| Document | Content |
|----------|---------|
| [architecture.md](werewolf-cloud/docs/architecture.md) | How the cloud app is built (the architecture source of truth). |
| [api-endpoints.md](werewolf-cloud/docs/api-endpoints.md) | Every HTTP route, auth requirement and envelope. |
| [deployment.md](werewolf-cloud/docs/deployment.md) | Worker/Pages deployment and credentials. |
| [SPEC.md](werewolf-cloud/docs/SPEC.md) | P0 requirements in EARS form. |
| [BACKLOG.md](werewolf-cloud/docs/BACKLOG.md) | Open work that is still in scope. |
| [USER_GUIDE.md](docs/USER_GUIDE.md) | Operator walkthrough of a meet. |
| [FAQ.md](docs/FAQ.md) | Common questions about the cloud app. |

Keep documentation current: a wrong document is worse than no document. Delete superseded plans instead of
leaving them next to the current ones — git keeps the history.

# Repository Guidelines

## Project Structure & Module Organization
- `werewolf-cloud/` is the active codebase: Cloudflare Worker API in `apps/api`, web client in `apps/web`, shared domain logic in `packages/domain`, and workspace configs inside `config/`.
- Legacy Tauri app under `src/` and `src-tauri/` is historical reference only; do not treat it as a constraint for new design.
- Shared docs, RFCs, and roadmaps live in `docs/`, `REQUIREMENTS_AND_ROADMAP.md`, and `JULES_DEVELOPMENT_PLAN.md`.
- Utility scripts (`check.sh`, `dev.sh`, `scripts/`) support reproducing issues in the legacy Tauri bundle.

## Build, Test, and Development Commands
- `cd werewolf-cloud && bun install` – install/upgrade workspace dependencies.
- `cd werewolf-cloud && bun run dev` – launch Cloudflare Workers dev server (wrangler + Miniflare state).
- `cd werewolf-cloud/apps/web && bun run dev` – run the SvelteKit UI against the local API.
- `cd werewolf-cloud && bun run check` – typecheck (`tsc`), lint (`oxlint`), and execute Vitest suites.
- Legacy maintenance: `bun install && bun run tauri dev` plus `./check.sh` reproduce desktop regressions when needed.

## Coding Style & Naming Conventions
- TypeScript uses 2-space indent, `camelCase` helpers, PascalCase Svelte components, and lowercase dotted i18n keys (`registrations.table.empty`).
- Domain packages expose pure, deterministic functions; avoid implicit globals and keep DTO types colocated.
- Touching `src-tauri`? Stay with Rust 2021 defaults, snake_case module names, and `sqlx::query!` for compile-time checked SQL.

## Breaking Changes & Legacy Policy (Until Staging)
- Backward compatibility is NOT required until we ship to staging. Prefer clean design over keeping old shapes.
- Do not carry forward poor abstractions from the legacy desktop app. If code is hard to evolve, refactor or replace it.
- New features land only in `werewolf-cloud/`. Touch legacy code only if absolutely necessary to unblock development.

## P0 Scope Decisions (Contributor Guardrails)
- Auth: simple login/password (one organizer) using free Cloudflare features. Multi-tenant later (each customer → own DB).
- Offline/PWA: ship a PWA with background sync; assume single active editor to avoid conflicts initially.
- Backups: prefer R2 for backup blobs (KV ok for small metadata); encryption optional.
- Sync: no event replay needed; on reconnect the client fetches the latest snapshot and resumes.
- Photos: out of scope. Do not add new photo handling.
- Theming/Branding: supported; store presets in settings and apply via CSS variables.
- Live operations stay simple: finish all complex setup before the meet; give operators one obvious flow during competition with minimal clicks.

## Testing Guidelines
- `bun run test` (or `bunx vitest --config config/vitest.config.ts`) runs the authoritative suite with coverage.
- UI specs live in `apps/web/src/routes/__tests__`; reset IndexedDB mocks in `beforeEach` to avoid cross-test bleed.
- Only run `cargo test` inside `src-tauri` for legacy patches; new feature coverage belongs in the cloud workspace.

## Commit & Pull Request Guidelines
- Keep commits small and imperative; prefix with scope when it clarifies (`feat(domain): merge attempt cards`).
- PR descriptions must include motivation, test evidence (`bun run check`, targeted vitest, manual QA), and call out any legacy surface touched.
- Add screenshots or clips for UI-facing changes so reviewers can compare organizer vs. display flows.

## Security & Configuration Tips
- `wrangler.dev.toml` seeds local config; scrub tokens before sharing logs.
- `.wrangler/state` persists dev data—clear it when resetting environments or before zipping the repo.
- Prefer R2 for backups, KV for small metadata; place migrations in `werewolf-cloud/migrations` and never edit applied SQL.

# CLAUDE.md – Project Instructions for AI Assistants

_Last updated: 2025-09-20_

These instructions describe how AI coding assistants should work with the Werewolf Cloud project. The legacy Tauri desktop implementation still exists for reference but is not the primary target.

## Project Overview

Werewolf Cloud is a Cloudflare-native rewrite of the Werewolf powerlifting contest system. It delivers a Worker API (Hono), a SvelteKit frontend, Cloudflare D1 for persistence, KV for cached payloads, and Durable Objects for real-time fan-out to announcer/big-screen displays.

### Key Goals
- Preserve the meet-day workflow (desk operator, announcer, projector) with minimal latency.
- Maintain offline resilience via optimistic updates, polling fallback, and future mutation queues.
- Keep the codebase strictly typed and well-documented so volunteers can contribute quickly.

## Repository Layout

```
werewolf/
├── werewolf-cloud/
│   ├── apps/api/        # Cloudflare Worker (Hono)
│   ├── apps/web/        # SvelteKit frontend
│   ├── migrations/      # D1 SQL migrations
│   └── docs/            # Cloud-specific docs (lives in root docs/)
├── docs/                # Combined documentation set
├── src/, src-tauri/     # Legacy Tauri desktop app (read-only reference)
└── …
```

Do not modify the legacy Tauri project unless explicitly asked. All active work happens in `werewolf-cloud/`.

## Development Environment

- **Package manager**: Bun (1.2+)
- **TypeScript**: Strict mode, no implicit `any`, `noUncheckedIndexedAccess` enabled
- **Linting**: `bun run lint` uses oxlint; Biome is removed
- **API Dev**: `bun run dev` from `werewolf-cloud/` wraps Wrangler dev with local D1/KV state
- **Frontend Dev**: `PUBLIC_API_BASE=http://127.0.0.1:8787 bun run dev` from `werewolf-cloud/apps/web`
- **Migrations**: `bunx wrangler d1 migrations apply werewolf-d1-dev --local --config wrangler.dev.toml`

Always run `bun run check`, `bun run test`, and `bun run test:run` before committing. Use the Nix flake (`nix develop`) when you need a hermetic shell with Wrangler pre-installed.

## Coding Standards

1. **Type Safety**
   - Prefer explicit generics to suppressing types.
   - No `any`. Use `unknown` + narrowing if necessary.
   - Keep shared types in `apps/web/src/lib/types.ts` and `apps/api/src/types/` aligned.

2. **Internationalisation**
   - All user-facing copy must use `$_('key', { values })` (templates) or `t('key')` (scripts).
   - Default locale is Polish (`pl`); English fallback is required.
   - Add translation strings to both `pl.json` and `en.json`.

3. **API Contracts**
   - Success envelopes: `{ data: T, error: null, requestId }`.
   - Error envelopes: `{ data: null, error: string, requestId }`.
   - Use Zod schemas in `apps/api` for validation.

4. **Realtime**
   - Publish events with `publishAttemptEvent` helpers.
   - Update `apps/web/src/lib/ui/contest-store.ts` reducers when new event types are introduced.
   - In dev, expect WebSocket disconnects; maintain polling fallback.

5. **Testing**
   - API changes require Vitest coverage in `apps/api/__tests__`.
   - Frontend features need unit/smoke tests in `apps/web/src/routes/__tests__`.
   - Include Playwright scripts when debugging complex UI flows (manual invocation only).

6. **Docs**
   - Update relevant documentation (`docs/post-migration-action-plan.md`, `docs/ARCHITECTURE.md`, etc.) as part of each change.
   - Record outstanding work in `docs/OPEN-ISSUES.md` if not resolved immediately.

## Common Workflows

### Running End-to-End Locally
1. `cd werewolf-cloud && bun run dev` (Worker, D1, KV, DO local state).
2. `cd werewolf-cloud/apps/web && PUBLIC_API_BASE=http://127.0.0.1:8787 bun run dev` (SvelteKit dev server).
3. Open `http://localhost:5173` (or the port Vite chooses) and follow the user guide.

### Applying Migrations
```bash
# Local
bunx wrangler@latest d1 migrations apply werewolf-d1-dev --local --config wrangler.dev.toml

# Remote prod
bunx wrangler@latest d1 migrations apply werewolf-d1 --remote --env production --config wrangler.toml
```

### Deploying
```bash
bunx wrangler@latest deploy --env production --config wrangler.toml
# Pages frontend
cd werewolf-cloud/apps/web && bun run build
# Upload via Cloudflare Pages UI or API
```

## Legacy Notes

- The desktop app’s documentation and commands remain in git for posterity. If a task explicitly references Tauri or Rust, verify with the maintainer before touching those directories.
- SQLite exports (`werewolf_full_export.sql`) are stored at the repo root for importer testing.

## Contact

If instructions conflict, defer to `docs/post-migration-action-plan.md` and ping the maintainers. Keep change logs concise and always note verification steps.


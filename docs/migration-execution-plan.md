# Migration Execution Plan

_Last updated: 2025-09-20_

## Status Snapshot

| Area | Status | Notes |
|------|--------|-------|
| Data layer | ✅ Complete | D1 migrations 0001–0008 applied locally and remotely. Importer deferred (no prod data yet). |
| Domain logic | ✅ Complete | Score engine, coefficient math, registration auto-classification ported to TypeScript with tests. |
| API surface | ✅ Complete | 25+ endpoints implemented with consistent envelopes and integration tests. |
| Realtime | ✅ Complete | WebSocket + polling fallback, ContestRoom DO, KV snapshots. |
| Frontend desk | ✅ Complete | Contest dashboard, attempt editor, quick-add, realtime syncing, optimistic flows. |
| Displays | ✅ Complete | Announcer table & big-screen parity with plate plan, history, QR sharing. |
| Documentation | 🔄 In progress | Post-migration action plan, user guide, FAQ shipped. API curl captures pending. |
| Pending polish | 🔄 In progress | See `docs/post-migration-action-plan.md` and `docs/OPEN-ISSUES.md` for remaining tasks. |

## Completed Milestones

### M0 — Infrastructure & Tooling
- Wrangler dev shell (`bun run dev`) with local D1/KV and Durable Object bindings.
- Flake integration for Bun + Wrangler in development environments.
- Oxlint adopted as the primary linter; Biome removed.

### M1 — Schema Parity
- Translated SQLite schema to D1 with migrations 0001–0008.
- Added `attempts.updated_at` for display timestamps.
- Documented migration procedures (local + remote).

### M2 — Domain Port
- Ported scoring, Reshel/McCullough coefficients, ranking logic, and attempt validation from Rust to TypeScript.
- Added Vitest coverage (`packages/domain/src/__tests__`).

### M3 — API Implementation
- Implemented CRUD for contests, competitors, registrations, attempts, results, plate sets, settings.
- Standardised envelopes `{ data, error, requestId }` (success) / `{ data: null, error, requestId }` (error).
- Added backup/restore endpoints with KV metadata storage.
- Integration suite exercises all routes via Miniflare.

### M4 — Realtime Layer
- ContestRoom Durable Object manages WebSocket rooms.
- KV snapshot fallback for reconnects.
- Client store (`contest-store.ts`) merges socket events and polling results.

### M5 — Frontend Rewrite
- SvelteKit-based organizer UI with contest dashboard, competitor table, settings.
- Attempt editor modal, quick-add actions, segmented status controls, set/clear current flows.
- i18n restored (Polish default, English fallback) with svelte-i18n bootstrap.
- Toast + modal systems shared across app.

### M6 — Displays & Announcer
- Broadcast payload bundle returned on `attempt.currentSet` and `/attempts/current`.
- Big-screen shows attempt grid, plate plan, rack heights, equipment icons, history.
- Announcer table includes plate plan details, queue, summary chips, QR sharing.

### M7 — Testing & Docs
- Frontend smoke tests (attempt editor, display sync) and API integration coverage.
- Docs refreshed: architecture, user guide, FAQ, post-migration plan.
- `docs/OPEN-ISSUES.md` tracks remaining polish.

## Remaining Work (Tracked Separately)

See `docs/post-migration-action-plan.md` for the current execution roadmap. Key items include finalising documentation (API captures, roadmap decisions), closing lingering TODOs in tests, implementing results export, and preparing offline mutation queues.

## Verification Commands

```bash
# Worker API
cd werewolf-cloud/apps/api
bun run typecheck
bun run test

# Frontend
cd werewolf-cloud/apps/web
bun run check
bun run test:run

# Combined (from werewolf-cloud/)
bun run test
```

## Deployment Checklist

1. `bunx wrangler@latest deploy --env production --config wrangler.toml`
2. `cd apps/web && bun run build` → upload via Cloudflare Pages
3. Apply latest migrations remotely: `bunx wrangler@latest d1 migrations apply werewolf-d1 --remote --env production --config wrangler.toml`
4. Run smoke script `scripts/curl-api-test.sh`
5. Open announcer (`/display/table`) and big-screen (`/display/current`) to confirm realtime updates


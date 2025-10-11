# Werewolf Cloud Architecture

_Last updated: 2025-09-20_

## Overview

Werewolf Cloud modernises the original Tauri desktop app into a Cloudflare-first platform while keeping contest-day reliability. The system is split into a Hono-powered Worker API, a SvelteKit frontend, and real-time display surfaces that stay in sync via Durable Objects or polling fallback.

```
┌────────────────────────────────────────────────────────┐
│                     Cloudflare Edge                    │
│                                                        │
│  ┌────────────┐    ┌────────────┐    ┌──────────────┐  │
│  │  Worker     │    │ Durable     │    │ KV Namespace │  │
│  │  (Hono API) │◀──▶│ Object       │◀──▶│  Snapshots    │  │
│  └────────────┘    │ ContestRoom │    └──────────────┘  │
│        ▲           └────────────┘           ▲           │
│        │                 ▲                  │           │
│        │                 │                  │           │
│        │           ┌────────────┐           │           │
│        └──────────▶│   D1 DB    │◀─────────┘           │
│                    └────────────┘                       │
└────────────────────────────────────────────────────────┘
            ▲                            ▲
            │                            │
   ┌────────┴────────┐          ┌────────┴────────┐
   │ Organizer Desk  │          │ Announcer / Big │
   │ (SvelteKit)     │          │ Screen Displays │
   └─────────────────┘          └─────────────────┘
```

## Components

### Cloudflare Worker (`apps/api`)
- **Framework**: Hono + TypeScript.
- **Responsibilities**:
  - REST API (`/contests`, `/competitors`, `/registrations`, `/attempts`, `/results`, `/settings`, `/system`).
  - D1 query layer with typed helper functions and Zod validation.
  - Event publication for real-time updates (`attempt.upserted`, `attempt.currentSet`, etc.).
  - Backup, restore, and health endpoints.
- **Bindings**:
  - `DB`: Cloudflare D1 instance (dev/prod variants).
  - `KV`: KV namespace for contest snapshots.
  - `werewolf-contest-room`: Durable Object that brokers WebSocket rooms per contest.

### Durable Object (`ContestRoom`)
- Tracks connected clients for a contest (desk, announcer, display).
- Stores the latest contest payload in-memory and mirrors to KV for cold-starts.
- Handles reconnection logic; falls back to HTTP polling when unavailable locally.

### KV Namespace
- Stores serialized contest snapshots and display payloads.
- Enables fast recovery when the Durable Object restarts or when a new display joins mid-flight.

### D1 Database
- SQLite-compatible relational store.
- Schemas defined in `werewolf-cloud/migrations/`.
- Reference data (age categories, weight classes, plate sets) seeded via migrations.
- `attempts.updated_at` column ensures displays show accurate timestamps.

### Frontend (`apps/web`)
- SvelteKit + Tailwind CSS + svelte-i18n.
- Features:
  - Contest dashboard with tabs for overview, competitors, attempts/live stream, settings.
  - Real-time stores (`contest-store.ts`, `realtime-store.ts`) that merge socket updates with optimistic mutations.
  - Global modal/toast systems and shared status badges.
  - Internationalisation with Polish default and English fallback.
- Builds with adapter-cloudflare for Pages deployment; dev mode uses adapter-auto hitting the local Worker.

### Display Routes
- `/display/current`: Full-screen scoreboard with plate plan, rack heights, and recent history.
- `/display/table`: Announcer-focused table with queue management and QR share for quick access.
- Both use the same real-time store; when WebSockets fail (common in local dev), they poll the Worker every 2s.

## Data Flow

1. **Organizer updates** – desk UI sends REST requests to the Worker.
2. **Worker persists** – updates D1, publishes events to ContestRoom, writes snapshot to KV.
3. **Displays receive** – ContestRoom pushes over WebSocket; fallback polls `/contests/:id/attempts/current`.
4. **Optimistic UI** – desk applies mutation immediately, rolls back if the API rejects it.

## Release Environments

| Environment | D1 Binding          | KV Binding            | Notes |
|-------------|--------------------|-----------------------|-------|
| `development` | `werewolf-d1-dev`   | `werewolf-kv-dev`     | Used by `wrangler.dev.toml`, data persisted in `.wrangler/state`. |
| `production`  | `werewolf-d1`       | `werewolf-kv`         | Deployed via `wrangler deploy --env production`. |

Env vars (`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `ENV`, `PUBLIC_API_BASE`) are loaded from `.env` locally and via Pages secrets in production.

## Testing Strategy

- **Unit Tests** – Vitest for domain logic, schema validation, and stores (`apps/api`, `apps/web`).
- **Integration Tests** – Miniflare-powered suite hitting Worker routes with in-memory D1/KV bindings (`apps/api/__tests__`).
- **UI Smoke Tests** – Vitest + @testing-library for modal flows and display updates; Playwright used manually for end-to-end display verification.
- **Type Safety** – `bun run typecheck` in both API and web workspaces; strict TypeScript with no implicit `any` allowed.

## Observability & Logging

- Structured request logs via Hono middleware (requestId, duration, status).
- Console logging in realtime bridge (`[realtime] state change`) to aid meet-day debugging.
- Wrangler tail can attach in production for live issue triage (`bunx wrangler tail werewolf --format pretty`).

## Offline & Resilience Strategy

- **WebSocket fallback**: automatic polling when Durable Object isn’t reachable.
- **Local cache**: contest snapshots cached in `localStorage` to survive reloads.
- **Future work**: IndexedDB mutation queue and preference sync (see post-migration action plan).

## Legacy Modules

The original Tauri application remains in the repository for historical reference. It is not part of the active deployment path but can be built with `bun run tauri dev` if a native offline fallback is required. All new work should happen inside `werewolf-cloud/` unless explicitly coordinating with legacy customers.


# Werewolf Cloud — Architecture

Source of truth for how the cloud app is put together. For endpoint details see
[api-endpoints.md](./api-endpoints.md); for open work see [BACKLOG.md](./BACKLOG.md); for deploy steps see
[deployment.md](./deployment.md).

## 1. Scope

- Cloudflare-native rewrite of the legacy Tauri desktop app. All active code lives in `werewolf-cloud/`;
  `src/` and `src-tauri/` are frozen legacy references and are not part of the deployment path.
- P0 target: one organizer account, one active contest per deployment, Polish/English UI, reliable
  meet-day desk with offline write queuing. Photos are out of scope.

## 2. Runtime topology

```
        Organizer desk / displays (SvelteKit, SPA + SSR build)
                        │  REST + WebSocket
                        ▼
        ┌───────────────────────────────┐
        │ Worker API (Hono)             │
        │  apps/api/src/app.ts          │
        │  routes/*, middleware/auth    │
        └───────┬───────────┬───────────┘
                │           │
        ┌───────▼─────┐ ┌───▼────────────────────┐
        │ D1 (DB)     │ │ ContestRoom Durable    │
        │ authoritative│ │ Object: in-memory     │
        └─────────────┘ │ WebSocket fan-out only │
                        └───────┬────────────────┘
        ┌─────────────┐         │ broadcast
        │ KV          │◀────────┘ (nothing is stored in the DO)
        │ sessions,   │
        │ caches,     │
        │ backup meta │
        └─────────────┘
```

### Worker API (`apps/api`)
- Hono + TypeScript, entry `src/index.ts` → `createApp()` in `src/app.ts`; routes are mounted in
  `src/routes/index.ts`.
- Request pipeline: request logger → CORS → Zod error normaliser → `/health` and `/` handlers →
  `requireAuth` → route modules → 404 catch-all.
- Validation uses `@hono/zod-validator` with schemas from `@werewolf/domain`; success responses use
  `{ data, error: null, requestId }`, errors `{ data: null, error, requestId }`. Zod failures are rewritten
  to `400 { error: "Validation failed: <path>: <message>" }`.
- CORS allows the local Vite origins plus the Pages/Worker origins and sends credentials (session cookie).

### D1
- Authoritative store. Schema and seed data live in `werewolf-cloud/migrations/` (applied versions are
  recorded in `d1_migrations`); helpers in `apps/api/src/utils/database.ts`.
- Domain data: contests, competitors, registrations (`flight_code`, `flight_order`, `labels`,
  `registration_lifts`), attempts, results, contest categories, contest tags, plate sets, settings,
  coefficient tables (`reshel_coefficients`, `mccullough_coefficients`).

### KV
- Session records (`session:<id>`, 14-day TTL), backup metadata (`backup_meta:`), display filter sync
  (`displaySync:<contestId>`), rankings caches and the 60-second public results bundle.
- KV is **not** live contest state and holds no room snapshots.

### ContestRoom Durable Object
- `apps/api/src/live/contest-room.ts`, bound as `werewolf-contest-room` (one instance per contest id).
- Keeps a `Set` of connected WebSockets and re-broadcasts JSON events; it emits a `heartbeat` every 25 s
  while clients are connected and answers the literal text `ping` with `pong`.
- It uses no Durable Object storage: nothing survives a restart and a client that connects late receives only
  future events. Current state always comes from D1 through the REST endpoints.
- Joining: `GET /ws/contests/:contestId` forwards the upgrade to the room. Publishing:
  `publishEvent()` in `apps/api/src/live/publish.ts` posts the event to the room's `/broadcast` route.

## 3. Realtime contract

Event envelope:

```json
{
  "type": "attempt.currentSet",
  "contestId": "<uuid>",
  "timestamp": "2025-09-18T12:34:56.000Z",
  "payload": { }
}
```

Events actually published today: `attempt.upserted`, `attempt.deleted`, `attempt.resultUpdated`,
`attempt.currentSet`, `attempt.currentCleared`, `registration.upserted`, `registration.deleted`,
`display.filtersSynced`, `display.qrVisibility`, `heartbeat`. `queue.updated`, `scoreboard.updated` and
`contest.stateChanged` exist in the `LiveEventType` union but are not emitted yet.

Client policy (`apps/web/src/lib/realtime.ts`):
- Connect over WebSocket; when the socket closes, immediately poll
  `GET /contests/:id/attempts/current` and `GET /contests/:id/attempts` every 2 s and retry the socket with
  exponential backoff (5 attempts max, 1 s → 30 s cap).
- Reconnect is "fetch latest state and resume": there is no event replay protocol and no server-side snapshot
  to catch up from. Displays also cache their last payload in `localStorage`.

## 4. Auth & access

- `POST /auth/login` accepts `{ password }`, compares it with the `ADMIN_PASSWORD` secret and sets the
  HttpOnly `werewolf_session` cookie; `POST /auth/logout` deletes it; `GET /auth/session` probes it.
- Sessions are random 32-byte ids stored in KV for 14 days and refreshed on use. In production the cookie is
  `Secure` with `SameSite=None` (the Pages frontend is cross-site); locally it is `SameSite=Lax`.
- `requireAuth` (`apps/api/src/middleware/auth.ts`) protects every non-GET request except `/`, `/health`
  and `/auth/*`. All GET routes — including displays — are public. `ENV=test` bypasses the check so the
  integration suite can call write routes directly.
- Single organizer account: there is no user table and no multi-tenant isolation.

## 5. Offline & resilience

- IndexedDB mutation queue (`apps/web/src/lib/offline/mutation-queue.ts`): `idb` database
  `werewolf_mutations` with a `mutations` store. Mutating calls that fail because the browser is offline or
  the request never reached the Worker are queued and replayed oldest-first when connectivity returns
  (backoff 1 s → 120 s cap); permanently failing entries land in a failed list with retry/discard controls.
- The desk keeps optimistic state while a mutation is queued; displays keep rendering their last payload.
- Reconnect semantics are described in §3: latest snapshot, no replay.

## 6. Frontend building blocks (`apps/web`)

- SvelteKit (Svelte 4) + Tailwind; i18n via `svelte-i18n` (`pl` default, `en` fallback, both bundles
  lazy-loaded in `src/lib/i18n/index.ts`).
- Shared state: `$lib/ui/contest-store.ts` (contest + registrations), `$lib/ui/realtime-store.ts`,
  `$lib/ui/notification-bridge.ts` (applies live events), `$lib/ui/modal.ts`, `$lib/ui/toast.ts`.
- Desk helpers: `$lib/current-attempt.ts`, `$lib/rising-bar.ts`, `$lib/contest-table.ts`,
  `$lib/filters/registrations.ts`, `$lib/plate-plan.ts`.
- Routes: contest wizard and desk under `/contests`, procedure screens (`/contests/[id]/squat`, `/bench`,
  `/deadlift`, `/desk`, `/plates`, `/registrations`, `/results`, `/team-results`), public
  `/display/current`, `/display/table`, `/display/share`, public `/results/[id]`, `/settings`, `/login`.

## 7. Environments & local development

| Config | Purpose | D1 | KV |
|--------|---------|----|----|
| `wrangler.dev.toml` | local Worker (`bun run dev`) | `werewolf-d1-dev` | dev namespace |
| `wrangler.worker.toml` | deployed API Worker (`env.production`) | `werewolf-d1` | production namespace |
| `wrangler.toml` | Pages frontend, points at the Worker via `script_name = "werewolf"` | production | production |

```bash
cd werewolf-cloud
bun install
bun run dev                                    # worker + local D1/KV on :8787 (applies migrations first)
cd apps/web && PUBLIC_API_BASE=http://127.0.0.1:8787 bun run dev   # SvelteKit on :5173
```

Deployment is `bun run deploy` (migrations → Worker → Pages); see [deployment.md](./deployment.md).
Provisioned ids and environments are documented in
[cloudflare-environments.md](./cloudflare-environments.md).

## 8. Coefficient tables

- Canonical data lives as JSON in `packages/domain/src/data/` (`reshel-men.json`, `reshel-women.json`,
  `mccullough.json`); each file records its `source` and `retrievedAt`.
- Load it into D1 with `scripts/seed-coefficients.ts` (run from `werewolf-cloud/`, needs `wrangler` on
  `PATH`). It wipes the affected ranges and re-inserts:
  ```bash
  bun run scripts/seed-coefficients.ts --local                      # werewolf-d1-dev via wrangler.dev.toml
  bun run scripts/seed-coefficients.ts --remote --database werewolf-d1 --env production
  ```
- After a reseed, call `POST /system/maintenance/recalculate-coefficients` and spot-check a few
  registrations with `GET /registrations/:id`.
- Lookup rules: bodyweight is rounded to the table increment (0.25 kg) and clamped to the published range;
  ages above the maximum clamp to the last entry.

## 9. Testing

- `bun run typecheck`, `bun run lint` (oxlint, `no-explicit-any`) and `bun run test` run the workspace
  checks from `werewolf-cloud/`.
- `config/vitest.config.ts` discovers `packages/**/*.test.ts`, `apps/api/**/*.test.ts` and
  `apps/web/src/lib/__tests__/**`. The Miniflare-backed API suite lives in `apps/api/__tests__/`.
- Web route/component tests use `apps/web/vitest.config.ts` (jsdom) and run from `apps/web`.

## 10. Known gaps

Backups still use KV instead of R2, the PWA shell/service worker is missing, the photo endpoints are still
wired up although photos are out of scope, and observability dashboards and E2E coverage are unfinished.
The current list, with what was verified in code, is in [BACKLOG.md](./BACKLOG.md).

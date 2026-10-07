# Werewolf Cloud — Requirements (P0)

Requirements still in force for the cloud app, in EARS form. Implemented items describe behaviour the code
must keep; gaps between a requirement and the code are tracked in [BACKLOG.md](./BACKLOG.md). Historical
plans and superseded requirements live in git.

## Product boundary
- [REQ-OVERVIEW] When meet directors run a competition, Werewolf Cloud shall manage the contest end to end through the Worker API, the SvelteKit frontend and D1.
- [REQ-LEGACY-BOUNDARY] When contributors scope new work, they shall treat `src/` and `src-tauri/` as a frozen legacy reference and deliver net-new code inside `werewolf-cloud/`.

## P0 scope decisions
- [REQ-AUTH-P0] When an organizer signs in, the platform shall use a single account with a password from the `ADMIN_PASSWORD` secret and an HttpOnly session cookie, using only free Cloudflare features.
- [REQ-SINGLE-TENANT-P0] When deploying P0, the system shall operate as single-tenant with one organizer account and one active contest.
- [REQ-PWA-P0] When the web app is installed, it shall work as a PWA with an offline shell and background sync for pending changes, assuming a single active editor.
- [REQ-OFFLINE-WRITES-P0] When a mutating request cannot reach the Worker, the frontend shall queue it in IndexedDB and replay it when connectivity returns.
- [REQ-RECONNECT-P0] When a client reconnects, it shall fetch the latest state over REST and resume; there is no event-replay protocol and the Durable Object keeps no snapshots.
- [REQ-BACKUP-R2-P0] When backups run, the platform shall store full backup blobs in R2 and keep small metadata in KV; encryption is optional.
- [REQ-PHOTOS-OUT-P0] When competitors are managed, the platform shall not include photo capture or storage features.
- [REQ-THEME-P0] When displays render, the platform shall support theming and branding presets configured in settings.
- [REQ-LIVE-SIMPLE-P0] When a meet is in progress, organizers shall follow one obvious workflow with minimal clicks; complex configuration must be finished before the meet starts.

## API and data
- [REQ-API-CONTESTS] When contest data is requested, the API shall expose CRUD under `/contests`, validate with shared Zod schemas and seed plate sets, categories and tags on creation.
- [REQ-API-REGISTRATIONS] When lifters are registered, the API shall store competitor data, auto-classify age/weight categories, compute Reshel/McCullough coefficients and expose enriched registration lists.
- [REQ-API-ATTEMPTS] When operators change attempts, the API shall validate the weight is loadable with the contest plate set plus clamp, enforce the registration's active lifts and expose current/queue endpoints.
- [REQ-API-RESULTS] When results are requested, the API shall provide rankings (open/age/weight/tag), team standings and CSV/JSON export.
- [REQ-API-SYSTEM] When health is checked, the API shall report D1 connectivity, row counts and backup metadata under `/system`.
- [REQ-ENVELOPE] When any endpoint responds, it shall use `{ data, error, requestId }` for success and `{ data: null, error, requestId }` for failures.
- [REQ-DB-MIGRATIONS] When migrations exist in `werewolf-cloud/migrations`, the toolchain shall apply them through Wrangler and record versions in `d1_migrations`; applied SQL is never edited.
- [REQ-DB-FIELDS] When flights, labels or clamp weights are used, the schema shall store `registrations.flight_code`, `registrations.flight_order`, `registrations.labels`, `contests.active_flight` and `contests.clamp_weight`.

## Lifting order and flights
- [REQ-ORDER-RISING-BAR] When the queue is generated for a lift and round, the system shall sort pending attempts by weight ascending, breaking ties by flight order and then name.
- [REQ-ORDER-ROUND-ADVANCE] When the operator advances a round, the system shall re-sort from the updated declared weights; automatic round advance is deferred.
- [REQ-ORDER-FLIGHT-GATING] When an active flight is set, the queue shall include only attempts whose registration belongs to that flight.

## Realtime
- [REQ-RT-DURABLE-ROOM] When a contest session starts, the Worker shall initialise one `ContestRoom` Durable Object per contest for in-memory WebSocket fan-out.
- [REQ-RT-WEBSOCKET] When clients subscribe, the platform shall stream WebSocket events and fall back to 2-second polling when the socket is unavailable.
- [REQ-RT-QUEUE-REFRESH] When the current attempt, declared weights or active flight change, the live queue and announcer views shall reflect the updated rising-bar order with flight gating applied.

## Frontend
- [REQ-UI-DESK] When the organizer desk loads, the app shall present contest overview, registrations table, attempt grid, queue controls and judge override tools backed by the realtime store.
- [REQ-UI-UNIFIED-TABLE] When organizers open the registrations tab, the UI shall show one sortable table with place, name, city/club, sex, flight, categories, bodyweight (inline edit), coefficients, rack heights, declared attempts, points and max lift, with labels as chips.
- [REQ-UI-DISPLAYS] When the announcer table or big-screen display runs, it shall render rising-bar order, current lifter, plate plan and recent history, and refresh automatically.
- [REQ-UI-I18N] When UI copy renders, it shall come from the `pl`/`en` dictionaries with runtime language switching; Polish is the default.
- [REQ-UI-LABELS] When a registration has labels, the UI shall render them and let operators add or remove them immediately.

## Results
- [REQ-RESULTS-TABS] When viewing results, operators shall be able to switch between open, age, weight and tag views with best lifts, totals and points.
- [REQ-RESULTS-UNIFORMED] When the uniformed/Open tagged board is in use, the system shall expose a dedicated leaderboard independent of age and weight classes.

## Operations
- [REQ-OPS-WRANGLER] When developers run `bun run dev`, the toolchain shall start Wrangler with local D1, KV and Durable Object bindings and apply seed migrations first.
- [REQ-OPS-CHECKS] When contributors submit changes, they shall run `bun run check` (typecheck, oxlint, Vitest) inside `werewolf-cloud/`.
- [REQ-OPS-TELEMETRY] When the system runs in production, it shall emit structured request logs with request ids and expose D1/KV state through `/system` and `/settings/health`.
- [REQ-SEC-CREDENTIALS] When environment secrets are required, the platform shall load them through Wrangler secrets or git-ignored local files.
- [REQ-SEC-AUDIT] (Later) When contest mutations occur, the system shall record audit entries with actor, timestamp and before/after payloads; excluded from P0.

## Later
- [REQ-MT-LATER] When multi-tenant is introduced, each customer shall have an isolated database; out of scope for P0.
- [REQ-MULTI-CONTEST-LATER] When concurrent contests are needed, the platform shall route Durable Objects and D1 queries per contest; out of scope for P0.

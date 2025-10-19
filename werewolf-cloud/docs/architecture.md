# Werewolf Cloud – Architecture & Constraints

This document captures the agreed constraints, architecture decisions, and concrete specs for implementing live competition features and UI flows. Treat this as the source of truth for the PoC and subsequent iterations.

## 1) Scope & Constraints

- Deployment: Cloudflare Workers + Hono (API), D1 (DB), KV (auxiliary), Durable Objects (realtime fan‑out).
- Transport: WebSockets via Durable Object per contest. Fallback to polling (1–2s acceptable). SSE optional later.
- Latency target: 1–2 seconds end‑to‑end is sufficient.
- Public views: Announcer table and big‑screen current lift are public (no auth). Management UI remains admin‑only.
- Events to broadcast: attempts upsert/result updates, current attempt changes, optional queue updates. Do not broadcast competitor/registration changes in PoC.
- Active contests: Single active contest for PoC (room per contest still supported).
- State of truth: D1 is authoritative. DO provides in‑memory fan‑out only. KV is not used for live state (use later for backups/snapshots only).
- Offline tolerance: Management UI queues writes offline and replays on reconnect; displays show last snapshot and auto‑poll until realtime reconnects.

## 2) Realtime Architecture

- Durable Object: `ContestRoom` manages WebSocket connections per contest and broadcasts JSON events.
- Join endpoint: `GET /ws/contests/:contestId` forwards upgrade to the DO instance.
- Broadcast hooks: attempt routes publish to the room after DB mutation.
- Heartbeat: DO emits `heartbeat` every ~25s for connection liveness.

Event envelope (JSON):
```
{
  "type": "attempt.upserted" | "attempt.resultUpdated" | "attempt.currentSet" | "attempt.currentCleared" | "queue.updated" | "scoreboard.updated" | "contest.stateChanged" | "heartbeat",
  "contestId": "<uuid>",
  "timestamp": "2025-09-18T12:34:56.000Z",
  "payload": { /* event-specific fields */ }
}
```

Attempt summary payload (typical):
```
{
  "attemptId": "<uuid>",
  "registrationId": "<uuid>",
  "liftType": "Squat" | "Bench" | "Deadlift",
  "attemptNumber": 1 | 2 | 3 | 4,
  "weight": 220.0,
  "status": "Pending" | "Successful" | "Failed",
  "firstName": "Jane",
  "lastName": "Doe",
  "competitorName": "Jane Doe",
  "competitionOrder": 7,
  "updatedAt": "2025-09-18T12:34:56.000Z"
}
```

Client policy:
- Try WS first; on failure, fall back to polling `GET /contests/:id/attempts/current` and `GET /contests/:id/attempts` every 1–2s.
- Reconnect with exponential backoff.

## 3) UI Surfaces (Three Screens)

- Management (admin): existing contest detail becomes control hub; shows connection status; applies live events to current attempt and attempts list. Offline write‑queue support (IndexedDB) for POST/PATCH/PUT requests.
  - Per registration “Edit attempts” modal exposes 3 attempts × lifts grid; saves via POST `/contests/:contestId/registrations/:registrationId/attempts` and refreshes list.
  - Attempt rows provide status selector (Pending/Successful/Failed) backed by `PATCH /attempts/:id/result` with optimistic label updates.
  - “Set current” button issues `PUT /contests/:contestId/attempts/current`; current panel offers “Clear current” (DELETE) to release displays.
  - Toasts summarise outcomes; realtime bridge keeps contest store and displays in sync (events: `attempt.upserted`, `attempt.resultUpdated`, `attempt.currentSet`, `attempt.currentCleared`).
- Announcer Table (public): `/display/table` – readonly, large rows; columns include rotation order, name, lift, attempt #, weight, status. Uses WS/polling.
- Big‑Screen Current (public): `/display/current` – shows current lifter, attempt #, weight, rack heights, lights (judge decisions), basic timer; full‑screen layout.

## 4) Competition Modeling & Wizard

Baseline today (schema): `contests.discipline` is a single value: `Bench | Squat | Deadlift | Powerlifting`.

New requirement:
- Wizard must support building competitions from exercises (e.g., “Deadlift + Bench” push‑pull). Most events are Deadlift + Bench.
- Constraint: Do not include any “club” input in the Contest Wizard. “Club” belongs to competitor profiles only.

Recommended data model change (non‑breaking):
- Add table `contest_disciplines` with rows `(contest_id, lift_type)` to support any subset/ordering of lifts per contest.
- Keep `contests.discipline` for backward compatibility and default presets:
  - Powerlifting → [Squat, Bench, Deadlift]
  - Bench → [Bench]
  - Deadlift → [Deadlift]
  - PushPull (new preset) → [Bench, Deadlift]
- UI: Contest Wizard presets plus “Custom” (multi‑select lifts). Persist to `contest_disciplines`. If table empty, fall back to `contests.discipline` preset.

Migration sketch (0008):
```
CREATE TABLE IF NOT EXISTS contest_disciplines (
  contest_id TEXT NOT NULL,
  lift_type TEXT NOT NULL CHECK(lift_type IN ('Bench','Squat','Deadlift')),
  position INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (contest_id, lift_type),
  FOREIGN KEY (contest_id) REFERENCES contests(id) ON DELETE CASCADE
);
-- optional backfill based on existing contests.discipline
```

API additions:
- `GET /contests/:id/disciplines` → ordered list of lifts.
- `PUT /contests/:id/disciplines` → replace full list (admin only).
- Contest state machine should respect this order for `current_lift` rotation and queue.

Frontend wizard:
- Step “Disciplines”: choose preset (Powerlifting, Bench‑Only, Deadlift‑Only, Push‑Pull) or Custom (multi‑select). No “club” field here.
- “Club” remains part of Competitor profiles/Registrations, not a contest‑level field.

## 5) Offline Strategy

- Management (admin):
  - Cache core entities (contest, registrations, attempts, state) in IndexedDB.
  - Queue mutations locally with idempotency keys; replay on reconnect.
  - Visual banner for offline with pending count.
- Public displays:
  - Cache last snapshot in localStorage; when offline, keep rendering snapshot.
  - Poll until WS reconnects; indicate “Disconnected” subtly.

## 6) Security & Access

- Public (read‑only) routes: announcer and big‑screen pages; corresponding REST endpoints remain public for reads.
- Admin (write): protected via planned admin token/session; for PoC, local dev and trusted operator only.
- API response envelope stays `{ data, error, requestId }` for success; errors `{ data: null, error, requestId }`.

## 7) Operations & Environments

- Wrangler config binds D1/KV/ROOM (DO) for dev and prod. See `wrangler.worker.toml` for the API Worker and `wrangler.toml` for Pages.
- Dev:
  - Backend: `nix develop -c wrangler dev --local --config wrangler.worker.toml --port 8787`
  - Frontend: `PUBLIC_API_BASE=http://127.0.0.1:8787 bun run dev`
- Deploy: `wrangler deploy --env production --config wrangler.worker.toml`

## 8) Coefficient Data Maintenance

- **Storage**: Official Reshel and McCullough coefficients live in D1 tables `reshel_coefficients` (PK: gender + bodyweight_kg) and `mccullough_coefficients` (PK: age). Each record keeps source URL and retrieval timestamp so we can track revisions.
- **Canonical Assets**: JSON exports are committed under `packages/domain/src/data/` (`reshel-men.json`, `reshel-women.json`, `mccullough.json`). Update these files first whenever federations publish new tables.
- **Seeding**: Use the Bun script to load JSON into D1:
  - Local: `bun run scripts/seed-coefficients.ts --local --config wrangler.dev.toml`
  - Remote: `bun run scripts/seed-coefficients.ts --database werewolf-d1 --env production`
  The script wipes existing rows for the affected gender/age range and re-inserts from the JSON payload.
- **Refresh Workflow**:
  1. Regenerate JSON from the official PDFs (see `scripts/seed-coefficients.ts` comments). The extraction currently relies on pdfminer via the project virtualenv; rerun the helper and commit the regenerated JSON.
  2. Bump `retrievedAt` in the JSON file to the extraction timestamp and note the change in `docs/coefficients-parity-plan.md`.
  3. Re-run the seed script locally and in production.
  4. Execute coefficient regression tests (`bun run test` at repo root plus `cd apps/web && bun run test:run`) before sign-off and archive the run in `docs/api-test-results.md`.
- **Operational checklist** (print for production workflows):
  - Follow the refresh workflow above, then hit `POST /system/maintenance/recalculate-coefficients` to rehydrate existing registrations.
  - Spot-check representative lifters (lightweight female, heavyweight male, masters age brackets) with `GET /registrations/{id}` to confirm stored coefficients match the reference table.
  - Update the “Coefficient tables” stanza in `docs/api-endpoints.md` if source URLs change, and log the maintenance window in `docs/post-migration-action-plan.md`.
- **Fallback Policy**: Until Foster coefficients are onboarded, lifters younger than 40 default to 1.00. Ages above the published maximum clamp to the final entry (currently 90 → 2.549).
- **Rounding Rule**: Bodyweight values are rounded to the nearest 0.25 kg (dataset increment) and clamped to the table range before lookup. When no exact match exists, the closest entry is used.
- **Maintenance Endpoint**: `POST /system/maintenance/recalculate-coefficients` recalculates Reshel/McCullough values (and derived categories/classes) for all registrations using the D1 tables. Use after updating datasets or when data drift is suspected.

## 9) Using Modal/Toast/Contest Store

### Modal System
`modalStore` centralises dialog presentation. Use `modalStore.open<T>()` to display a dialog and await the user's decision while the global modal host handles accessibility (focus trap, ARIA labels, ESC/backdrop handling).

```ts
import { modalStore } from '$lib/ui/modal';

async function confirmReset() {
  const confirmed = await modalStore.open<boolean>({
    title: 'Reset contest?',
    content: 'All attempts will be cleared.',
    confirmText: 'Reset',
    cancelText: 'Cancel',
    variant: 'danger',
  });

  if (confirmed) {
    // perform reset
  }
}
```

### Toast Notifications
`toast` exposes helpers to surface transient messages. The global `ToastList` component is already mounted in the root layout, so features simply call the helper functions.

```ts
import { toast } from '$lib/ui/toast';

toast.success('Contest created successfully');
toast.error('Failed to save registration', { duration: 7000 });
toast.warning('Connection unstable – working offline');
toast.info('Next attempt queued');
```

### Contest Store
`contestStore` keeps contest state in sync across components and realtime events. Seed it after fetching contest data, then consume the derived stores for reactivity.

```ts
import { contestStore, currentContest, currentRegistrations } from '$lib/ui/contest-store';

contestStore.setContest(contest, registrations);

$: contest = $currentContest;
$: registrations = $currentRegistrations;
```

The notification bridge updates `contestStore` whenever WebSocket events arrive, so displays and management screens automatically reflect live data.

### Live Display Payloads
- `attempt.currentSet` events now publish a display-ready bundle (contest metadata, competitor/registration snapshot, attempts grouped by lift, and a server-computed plate plan). See `apps/api/src/services/attempts.ts`.
- `/contests/{id}/attempts/current` returns the same payload so polling fallbacks and initial page loads share a single contract.
- Frontend helpers (`$lib/current-attempt.ts`) normalise bundles into lightweight summaries for operator UI while keeping full context for displays.

## 10) Open Items (tracked)

- Add `contest_disciplines` table and API routes (0008 migration).

## 11) Offline Mutation Queue (Current Implementation)

To keep the meet desk usable during short connectivity drops we now ship an IndexedDB-backed queue beneath the existing API client (`$lib/offline/mutation-queue.ts`):

- **Storage**: `idb` database `werewolf_mutations` (v1) with a `mutations` object store keyed by GUID. Each record stores `{ id, createdAt, endpoint, method, body, headers, retryCount, status, lastError }`. Derived stores expose `pending`, `failed`, and `inFlight` slices plus aggregated counts for the layout badge.
- **Enqueue rules**: whenever `navigator.onLine === false` or a request throws an `ApiError` with `status === 0` we persist the mutation, emit `queue.toast.saved`, and keep the optimistic UI that already applied the change.
- **Replay engine**: `registerMutationExecutor` replays the oldest pending mutation as soon as connectivity returns. Successes are batched into a single toast (`synced_single` / `synced_multi`). Network failures trigger exponential backoff (1 s → 2 s → … capped at 120 s); non-network failures move the item to the `failed` column and surface `queue.toast.failed` with the offending endpoint.
- **Client integration**: `apiClient.post/put/patch/delete` delegates to `enqueueMutation` whenever we are offline or a network exception bubbles up so every mutating call participates automatically. `GET` routes stay untouched.
- **UI feedback**: the header button now distinguishes healthy vs. failing queues (`Queued changes: {total}` vs. `Queue issues – {failed} failed / {pending} pending`) and links to the drawer. The modal shows live counts for pending/in-flight/failed entries with retry/discard controls and localized timestamps.
- **Resilience**: the queue loads persisted entries on boot, hooks `online` events to resume processing, and tolerates browsers without IndexedDB by falling back to a warning toast (`queue.toast.unsupported`). Cursor failures during teardown are swallowed to avoid noisy console warnings in tests.
- **Testing**: `apps/web/src/lib/offline/__tests__/mutation-queue.test.ts` exercises enqueue, replay, fatal failure, retry flows, and verifies toast copy.

Remaining polish ideas (tracked in `docs/OPEN-ISSUES.md`): coalescing writes to the same resource, surfacing queue state in diagnostics, and wiring background sync once we adopt service workers.

## 11) Operator Runbook – Attempts & Displays

1. **Prepare backend**
   - Confirm the worker is running: `bun run dev` from the repo root (wrangler dev) and ensure D1 migrations are applied locally.
   - Frontend connects to the worker via `PUBLIC_API_BASE=http://127.0.0.1:8787 bun run dev`.

2. **Contest desk workflow ( `/contests/:id` )**
   - Registrations tab → *Edytuj podejścia*: opens the attempt grid. Each lift (Przysiad, Wyciskanie, Martwy ciąg) exposes Attempt 1–3 (4th enabled when federation rules allow). Saving issues POST `/contests/:id/registrations/:registrationId/attempts` once per cell.
   - “Szybkie + podejście” button duplicates the current weight + increment for the next empty slot, respecting max attempts. Errors surface as translated toasts.
   - Attempts & Live tab lists every attempt. Status selector persists via `PATCH /attempts/:id/result`. Judge decisions default to null and can be extended later.
   - “Ustaw jako aktualne” → `PUT /contests/:id/attempts/current`; the right‑hand panel mirrors the payload. “Wyczyść aktualne” issues DELETE and immediately clears displays.
   - Connection badge shows `Połączono`, `Łączenie…`, or `Tryb polling` depending on WebSocket state. Polling is expected locally because Durable Objects are not emulated; production remains WebSocket‑first.

3. **Display endpoints**
   - `GET /contests/:id/attempts/current` and `attempt.currentSet` events both return a *display bundle*:
     ```json
     {
       "contest": { "id": "…", "name": "…", "status": "Live", "mensBarWeight": 20, "womensBarWeight": 15 },
       "attempt": { "id": "…", "liftType": "Bench", "attemptNumber": 1, "weight": 140, "status": "Pending", "updatedAt": "…" },
      "registration": { "id": "…", "contestId": "…", "weightClassId": "…", "rackHeightSquat": 10, … },
       "competitor": { "firstName": "Piotr", "lastName": "Lis", "club": null, … },
       "attemptsByLift": { "Squat": [], "Bench": [ { "attemptNumber": 1, "weight": 140 } ], "Deadlift": [] },
       "platePlan": { "plates": [ { "plateWeight": 20, "count": 1 } ], "targetWeight": 140, "barWeight": 20, "exact": true },
       "highlight": { "liftType": "Bench", "attemptNumber": 1 }
     }
     ```
   - `/display/current` listens for the same bundle; last snapshot is cached in `localStorage` for offline continuity. `/display/table` consumes the lighter `attempt.upserted`/`attempt.resultUpdated` events and surfaces queue/plans for the announcer.

4. **Live event flow**
   - **Upsert** → `attempt.upserted` with attempt + competitor metadata.
   - **Result update** → `attempt.resultUpdated` with new status/judge calls.
   - **Set current** → `attempt.currentSet` with display bundle (see above).
   - **Clear current** → `attempt.currentCleared` (payload `{ success: true }`).
   - Displays automatically degrade to polling every 2s when the connection badge reports “Polling”. When the Durable Object becomes reachable again, the badge flips back to “Live”.

5. **Troubleshooting**
   - If display badges stay “Offline” in local dev, confirm the worker is running; Durable Objects are disabled locally by design, so expect occasional reconnect toasts. Production should remain stable.
   - If attempt weights fail to save, check toast errors – most originate from validation (weight must be > 0) or missing registration IDs.
   - To reset state: `bunx wrangler@latest d1 execute werewolf-d1-dev --local --command "DELETE FROM current_lifts"` and refresh; production requires the remote variant (see migration notes below).

## 10) Contest Categories

- Contest-specific age and weight categories live in D1 tables `contest_age_categories` and `contest_weight_classes`. Contest creation seeds the URP defaults, but operators can tailor the list per meet.
- API surface:
  - `GET /contests/:id/categories` returns `{ ageCategories, weightClasses }` (camelCase, includes IDs and sort orders).
  - `PUT /contests/:id/categories` replaces both lists. Validation ensures non-empty codes/names, ordered ranges, and rejects deletion of categories referenced by existing registrations.
  - `POST /contests/:id/categories/defaults` re-applies the URP template. This endpoint is blocked once registrations exist.
- Frontend:
  - The contest wizard (step 2) now exposes tables to edit age and weight categories before creating the contest. If operators diverge from the defaults, the wizard applies the new sets immediately after contest creation so auto-classification uses the tailored ranges.
  - Contest detail adds a “Manage categories” action in the registrations card. The modal uses the same `PUT`/`POST` endpoints and updates the contest store so tables, modals, announcer, and display screens reflect the new labels instantly.
- Shared helpers (`$lib/categories.ts`) provide default templates, validation (`validateCategories`), payload builders (`buildCategoryPayload`), and translation-friendly error formatting; reuse them for any future tooling or CLI scripts.

---

References
- WS & DO foundation: apps/api/src/live/*, wrangler.worker.toml DO binding.
- Event producers: apps/api/src/routes/attempts.ts (upsert, result update, current set).
- Domain logic: packages/domain/src/services/score-engine.ts.

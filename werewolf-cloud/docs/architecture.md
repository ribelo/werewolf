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
  "type": "attempt.upserted" | "attempt.resultUpdated" | "attempt.currentSet" | "queue.updated" | "scoreboard.updated" | "contest.stateChanged" | "heartbeat",
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
  "status": "Pending" | "Successful" | "Failed" | "Skipped" // when applicable
}
```

Client policy:
- Try WS first; on failure, fall back to polling `GET /contests/:id/attempts/current` and `GET /contests/:id/attempts` every 1–2s.
- Reconnect with exponential backoff.

## 3) UI Surfaces (Three Screens)

- Management (admin): existing contest detail becomes control hub; shows connection status; applies live events to current attempt and attempts list. Offline write‑queue support (IndexedDB) for POST/PATCH/PUT requests.
- Announcer Table (public): `/display/table` – readonly, large rows; columns include lot, name, lift, attempt #, weight, status. Uses WS/polling.
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

- Wrangler config binds D1/KV/ROOM (DO) for dev and prod. See `wrangler.toml`.
- Dev:
  - Backend: `nix develop -c wrangler dev --local --config wrangler.toml --port 8787`
  - Frontend: `PUBLIC_API_BASE=http://127.0.0.1:8787 bun run dev`
- Deploy: `wrangler deploy --env production`

## 8) Open Items (tracked)

- Add `contest_disciplines` table and API routes (0008 migration).
- Implement `/display/table` and `/display/current` pages.
- Realtime client with backoff and polling fallback.
- Management offline queue (IndexedDB) – PoC scope.
- Optional: scoreboard computation endpoint and broadcast on result updates.

---

References
- WS & DO foundation: apps/api/src/live/*, wrangler.toml DO binding.
- Event producers: apps/api/src/routes/attempts.ts (upsert, result update, current set).
- Domain logic: packages/domain/src/services/score-engine.ts.


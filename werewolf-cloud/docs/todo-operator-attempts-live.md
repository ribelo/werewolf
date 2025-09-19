# Operator Attempts & Current Lift — TODO

Scope: implement add/edit attempts, judge results, and set/clear current lift with real‑time updates to announcer/big‑screen.

Legend: [ ] pending · [x] completed · [~] in progress

## Phase 0 — Baseline
- [x] Confirm dev stack runs (worker + web)
- [x] Contest page renders; “Attempts & Live” tab shows table

## Phase 1 — Backend Gaps
- [x] PATCH `\/attempts\/:id\/result` to update status + judges + timestamps and publish `attempt.resultUpdated`
- [x] DELETE `\/contests\/:contestId\/attempts\/current` to clear current and publish `attempt.currentCleared`
- [x] Update docs/api-endpoints.md with examples

Acceptance
- [ ] Curl can update one attempt result; UI reflects change without refresh
- [ ] Clearing current hides current panel on display/announcer

## Phase 2 — Operator UI: Add/Edit Attempts
- [x] Per registration “Edit Attempts” modal (3 lifts × attempts grid) with Save
- [ ] Quick “+ Attempt” action (prefills next attempt for current lift)
- [~] Optimistic updates; rollback on error

Acceptance
- [ ] Adding/editing attempts updates the “Attempts & Live” tab immediately

## Phase 3 — Operator UI: Judge Result + Set Current
- [x] Segmented control on each attempt row: Pending | Good | No Lift | Skipped
- [x] “Set as current” action on each attempt row (PUT `\/contests\/:contestId\/attempts\/current`)
- [x] “Clear current” on current panel (DELETE route from Phase 1)

Acceptance
- [ ] Status toggles update instantly and persist
- [ ] Current lift switches big‑screen/announcer within 1–2s

## Phase 4 — Real‑time Wiring
- [x] Ensure API publishes: `attempt.upserted`, `attempt.resultUpdated`, `attempt.currentSet`, `attempt.currentCleared`
- [x] Client handlers merge/upsert attempts, update current, and clear correctly
- [x] Keep polling fallback when WS unavailable

Acceptance
- [ ] All changes propagate without manual refresh; polling covers DO‑less local dev

## Phase 5 — Display/Announcer UX
- [x] Current panel: name, lift, attempt no., weight, status, updated time
- [x] Recent attempts list (last 5 completed) stays in sync

## Phase 6 — Types, i18n, polish
- [x] Extend Attempt type (judge decisions, updatedAt, timestamp)
- [ ] i18n keys for new buttons/status/toasts; use `$_('key', { values })` only
- [ ] No svelte‑i18n warnings in console

## Phase 7 — Testing
- [ ] Vitest API integration: upsert, result patch, set/clear current (success + error)
- [ ] Vitest UI smoke: open modal, save weights, toggle status, set current

## Phase 8 — Docs & Runbook
- [ ] Operator guide (where to edit attempts, set/clear current; local WS vs polling note)
- [x] API docs updated; curl examples for new routes
- [ ] DB: run `0008_add_attempt_updated_at.sql` on remote (`wrangler d1 migrations apply --remote`)

Completed already
- [x] Add `attempts.updated_at` column (migration `0008_add_attempt_updated_at.sql`) and apply locally

Notes
- Local dev shows occasional “connection lost” toast (DO not emulated). Polling fallback ensures UI stays fresh.
- Organizer is required in wizard; federation rules/notes optional; lots removed.

## Phase 9 — Display & Announcer Parity
- [x] Backend: emit display-ready payloads (registration, competitor, attempts by lift, plate plan) with `attempt.currentSet`
- [x] Update `/contests/:id/attempts/current` to return display payload for polling fallback
- [x] Frontend: adapt realtime client/types to new payload structure
- [x] Rebuild current display screen with attempt matrix, rack heights, plate plan, equipment info (no photo)
- [x] Enhance announcer table to show plate plan + metadata when available
- [ ] Tests: cover payload builder + display rendering smoke
- [ ] Docs: describe display event contract + plate plan source

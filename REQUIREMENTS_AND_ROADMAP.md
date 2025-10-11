# Werewolf Cloud – Requirements & Roadmap

_Last updated: 2025-09-20_

## Product Scope

### Out of Scope
- Multi-platform/flight orchestration (single active contest per deployment).
- Federation uploads or official scoring certifications.
- Timer controls, referee tablets, or jury decision workflows.
- Authenticated multi-tenant setup (planned as a follow-up after parity).
- Hardware integrations (judging lights, weigh-in scales, etc.).

### In Scope
- Contest creation wizard with configurable events (squat/bench/deadlift combos).
- Competitor registration with auto-classification (age/weight) and equipment flags.
- Attempt management (edit grid, quick add, judge result override, set/clear current).
- Dual-display support (announcer table, big-screen scoreboard) with realtime sync.
- Backup/restore APIs and eventual data export (CSV/JSON).
- Offline resilience via optimistic updates and planned mutation queue.

## Current Capabilities (2025-09)
- ✅ Worker API (Hono) with full CRUD, realtime events, backup, system health.
- ✅ D1 migrations and schema parity (attempts.updated_at, plate metadata).
- ✅ Organizer UI with attempt desk, quick-add, optimistic updates.
- ✅ Announcer and big-screen displays with plate plan, history, QR sharing.
- ✅ Polish/English localisation with runtime switching.
- ✅ Integration/unit tests across API and UI.
- 🔄 Results export and offline mutation queue (tracked below).

## Roadmap

### Phase A — Release Readiness (In Progress)
1. **Documentation Closure**
   - API examples with real curl captures.
   - Finish user guide/FAQ (done) and publish migration story.
2. **Results Export**
   - CSV + JSON export endpoints implemented (`POST /contests/:id/results/export`).
   - Next step: design richer exports (per-federation templates, PDFs) after release.
3. **Settings Diagnostics**
   - Implement KV diagnostics card.
   - Add DB/backup history list.

### Phase B — Reliability Enhancements
1. **Offline Mutation Queue**
   - IndexedDB-backed queue for admin mutations when offline.
   - Retry/backoff strategy with UI indicators.
2. **Bundle Optimisation**
   - Code split display routes and contest wizard.
   - Measure impact with Vite visualiser.
3. **Extended Test Coverage**
   - Strengthen settings PATCH tests, realtime polling isolation, and Playwright end-to-end suite.

### Phase C — Advanced Features (Post-Launch)
1. **Multi-Contest Mode**
   - Allow concurrent contests with explicit context switching.
2. **Auth & Audit**
   - Introduce Cloudflare Access or signed tokens, plus audit logs in D1.
3. **Public Audience Portal**
   - Read-only web view with schedule, live results, QR distribution.
4. **Export Enhancements**
   - Federation-specific exports, PDF certificates, scoreboard themes.

## Success Criteria

| Milestone | Criteria |
|-----------|----------|
| Release Candidate | Contest workflow executed end-to-end, docs complete, tests green, displays synced in real time. |
| Reliability Sprint | Offline queue in place, bundle optimised, backend warnings resolved. |
| Post-Launch | Auth/audit optional, exports enhanced, public portal live. |

## Tracking

- Tactical work items: `docs/post-migration-action-plan.md`
- Known issues and limitations: `docs/OPEN-ISSUES.md`
- Operator workflow TODOs: `docs/todo-operator-attempts-live.md` (historical, all checked off)

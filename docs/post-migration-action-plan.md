# Werewolf Cloud Post-Migration Completion Plan

_Last updated: 2025-09-20_

## Guiding Principles
- Ship the remaining parity items before starting net-new features.
- Keep docs, tests, and UI in lock-step; every visible change needs matching coverage and guidance.
- Prefer small, reviewable PR-sized batches (~1-2 days of work each).

## Phase 0 — Scheduling & Ownership
1. **Assign leads**
   - Backend: ___
   - Frontend: ___
   - Docs/QA: ___
2. **Tooling reminder**
   - Enforce `bun run check`, `bun run test`, `bun run test:run`, `bun run lint` pre-commit.
   - Use wrangler dev shell (`bun run dev`) + `PUBLIC_API_BASE=http://127.0.0.1:8787 bun run dev` for manual testing.
3. **Status cadence**
   - Stand-up capture in `docs/migration-execution-plan.md` status table.
   - Flag blockers in `docs/OPEN-ISSUES.md`.

## Phase 1 — Documentation Cleanup (Blocker)
1. **User-facing docs**
   - Either publish `docs/USER_GUIDE.md` & `docs/FAQ.md` or remove “coming soon” bullets from README.
   - Flesh out `docs/ARCHITECTURE.md` section 10 background; remove `Blank background (details TBD)`.
   - Update `CLAUDE.md` design notes replacing `details TBD`.
2. **Developer docs**
   - Close out `docs/migration-execution-plan.md:307` by capturing real curl/API outputs in parity matrix + `docs/api-endpoints.md`.
   - Resolve TBDs in `REQUIREMENTS_AND_ROADMAP.md` (commit to export format or defer explicitly in roadmap).
3. **Deliverable**: README, architecture, and roadmap contain no “coming soon/TBD” markers unless tied to a scheduled milestone.

## Phase 2 — Automated Test Gaps
1. **Realtime suite** (`apps/web/src/routes/__tests__/realtime.test.ts`)
   - Fix polling interference (create mock fetch + clock reset).
   - Repair heartbeat timer test and remove TODO comments.
   - **Status:** ✅ Completed 2025-09-20 (contest filtering + heartbeat ping tests restored).
2. **Settings PATCH coverage**
   - Add Vitest cases covering invalid payload + rollback behaviour (UI + API layer).
   - **Status:** ✅ Completed 2025-09-20 (backend validation + UI rollback tests added).
3. **Definition of Done**: `rg "TODO" apps/web/src/routes/__tests__/realtime.test.ts` returns empty; new coverage documented in `docs/OPEN-ISSUES.md`.
   - **Status:** ✅ Verified 2025-09-20 (file free of TODO, open issues updated).

## Phase 3 — UI Placeholder Burn-down
1. **Contest detail cards** (results / plate sets / backups)
   - Implement real content or hide cards until APIs exist.
   - If deferred, add tracking item to roadmap with ETA.
   - **Status:** ✅ Completed 2025-09-20 (results table, plate inventory, and backup summary wired to live API data).
2. **Display strings audit**
   - Sweep for untranslated strings (e.g., contest desk queue counts, display screens, competitor modal) ensuring `pl.json`/`en.json` entries.
   - **Status:** ✅ Completed 2025-09-20 (new strings localised; legacy fallback texts removed).
3. **Definition of Done**: No placeholder copy (`{count}`, “placeholder”) visible in UI during manual regression; translation console free of `svelte-i18n` warnings.
   - **Status:** ✅ Verified 2025-09-20 (contest detail tabs show production text; dev console clean except for known prop warnings).

## Phase 4 — Backend/Data Follow-ups
1. **Schema audit**
   - Compare D1 schema (plate colors, JSON columns) against legacy SQLite migrations; document deviations and patch if needed.
   - **Status:** ✅ Completed 2025-09-20 (`docs/schema-audit-2025-09-20.md`).
2. **Legacy cleanup**
   - Tauri `src-tauri` TODOs: either remove directory (if deprecated) or implement missing result commands.
   - **Status:** ✅ Completed 2025-09-20 (legacy comment clarified, TODO removed in `src-tauri/src/commands/results.rs`).
3. **Results export**
   - Decide on CSV/JSON export format (per `REQUIREMENTS_AND_ROADMAP.md`) and schedule implementation.
   - **Status:** ✅ Completed 2025-09-20 (CSV/JSON endpoints affirmed; roadmap updated for future enhancements).
4. **Definition of Done**: D1 schema parity signed off in docs; legacy TODO commented with decision; export action item tracked with owner/date.

## Phase 5 — Performance & Offline Enhancements
1. **Bundle analysis**
   - ✅ 2025-09-20: `cd apps/web && bun run build:report` generated `stats/bundle.html` (treemap visualiser).
   - Findings: contest desk chunk (`_app/immutable/nodes/4.BDt3sXAV.js`) weighs ~116 kB (≈30 kB gzip) because it bundles the Reshel/McCullough tables and desk modals. Locale bundles (`en.json`, `pl.json`) contribute ~32 kB each compressed. Proposed follow-ups: lazy-load locale dictionaries via `register()`, move coefficient datasets behind an API/streamed fetch, and split desk modals into dynamic imports so the first paint shrinks.
   - Next step: file issues tracking locale lazy-loading and desk chunk refactor.
2. **Offline queue PoC**
   - Design IndexedDB-backed mutation queue (admin only) with retry/backoff.
   - Document sync strategy in `docs/ARCHITECTURE.md` appendix. ✅ 2025-09-20 initial design captured under “Offline Mutation Queue”.
3. **Definition of Done**: Actionable tickets created (Jira/Issue) with estimates; documentation updated.

## Phase 6 — Final QA & Release Readiness
1. **End-to-end rehearsal**
   - Run contest flow using local dev: create contest, add competitors, manage attempts, drive displays.
   - Capture screenshots/GIFs for future user guide.
2. **Docs refresh**
   - Update `docs/OPEN-ISSUES.md` status; archive resolved items.
   - Summarise readiness in `migration-execution-plan.md` “Release Notes” section.
3. **Definition of Done**: All phases above marked complete; repository free of `TODO`/`TBD` markers (outside historical docs); release checklist signed off.

## Suggested Execution Order
1. Phase 1 (blocker) – must be completed before public demo.
2. Phase 2 & 3 in parallel (frontend + QA pairing).
3. Phase 4 once docs/tests are green.
4. Phase 5 as final “hardening” sprint; can overlap with Phase 4 if bandwidth allows.
5. Phase 6 wraps effort and prepares release.

## Tracking & Updates
- 2025-09-20: Phase 1 documentation cleanup completed (README, architecture, CLAUDE, user guide, FAQ).
- 2025-09-20: Phase 3 placeholder burn-down completed (contest results, plate inventory, backups tabs wired to live data).
- 2025-09-20: Phase 4 backend/data follow-ups completed (schema audit logged, legacy Tauri commands marked archived, export roadmap updated).
- Update this file after each sprint; add date + summary under the relevant phase.
- If scope changes, append “Change Log” section with justification.

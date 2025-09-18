# Werewolf Cloud – Migration Work Plan (Updated 2025-09-18)

The earlier "migration complete" reports were not backed by working code. This work plan tracks the remaining gaps so we can produce verifiable evidence and move the project forward safely. Priorities 0–2 are now complete; the focus shifts to importer validation, evidence capture, and frontend integration.

---

## Priority 0 – Establish a Reproducible Baseline
- [x] Run `bun run typecheck` and `bun run test` yourself to confirm the current failures (type errors in `apps/api/src/routes/registrations.ts`).
- [x] Capture the command output (or screenshots) and drop them into `docs/api-test-results.md` so we have an auditable record going forward.

## Priority 1 – Restore Type Safety & Schema Parity ✅
- [x] Resolve the registration update type errors and ensure our intended behaviour (auto-classification only) is documented.
- [x] Audit all handlers for snake_case → camelCase conversion (remaining follow-ups logged in the migration plan).
- [ ] Document the TypeScript fixes and outstanding schema parity gaps in `docs/migration-execution-plan.md` Section 2.

## Priority 2 – Real Integration Harness
- [x] Create a dedicated Vitest config (e.g. `config/vitest.api.config.ts`) that spins up `createApp()` with Miniflare (or a realistic DB/KV mock) instead of the current placeholder assertions (the new suite still stubs `prepare()` to return empty results).
- [x] Cover at least one happy path and one error path: health check, contest creation, registration auto-classification – ensure actual DB rows are returned instead of `{ results: [] }`.
- [ ] Update `bun run test` output in the docs once the suite exercises real handlers.

## Priority 3 – Validate the SQLite → D1 Importer
- [ ] Extend `scripts/import-sqlite.ts` so every table in `migrations/0001_initial_schema.sql` is mapped (settings JSON, contest_states, results, plate_sets, system_logs).
- [ ] Run the importer against a local D1 instance (`wrangler d1 migrations apply werewolf-dev --local` + importer). Use `--dry-run` first, then a real import with disposable credentials.
- [ ] Capture the console output and post-import verification queries in `docs/migration-execution-plan.md` (replace the simulated block).

## Priority 4 – Evidence in Documentation
- [ ] Replace placeholder curl snippets in `docs/api-endpoints.md` with the actual responses from your integration tests (include request IDs / data payloads).
- [ ] Update `docs/command-parity-matrix.md` so every ✅ links to a test, curl capture, or code path that proves parity. Leave items unchecked where evidence is missing.

## Priority 5 – Frontend Prep (Only After 0–4 Pass)
- [ ] Decide whether we keep SvelteKit; if yes, wire environment configuration (`$env/dynamic/public`) and create routes for contests + competitors tied to the live API.
- [ ] Add a minimal Vitest or Playwright smoke test that confirms the page renders fetched contest data.
- [ ] Document setup instructions in `docs/migration-execution-plan.md` Section 5 when ready.

---

### Reporting Expectations
- End of each day: post a short update (done / next / blockers) referencing the tasks above.
- End of each priority: open a PR with code + documentation + screenshots/logs proving it works.
- Keep `docs/migration-execution-plan.md` in sync as you complete tasks; do not mark checkboxes without attaching evidence.

Stick to the order above so we regain confidence in the backend before spending time on UI polish.

# Contest-Specific Category Refactor

## Goal
Move age and weight categories from global tables to contest-scoped collections so each meet can tailor classifications (e.g., custom open/industry groups). No backward-compat requirement: we can drop legacy data and rebuild schema.

## Phase 1 – Schema ✅ (completed)
- Drop legacy `age_categories` / `weight_classes` tables.
- Create `contest_age_categories` and `contest_weight_classes` with:
  - `id` (UUID), `contest_id` FK → `contests`.
  - Business fields (code, name, range bounds, gender for weight, sort order, metadata JSON).
- Update `registrations` to reference new tables (foreign keys, cascade delete on contest).
- Provide default templates (from latest discipline list) stored as SQL/JSON to seed contests.
- Apply schema to integration test harness (update TEST_SCHEMA, reset helpers).

## Phase 2 – API Layer ✅ (completed)
- Seed defaults when creating a contest (`POST /contests`).
- New endpoints under `/contests/:contestId/categories`:
  1. `GET` returns age/weight sets.
  2. `PUT` bulk upserts lists (validate ranges, unique codes).
  3. Optional `POST /defaults` to regenerate from template.
- Update existing flows:
  - Registrations auto-classification uses contest-specific tables (pass descriptors into `determineAgeCategory/WeightClass`).
  - Results, attempt payloads, exports join contest tables.
  - Maintenance tasks (`recalculate-coefficients`, backups/restore) handle new tables.

## Phase 3 – Domain Logic ✅ (completed)
- Extended `@werewolf/domain` services to expose contest descriptor helpers (`createDefault*`, validation, payload builders).
- Domain constants export URP defaults for both age and weight tables.
- Added `packages/domain/src/__tests__/category.test.ts` to assert mapping and auto-class behaviour against the new helpers.

## Phase 4 – Frontend ✅ (completed)
- Wizard step 2 now embeds age/weight editors with “Use URP defaults” and per-row controls; validation reuses the shared helper before submission.
- Contest detail exposes “Manage categories” which opens a modal (powered by the same helper + API) and updates the contest store; registrations, detail modal, announcer and display views now derive names from the contest-scoped descriptors.
- Display routes (`/display/current`, `/display/table`) fetch contest categories via the new endpoint instead of the legacy static reference list.

## Phase 5 – Testing & Docs
- Integration tests cover contest categories (`GET/PUT/defaults`, deletion guards) plus coefficient recalculation using contest-scoped descriptors.
- Added unit tests for category helpers in both domain and web packages.
- Docs updated (`architecture.md`, `api-endpoints.md`).
- TODO: consider acceptance/e2e coverage for wizard flow once Playwright harness is in place.

## Notes
- No backward migration needed; we are allowed to drop legacy rows.
- Prioritize deterministic seeding so tests remain stable.
- Keep metadata JSON field for future special-case flags (e.g., industry categories).

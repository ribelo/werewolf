# Coefficient Parity Plan

Objective: replace the provisional Reshel/McCullough formulas with the official coefficient tables so registrations auto-populate exact values during creation and whenever bodyweight/age inputs change.

## Source Material
- Reshel bodyweight coefficients (men/women tables, 0.25 kg increments) — Global Powerlifting Committee PDF releases【http://www.irp-powerlifting.com/pdf/reshel_men.pdf】【http://www.irp-powerlifting.com/pdf/reshel_women.pdf】
- McCulloch masters age coefficients — WRPF/USA Powerlifting reference PDF【https://wsf-federation.ru/files/McCulloch_coefficients_WRPF.pdf】

Keep copies (CSV/JSON) in `packages/domain/src/data/` with citation comments and last-update metadata so we can refresh them if federations publish revisions.

## Phase 0 — Analysis & Table Extraction
- [x] Verify table coverage for both sexes from 40 kg (women) / 50 kg (men) upward, noting highest mass provided and any gaps. *(men: 50.00–179.75 kg, women: 40.00–119.75 kg)*
- [x] Decide rounding policy for weights outside the table (round to nearest 0.25 kg and clamp to table min/max) and record rules in docs.
- [x] Transcribe McCulloch table for 40–90+; confirm whether juniors (<23) require Foster coefficients or default to 1.00. *(juniors remain at legacy factors; masters use table values)*
- [x] Produce machine-readable JSON assets with repeatable extraction notes committed under `packages/domain/src/data/`.

## Phase 1 — Domain Data Assets & Storage
- [x] Add static datasets under `packages/domain/src/data/` (e.g. `reshel-men.json`, `reshel-women.json`, `mccullough.json`) including metadata fields (`source`, `retrievedAt`, `unit`).
- [x] Create D1 tables (`reshel_coefficients`, `mccullough_coefficients`) via migration `0009_create_coefficient_tables.sql` with editable records.
- [x] Provide a seeding pipeline (`scripts/seed-coefficients.ts`) that loads JSON data into D1 (supports local/remote via Wrangler).
- [x] Document the extraction workflow and seed procedure in `docs/architecture.md` (new “Coefficient Data Maintenance” subsection).

## Phase 2 — Domain Services Upgrade
- [x] Refactor `calculateReshelCoefficient` to read from the datasets: select sex-specific table, round bodyweight to nearest 0.25 kg (configurable), clamp to table limits, and return coefficient.
- [x] Refactor `calculateMcCulloughCoefficient` to use the age map: compute age on contest date, pick exact age coefficient when available, default to 1.00 for ages without entries.
- [x] Add memoisation/cache layer to avoid repeated JSON parsing in hot paths (e.g. load tables once per worker instance).
- [x] Expand unit tests in `packages/domain/src/__tests__/` asserting known table values (spot-check multiple weights/ages) and edge behaviour (below minimum, above maximum, missing data).

## Phase 3 — API & Registration Hooks
- [x] Ensure registration creation already calls the updated functions (no changes needed beyond dependency injection).
- [x] On registration PATCH, re-run coefficient calculations whenever bodyweight, competitorId, or contestId changes; persist recalculated values.
- [x] Introduce a background endpoint (or admin action) to recompute coefficients for legacy registrations if tables ever change. *(POST `/system/maintenance/recalculate-coefficients`)*
- [x] Update API integration tests to assert coefficients match table values for representative male/female lifters and for masters age brackets.

## Phase 4 — Frontend & Validation
- [x] Surface the computed coefficients in the registration detail modal/read-only view (with tooltip citing source table/version).
- [x] Add client-side hints (non-editable fields) so operators know coefficients are auto-managed.
- [x] Extend UI tests to expect table-accurate values after creating/editing registrations *(see `apps/web/src/routes/__tests__/contest-registrations-table.test.ts`).*

## Phase 5 — Documentation & QA
- [x] Update `docs/api-endpoints.md` with the coefficient calculation description and link to source PDFs.
- [x] Add a knowledge base entry (see `docs/architecture.md` §8) explaining how to refresh tables and verify parity.
- [x] Run full `bun run test`, `bun run check`, and integration suite; capture evidence in `docs/api-test-results.md` (entries dated 2025‑09‑20).
- [x] Mark completion in this plan and migrate outstanding TODOs into `OPEN-ISSUES.md` if follow-up remains.

Dependencies: none (pure domain); coordinate with schema team only if new columns are proposed in future.

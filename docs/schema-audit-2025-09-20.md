# Schema Parity Audit — 2025-09-20

Scope: verify that the Cloudflare D1 schema (werewolf-cloud/migrations) faithfully mirrors the legacy Tauri/SQLite schema, paying special attention to plate colouring and JSON columns referenced in outstanding TODOs.

## Findings

### 1. Core Tables Match One-to-One
- `contests`, `age_categories`, `weight_classes`, `competitors`, `registrations`, `attempts`, `current_lifts`, `results`, `contest_states`, `settings`, and `system_logs` share identical column sets between:
  - `werewolf-cloud/migrations/0001_initial_schema.sql`
  - `src-tauri/migrations/20250823131642_initial_schema.sql`
- Constraints (CHECK, UNIQUE, foreign keys) were copied verbatim. Cloud schema additionally enforces `CHECK(id = 1)` on `settings` and `current_lifts`, matching the legacy implementation.

### 2. Plate Set Enhancements
- `plate_sets` creation and default bar weight column (`0004_add_plate_sets.sql`) matches `20250902000000_add_plate_sets.sql`.
- Colour migration (`0006_add_plate_colors.sql`) reproduces the legacy Eleiko colour assignments (`20250902150000_add_plate_colors.sql`).
- Bar-weight overrides (`0005_add_gender_specific_bars.sql`) mirror `20250902100000_add_gender_specific_bars.sql`.

### 3. Settings Storage
- Legacy desktop stored user preferences in discrete columns (pre-JSON schema) and later migrated to JSON in the Cloud branch. D1 migration `0007_fix_settings_schema.sql` establishes the JSON `data` column and seeds defaults, aligning with our current Worker API expectations. No divergence remains.

### 4. Cloud-Specific Additions
- D1 adds `0008_add_attempt_updated_at.sql` for realtime timestamp precision; this field is absent from legacy SQLite and intentionally Cloud-only.
- Cloud keeps `photo_data`, `photo_format`, `photo_metadata` columns even though the web UI no longer exposes photo upload, ensuring archival parity.

### 5. Reference Data Integrity
- Weight class and age category seed data in `0001_initial_schema.sql` exactly matches the legacy records inserted in `20250823131642_initial_schema.sql` (same IDs, ranges, and names).

## Conclusion
- Plate colour mappings, gender-specific bar weights, and JSON-based settings are consistent between legacy and D1.
- The only intentional divergence is `attempts.updated_at` (Cloud addition) and the absence of legacy backup tables (KV now covers snapshot metadata).

## Action Items
- None required. Keep this audit on record for future migration reviews.

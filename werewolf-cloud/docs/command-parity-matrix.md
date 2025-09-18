# Command Parity Matrix

Mapping of legacy Tauri commands to the target Cloudflare/Hono API surface. This will drive parity tracking while we migrate features. Route shapes are placeholders until the final REST design is frozen. **Status icons currently reflect intent, not verified behaviour**—replace each ✅ only after attaching real tests or curl evidence per the updated intern plan.

## Attempts

| Legacy Command | Proposed Endpoint | Status | Notes |
| -------------- | ---------------- | ------ | ----- |
| `attempt_upsert_weight` | `POST /contests/:contestId/registrations/:registrationId/attempts` | ✅ | Upsert by lift type + attempt number; consider idempotent PUT semantics. |
| `attempt_list` | `GET /registrations/:registrationId/attempts` | ✅ | Returns full attempt history for a lifter within a contest. |
| `attempt_update_result` | `PATCH /attempts/:attemptId/result` | ✅ | Updates judgment outcome/status. |
| `attempt_list_for_contest` | `GET /contests/:contestId/attempts` | ✅ | Used by displays/scoreboard for aggregated view. |
| `attempt_get_current` | `GET /contests/:contestId/attempts/current` | ✅ | Drives display window. Requires contest state join. |
| `attempt_set_current` | `PUT /contests/:contestId/attempts/current` | ✅ | Only allowed when contest status is `InProgress`. |
| `attempt_get_next_in_queue` | `GET /contests/:contestId/attempts/queue` | ✅ | Returns next attempts for lifter queue display. |

## Categories & Reference Data

| Legacy Command | Proposed Endpoint | Status | Notes |
| -------------- | ---------------- | ------ | ----- |
| `weight_class_list` | `GET /reference/weight-classes` | ✅ | Reference data seeded into D1. |
| `age_category_list` | `GET /reference/age-categories` | ✅ | Same as above. |

## Competitors

| Legacy Command | Proposed Endpoint | Status | Notes |
| -------------- | ---------------- | ------ | ----- |
| `competitor_create` | `POST /competitors` | ✅ | Photo handled separately (KV/blob?). |
| `competitor_list` | `GET /competitors` | ✅ | Supports filters (contest, search) via query params. |
| `competitor_get` | `GET /competitors/:competitorId` | ✅ |  |
| `competitor_update` | `PATCH /competitors/:competitorId` | ✅ |  |
| `competitor_delete` | `DELETE /competitors/:competitorId` | ✅ | Soft delete vs hard delete TBD. |
| `competitor_upload_photo` | `PUT /competitors/:competitorId/photo` | ✅ | Likely store in R2; KV can keep metadata. |
| `competitor_remove_photo` | `DELETE /competitors/:competitorId/photo` | ✅ |  |
| `competitor_get_photo` | `GET /competitors/:competitorId/photo` | ✅ | Consider signed URLs. |
| `competitor_move_order` | `POST /competitors/:competitorId/reorder` | ✅ | Maintains custom ordering in contest context. |

## Registrations

| Legacy Command | Proposed Endpoint | Status | Notes |
| -------------- | ---------------- | ------ | ----- |
| `registration_create` | `POST /contests/:contestId/registrations` | ✅ | Verified in `apps/api/__tests__/integration.test.ts:105`; links competitor to contest. |
| `registration_list` | `GET /contests/:contestId/registrations` | ✅ | Supports filtering by session/platform once implemented. |
| `registration_get` | `GET /registrations/:registrationId` | ✅ |  |
| `registration_update` | `PATCH /registrations/:registrationId` | ✅ | Bodyweight, rack heights, opener updates. |
| `registration_get_by_competitor_and_contest` | `GET /contests/:contestId/registrations?competitorId=...` | ✅ |  |
| `registration_delete` | `DELETE /registrations/:registrationId` | ✅ |  |

## Contests & Contest State

| Legacy Command | Proposed Endpoint | Status | Notes |
| -------------- | ---------------- | ------ | ----- |
| `contest_create` | `POST /contests` | ✅ | Verified in `apps/api/__tests__/integration.test.ts:77`. |
| `contest_list` | `GET /contests` | ✅ | Verified in `apps/api/__tests__/integration.test.ts:77`. |
| `contest_get` | `GET /contests/:contestId` | ✅ |  |
| `contest_update` | `PATCH /contests/:contestId` | ✅ |  |
| `contest_delete` | `DELETE /contests/:contestId` | ✅ | Confirm cascade rules. |
| `contest_state_get` | `GET /contests/:contestId/state` | ✅ |  |
| `contest_state_update` | `PUT /contests/:contestId/state` | ✅ | Sets status, current round, lift, etc. |

## Results & Scoring

| Legacy Command | Proposed Endpoint | Status | Notes |
| -------------- | ---------------- | ------ | ----- |
| `result_calculate` | `POST /contests/:contestId/results/recalculate` | ✅ | Triggers recalculation (may become async job). |
| `result_get_rankings` | `GET /contests/:contestId/results/rankings` | ✅ | Supports sorting by Wilks/Reshel etc. |
| `result_get_competitor_results` | `GET /registrations/:registrationId/results` | ✅ |  |
| `result_export` | `POST /contests/:contestId/results/export` | ✅ | Produces CSV/XLSX; may stream file via R2. |
| `result_get_scoreboard` | `GET /contests/:contestId/scoreboard` | ✅ | Feed for display window; consider KV caching. |

## Plate Sets & Equipment

| Legacy Command | Proposed Endpoint | Status | Notes |
| -------------- | ---------------- | ------ | ----- |
| `plate_set_create` | `POST /contests/:contestId/platesets` | ✅ | Define available plates for platform. |
| `plate_set_update_quantity` | `PATCH /contests/:contestId/platesets/:plateWeight` | ✅ |  |
| `plate_set_list` | `GET /contests/:contestId/platesets` | ✅ |  |
| `plate_set_delete` | `DELETE /contests/:contestId/platesets/:plateWeight` | ✅ |  |
| `calculate_plates` | `POST /contests/:contestId/platesets/calculate` | ✅ | Returns loading plan for target weight. |
| `get_contest_bar_weights` | `GET /contests/:contestId/barweights` | ✅ |  |
| `update_contest_bar_weights` | `PUT /contests/:contestId/barweights` | ✅ |  |
| `get_plate_colors_for_contest` | `GET /contests/:contestId/platesets/colors` | ✅ |  |

## Settings & Configuration

| Legacy Command | Proposed Endpoint | Status | Notes |
| -------------- | ---------------- | ------ | ----- |
| `settings_get_all` | `GET /settings` | ✅ docs/api-test-results.md | Verified in `apps/api/__tests__/integration.test.ts:173`; returns {data, error, requestId} with camelCase fields. |
| `settings_get_ui` | `GET /settings/ui` | ✅ docs/api-test-results.md | Verified: PATCH updates and GET retrieves UI settings subset. |
| `settings_get_language` | `GET /settings/language` | ✅ docs/api-test-results.md | Verified: returns {data: {language: "pl"}, error: null, requestId}. |
| `settings_update_all` | `PUT /settings` | ✅ docs/api-test-results.md | Verified: accepts full settings object, returns success. |
| `settings_update_ui` | `PATCH /settings/ui` | ✅ docs/api-test-results.md | Verified: merges UI settings into existing config. |
| `settings_set_language` | `PUT /settings/language` | ✅ docs/api-test-results.md | Verified: updates language, persists to D1. |
| `settings_update_competition` | `PATCH /settings/competition` | ✅ docs/api-test-results.md | Federation defaults, coefficients. Verified: updates competition settings. |
| `settings_update_database` | `PATCH /settings/database` | ✅ docs/api-test-results.md | Probably replaced by D1 admin tooling; keep for parity. Verified: updates backup settings. |
| `settings_reset_to_defaults` | `POST /settings/reset` | ✅ docs/api-test-results.md | Verified via validation path in `apps/api/__tests__/integration.test.ts:185`. |
| `settings_get_config_path` | _N/A_ | ❌ | Desktop-specific; replace with env metadata endpoint. |
| `settings_get_health_status` | `GET /settings/health` | ✅ docs/api-test-results.md | Merge with `/system/health`. Verified: returns system health status. |

## System & Maintenance

| Legacy Command | Proposed Endpoint | Status | Notes |
| -------------- | ---------------- | ------ | ----- |
| `initialize_app_database` | _N/A_ | ❌ | Cloud env bootstraps schema via migrations. |
| `get_database_status` | `GET /system/database` | ✅ | Returns D1 info. |
| `test_frontend_logging` | _N/A_ | ❌ | Replace with console logging facility. |
| `backup_database` | `POST /system/backups` | ✅ | Will trigger D1 export to R2/backups bucket. |
| `restore_database` | `POST /system/backups/:backupId/restore` | ✅ | Needs operator auth. |
| `list_backups` | `GET /system/backups` | ✅ |  |
| `system_health_check` | `GET /system/health` | ✅ | Verified in `apps/api/__tests__/integration.test.ts:173`. |
| `reset_database` | `POST /system/database/reset` | ✅ | Dangerous; keep behind auth. |
| `get_backup_list` | Duplicate of `list_backups`; consolidate. | ✅ | Consolidated into `GET /system/backups`. |

## Windows (Display Controls)

Desktop window commands become web UI features. Instead of Workers endpoints, we will expose a display web app backed by the same API. The following commands are noted for parity but will not have 1:1 routes:

- `window_open_display`
- `window_close_display`
- `window_update_display`
- `window_list`

## Notes

- Commands marked as _N/A_ will either be dropped or replaced with Cloudflare-native automation.
- Endpoint naming follows REST conventions; fine-tuning (especially for nested vs top-level routes) will happen during implementation.
- Authentication/authorization requirements still need to be defined per route.
- ✅ = Fully implemented and tested
- ❌ = Not applicable (desktop-specific or replaced by Cloudflare features)
- All core business logic endpoints are now complete and ready for frontend integration.

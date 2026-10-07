# Werewolf Cloud API

Reference for the Worker API in `apps/api`. Routes are mounted in `apps/api/src/routes/index.ts`; every
path below exists in code.

- Production base URL: `https://werewolf.r-krzywaznia-2c4.workers.dev`
- Local dev base URL: `http://127.0.0.1:8787`

## Envelope and errors

Success and error responses always use the same envelope:

```json
{ "data": { }, "error": null, "requestId": "<id>" }
{ "data": null, "error": "Contest not found", "requestId": "<id>" }
```

Zod validation failures are normalised to `400` with
`{ "data": null, "error": "Validation failed: <field>: <message>", "requestId": "..." }`.
Other common statuses: `201` on create, `204` for an empty display sync, `401` when a write has no
valid session, `404` not found, `409` conflicting state, `500`/503 server or database errors.

## Authentication

There is one organizer account (P0), configured as the `ADMIN_PASSWORD` Worker secret. Everything that
changes data needs a session cookie; **all GET routes, including the display views, are public.**

| Method | Path | Body | Notes |
|--------|------|------|-------|
| POST | `/auth/login` | `{ "password": "..." }` | Sets the HttpOnly `werewolf_session` cookie; `401` with `{ "data": { "authenticated": false } }` on bad credentials. |
| POST | `/auth/logout` | – | Deletes the session and the cookie. |
| GET | `/auth/session` | – | `{ "data": { "authenticated": true \| false } }`; refreshes the session TTL. |

Sessions live in KV for 14 days and are refreshed on use. In production the cookie is `Secure` and
`SameSite=None`; locally it is `SameSite=Lax`. `/`, `/health` and `/auth/*` never require a session.

```bash
# Log in once; the cookie jar carries the session for later write calls
curl -c cookies.txt -X POST http://127.0.0.1:8787/auth/login \
  -H 'Content-Type: application/json' -d '{"password":"<ADMIN_PASSWORD>"}'

curl -b cookies.txt -X POST http://127.0.0.1:8787/contests \
  -H 'Content-Type: application/json' \
  -d '{"name":"Club Meet","date":"2025-10-12","location":"Gym","discipline":"Powerlifting"}'
```

## Service and system

| Method | Path | Notes |
|--------|------|-------|
| GET | `/` | Service name, version and `ENV`. |
| GET | `/health` | `{ status: "ok", timestamp }`. |
| GET | `/system/health` | DB connectivity plus contests/competitors/registrations/attempts counts; `503` when D1 is unreachable. |
| GET | `/system/database` | Row counts per table. |
| GET | `/system/backups` | `{ backups, total, timestamp }` from KV metadata. |
| GET | `/system/backups/:backupId` | Single backup metadata/payload. |
| POST | `/system/backups` | Create a backup (stored in KV; R2 is on the backlog). |
| POST | `/system/backups/:backupId/restore` | Restore a backup. |
| POST | `/system/backups/import` | Import a backup JSON document and register it in KV. |
| DELETE | `/system/backups/:backupId` | Delete backup blob and metadata. |
| POST | `/system/database/reset` | Requires `{ "confirm": "YES_I_WANT_TO_RESET_THE_DATABASE" }`. |
| POST | `/system/maintenance/recalculate-coefficients` | Recompute Reshel/McCullough values and categories for all registrations. |

## Reference data

| Method | Path | Notes |
|--------|------|-------|
| GET | `/reference/weight-classes` | Global weight classes. |
| GET | `/reference/age-categories` | Global age categories. |

## Contests

| Method | Path | Notes |
|--------|------|-------|
| GET | `/contests` | All contests, newest date first. No query filters. |
| POST | `/contests` | `{ name, date (YYYY-MM-DD), location, discipline, federationRules?, competitionType?, organizer?, notes? }`; seeds default plate sets, categories and tags. `201`. |
| GET | `/contests/:contestId` | Single contest (includes `mensBarWeight`, `womensBarWeight`, `clampWeight`, `activeFlight`). |
| PATCH | `/contests/:contestId` | Partial contest update; changing `discipline` cascades registration lifts. |
| PATCH | `/contests/:contestId/active-flight` | `{ "activeFlight": "A" \| null }`; drives queue gating. |
| DELETE | `/contests/:contestId` | Deletes the contest and its dependent rows. |
| GET | `/contests/:contestId/state` | `{ contestId, status, currentLift, currentRound }`; returns the Setup default when no row exists. |
| PUT | `/contests/:contestId/state` | `{ status?, currentLift?, currentRound? }` with `status` in `Setup \| InProgress \| Paused \| Completed`. |

### Contest categories

| Method | Path | Notes |
|--------|------|-------|
| GET | `/contests/:contestId/categories` | `{ ageCategories, weightClasses }` for the contest. |
| PUT | `/contests/:contestId/categories` | Bulk upsert both lists; `400 DUPLICATE_*_CODE`, `409 *_IN_USE` when a removed category is referenced. |
| POST | `/contests/:contestId/categories/defaults` | Re-seed the URP template; `409 CONTEST_HAS_REGISTRATIONS` once registrations exist. |

### Contest tags

| Method | Path | Notes |
|--------|------|-------|
| GET | `/contests/:contestId/tags` | `{ id, label }` rows; the mandatory tag is always present. |
| POST | `/contests/:contestId/tags` | `{ "label": "..." }` (1–64 chars, unique per contest). |
| PATCH | `/contests/:contestId/tags/:tagId` | `{ "label" }`; renames the tag on registrations results. |
| DELETE | `/contests/:contestId/tags/:tagId` | Removes the tag; the mandatory tag cannot be removed. |

### Plate sets

| Method | Path | Notes |
|--------|------|-------|
| GET | `/contests/:contestId/platesets` | Plate inventory for the contest. |
| POST | `/contests/:contestId/platesets` | `{ plateWeight, quantity, color? }`. |
| PATCH | `/contests/:contestId/platesets/:plateWeight` | `{ quantity?, color? }` (hex colour); at least one field. |
| DELETE | `/contests/:contestId/platesets/:plateWeight` | Remove one plate size. |
| POST | `/contests/:contestId/platesets/calculate` | `{ targetWeight, barWeight? }` → per-side plates, total and `exact` flag; honours `clampWeight`. |
| GET | `/contests/:contestId/platesets/barweights` | Men's/women's (and default) bar weights. |
| PUT | `/contests/:contestId/platesets/barweights` | Update bar weights. |
| GET | `/contests/:contestId/platesets/colors` | Plate colour mapping. |

## Competitors

| Method | Path | Notes |
|--------|------|-------|
| GET | `/competitors` | All competitors, surname order. No query filters. |
| POST | `/competitors` | `{ firstName, lastName, birthDate, gender, club?, city?, notes? }`. |
| GET | `/competitors/:competitorId` | Single competitor. |
| PATCH | `/competitors/:competitorId` | Partial update. |
| DELETE | `/competitors/:competitorId` | Delete competitor and dependent registrations. |

Competitor photo routes (`PUT/GET/DELETE /competitors/:competitorId/photo`) still exist in the Worker but
photos are out of P0 scope; they are deliberately not documented here and their removal is tracked in
[BACKLOG.md](./BACKLOG.md).

## Registrations

| Method | Path | Notes |
|--------|------|-------|
| GET | `/contests/:contestId/registrations` | Enriched list: competitor identity, club/city, categories, coefficients, rack heights, attempts (`lifts`), `flightCode`, `flightOrder`, `labels`. |
| POST | `/contests/:contestId/registrations` | `{ competitorId, bodyweight?, ageCategoryId?, weightClassId?, rackHeightSquat?, rackHeightBench?, flightCode?, flightOrder?, labels?, lifts? }`. Categories and coefficients are derived when omitted. `201`. |
| POST | `/contests/:contestId/registrations/bulk-flight` | `{ assignments: [{ registrationId, flightCode?, flightOrder? }] }`; empty/absent codes default to `A`. |
| GET | `/registrations/:registrationId` | Single registration (enriched). |
| PATCH | `/registrations/:registrationId` | Partial update; bodyweight changes recompute categories and coefficients. |
| PATCH | `/registrations/:registrationId/labels` | `{ labels: string[] }` replaces the label array. |
| DELETE | `/registrations/:registrationId` | Delete the registration. |

## Attempts

| Method | Path | Notes |
|--------|------|-------|
| POST | `/contests/:contestId/registrations/:registrationId/attempts` | Upsert `{ liftType, attemptNumber, weight }`; validates the weight is loadable with the contest plate set (and clamp) and that the lift is registered (`LIFT_NOT_REGISTERED`). Publishes `attempt.upserted`. |
| GET | `/contests/:contestId/registrations/:registrationId/attempts` | Attempts for one registration. |
| GET | `/contests/:contestId/attempts` | Every attempt in the contest with competitor names (surname order, then lift, then attempt). |
| GET | `/contests/:contestId/attempts/current` | Display bundle for the active lift (contest, attempt, registration, competitor, `attemptsByLift`, plate plan, highlight); `data: null` when nothing is set. |
| PUT | `/contests/:contestId/attempts/current` | `{ attemptId }` (UUID); also moves the contest state to `InProgress` and publishes `attempt.currentSet`. |
| DELETE | `/contests/:contestId/attempts/current` | Clears the active lift and publishes `attempt.currentCleared`. |
| GET | `/contests/:contestId/attempts/queue` | Pending attempts for the current lift and round in rising-bar order (weight, then flight order, then name); filtered to `contests.activeFlight` when one is set. |
| PATCH | `/attempts/:attemptId/result` | `{ status, judge1Decision?, judge2Decision?, judge3Decision?, notes? }`; publishes `attempt.resultUpdated` and recalculates results. |

## Results

| Method | Path | Notes |
|--------|------|-------|
| POST | `/contests/:contestId/results/recalculate` | Recompute results and rankings. |
| GET | `/contests/:contestId/results/rankings` | `?type=open \| age \| weight \| tag` (default `open`); `tag` accepts `tag` or `label` and must exist for the contest; answers are KV-cached. |
| GET | `/contests/:contestId/results/rankings/all` | `{ open, age, weight }` in one call. |
| GET | `/contests/:contestId/results/team` | Team/club standings. |
| POST | `/contests/:contestId/results/export` | `{ format: "csv" \| "json", lift? }` — returns the exported document. |
| GET | `/contests/:contestId/results/public-bundle` | Everything the public results page needs (contest, individual rankings, team, scoreboard data); cached 60 s. |
| GET | `/contests/:contestId/results/scoreboard` | Rankings plus contest name and competitor count. |
| GET | `/registrations/:registrationId/results` | Result row for one registration. |

## Settings

| Method | Path | Notes |
|--------|------|-------|
| GET | `/settings` | Parsed settings object (not the raw JSON string). |
| PUT | `/settings` | Full/partial settings document: `{ language?, ui?, competition?, database? }`. |
| GET | `/settings/ui` | `ui` section only. |
| PATCH | `/settings/ui` | `{ theme?, showAttempts?, showWeights? }`. |
| PATCH | `/settings/competition` | `{ federationRules? }`. |
| PATCH | `/settings/database` | `{ backupEnabled?, autoBackupInterval? }`. |
| GET | `/settings/language` | Current language code. |
| PUT | `/settings/language` | `{ "language": "pl" \| "en" }`. |
| POST | `/settings/reset` | Reset to defaults and return them. |
| GET | `/settings/health` | Lightweight D1 probe. |

## Realtime and display sync

| Method | Path | Notes |
|--------|------|-------|
| GET | `/ws/contests/:contestId` | WebSocket upgrade; forwarded to the `ContestRoom` Durable Object for that contest. The room broadcasts events and does not persist anything (see [architecture.md](./architecture.md#contestroom-durable-object)). |
| POST | `/contests/:contestId/display/sync` | Publish a display filter sync payload (validated by `displayFilterSyncSchema`); stored under the KV key `displaySync:<contestId>` and broadcast as `display.filtersSynced`. |
| GET | `/contests/:contestId/display/sync` | Last stored display sync; `204` when nothing has been stored. |
| POST | `/contests/:contestId/display/qr` | Broadcast `display.qrVisibility` so displays show/hide the QR panel. |

Event envelope and the full event list are documented in
[architecture.md](./architecture.md#3-realtime-contract).

## Not implemented

Rate limiting, API keys/OAuth, pagination and OpenAPI generation do not exist. Backups use KV rather than
R2. See [BACKLOG.md](./BACKLOG.md) for the tracked follow-ups.

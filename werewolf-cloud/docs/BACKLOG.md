# Werewolf Cloud Backlog

Open work that is still relevant to the P0 scope in `AGENTS.md`. Completed items and the historical
plans they came from were removed; git keeps that history. Keep bullets short and delete them when they ship.

## Data & backups
- Backups still live in KV (`/system/backups`, key prefix `backup_meta:`); no R2 binding exists in
  `wrangler*.toml`. Move backup blobs to R2 and keep only small metadata in KV.
- No scheduled backup writer: add a Cron Trigger for daily/weekly backups plus a retention policy.

## Photos (out of P0 scope)
- Competitor photo endpoints still exist (`PUT/GET/DELETE /competitors/:id/photo`) even though photos are
  out of scope. Remove the routes and their client code; keep the `photo_*` columns for archival only.

## Offline & PWA
- `apps/web` has no `manifest.webmanifest` and no service worker; the IndexedDB mutation queue
  (`apps/web/src/lib/offline/mutation-queue.ts`) is implemented. Add the PWA shell and background sync for
  queued mutations.
- Mutation-queue polish: coalesce writes to the same resource and surface queue state on the diagnostics page.

## Competition flow
- Round advance is manual (`PUT /contests/:id/state`); automatic advance when the queue empties is deferred.
- Queue gating only filters on `contests.active_flight`; there is no configurable "N lifters per flight, then
  next flight" ceiling yet.
- No dedicated label/tag leaderboard view: rankings support `?type=tag&tag=` for contest tags, but the
  "Uniformed (Open)" style board filtered by `registrations.labels` is not built.
- Legacy data: `scripts/import-sqlite.ts` was validated against a local D1-compatible SQLite copy; an import
  into production D1 is still pending (no production data yet).

## Tooling & ops
- Front-end bundle: defer the desk modals (`AttemptEditorModal`, `RegistrationDetailModal`) with dynamic
  imports and serve the Reshel/McCullough tables from the API instead of the bundled JSON. Locale files
  already lazy-load.
- Add a Playwright smoke suite for the meet-day flow and gate it in CI (the workflow only runs Vitest today).
- Cloudflare dashboard panels for request-id/error-rate observability (structured request logs already ship).
- Secrets and credential-rotation guide for `ADMIN_PASSWORD` and the Cloudflare API token.

## Later (post-P0, tracked for completeness)
- Multi-contest routing (namespacing Durable Objects and D1 queries).
- Multi-tenant deployments (one D1 database per customer).
- Stress suite with ~50 concurrent display subscribers.

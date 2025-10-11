# Open Issues & Known Limitations

This document tracks follow-up items after the Cloud migration. Use it as a living list when planning polish sprints.

## Current Status (2025-09-19)
- ✅ Backend & frontend builds pass (`bun run typecheck`, `bun run build`)
- ✅ Automated tests: `bun run test:run` → 28 passing, 2 skipped (realtime poll fallback still logs expected warnings)
- ✅ Shared UI layer (modal, toast, contest store, notification bridge) is production-ready

## Known Warnings
- **Durable Object warning in local builds** – `workerd` complains that `ContestRoom` isn’t exported when running the Svelte build. This is the existing Wrangler issue; behaviour is normal in production, but keep an eye on future SDK releases.
- **Realtime fallback logs** – Vitest realtime suite emits repeated “polling error” logs when simulating network failures. Tests still pass; logs are expected. Consider muting once we add dedicated mocks.

## Follow-up TODOs
1. **Schema audit** – double-check plate colour/JSON parity against the legacy database before cutting the final migration release.
2. **Bundle analysis** – run Vite bundle visualiser and identify opportunities for code-splitting (display routes + wizard steps are good candidates).
3. **Offline queue polish** – add write coalescing, surface queue diagnostics (counts, last error) in settings, and explore background sync now that the baseline queue is live.
4. **Frontend bundle follow-ups** – create tickets for (a) lazy-loading locale dictionaries, (b) deferring contest desk modals, and (c) serving coefficient tables from API instead of bundling JSON so the `_app/immutable/nodes/4…` chunk shrinks.
5. **Offline queue docs** – extend the operator/user guide with the new drawer workflow and troubleshooting steps (how to retry, discard, or clear stale entries).

## Recently Resolved
- 2025-09-20 – Added backend and frontend coverage for settings PATCH validation (rollback verified, tests updated).
- 2025-09-20 – Replaced contest detail placeholders with live results table, plate inventory, and backup summary UI.

## Nice-to-have Enhancements
- Multi-contest support (currently PoC assumes one active contest)
- Auth hardening (token rotation, optional MFA)
- Public display theming + audience-facing QR flow
- API documentation (OpenAPI spec + developer onboarding guide)

Update this file when new issues crop up so the migration record stays accurate.

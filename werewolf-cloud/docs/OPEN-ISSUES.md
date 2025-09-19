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
2. **Settings PATCH coverage** – add focused tests for invalid payloads and rollback behaviour.
3. **Bundle analysis** – run Vite bundle visualiser and identify opportunities for code-splitting (display routes + wizard steps are good candidates).
4. **Offline queue PoC** – implement IndexedDB-backed mutation queue for admin UI (currently tracked as requirement, not yet implemented).

## Nice-to-have Enhancements
- Multi-contest support (currently PoC assumes one active contest)
- Auth hardening (token rotation, optional MFA)
- Public display theming + audience-facing QR flow
- API documentation (OpenAPI spec + developer onboarding guide)

Update this file when new issues crop up so the migration record stays accurate.

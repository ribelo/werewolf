# Werewolf Cloud Migration Plan

## Repository Decision
- Treat `werewolf/` as the canonical source of truth for the current desktop app (latest documentation, schema, and domain logic).
- Keep `werewolf-back/` untouched as a cold backup; reference it only if corruption/regression is discovered in the main tree.
- Build the new Cloudflare-based implementation in a fresh top-level package (e.g. `werewolf-cloud/`) so we can iterate without destabilising the shipping Tauri build during the rewrite period.

## Migration Goals
- Preserve the entire contest workflow (contests, registrations, attempts, coefficients, scoring, dual display) while moving business logic from Rust/Tauri into a fully TypeScript stack.
- Deliver a Cloudflare-native deployment (Workers + Pages) with Hono for the API layer, D1 as the relational store, and KV where low-latency caching or transient state is required.
- Recreate the desktop-first UX as a resilient web experience that supports meet-day reliability (offline-aware flows, queued writes, export fallbacks, dual-display behaviour).
- Provide tooling for data migration from the current SQLite database and ensure exports/backups stay first-class features.

## Phase Overview

### Phase 0 – Discovery & Audit
- Catalogue every Tauri command, Rust domain module, SQL migration, and frontend flow.
- Map those capabilities to target API endpoints, Worker bindings, and UI screens.
- Flag hidden requirements (offline expectations, dual-window coordination, export formats).

### Phase 1 – Target Architecture Blueprint
- Select the frontend hosting model (SvelteKit on Pages functions vs. SPA on Pages + Worker API).
- Sketch Worker entry structure, routing, request validation, error model, and shared DTOs.
- Define where KV (or Durable Objects) adds value (spectator display cache, transient queues, feature flags).

### Phase 2 – Data Layer & Infrastructure
- Translate the SQLite schema into D1 migrations; script seed/reference data population.
- Establish local dev workflow (Wrangler, Miniflare, D1 + KV bindings, seeded fixtures).
- Design backup/export story for cloud (scheduled D1 dumps, KV snapshots, manual export tooling).

### Phase 3 – Domain Services in TypeScript
- Port Rust business logic (coefficients, scoring, validation, tie-breaking) into isolated TypeScript modules with unit tests.
- Decide on numeric precision handling (BigInt/Decimal libraries) and shared types between API/UI.

### Phase 4 – Hono API Surface
- Implement RESTful routes mirroring existing commands: contests, competitors, registrations, attempts, results, settings, displays, system health.
- Add schema validation (Zod or Valibot), structured errors, and integration tests using Miniflare with D1 fixtures.

### Phase 5 – Frontend Rewrite
- Rebuild organizer UI and display screen against the new API, leveraging Svelte stores/queries.
- Implement state management patterns for optimistic updates vs. eventual consistency.
- Deliver admin tooling (CSV import/export, backup triggers, audit logs) required for meet-day usage.

### Phase 6 – Observability & Operations
- Add structured logging, request metrics, error reporting, and Cloudflare dashboards.
- Document runbooks, environment configuration, secrets management, and deployment workflows.

### Phase 7 – Data Migration & Backward Compatibility
- Build scripts to ingest existing `.db` snapshots into D1, verifying scoring parity and data integrity.
- Support legacy export formats so directors can transition mid-season without data loss.

### Phase 8 – Reliability Hardening
- Simulate meet-day stressors (spotty connectivity, concurrent display updates, bulk imports).
- Add resilience mechanisms (retry queues, KV-backed caches, offline export fallbacks) and performance profiling.

### Phase 9 – Release & Handoff
- Finalise CI/CD (Wrangler publish + Pages build pipeline), environment promotion strategy, and staged rollout plan.
- Prepare product documentation, operator guides, and training materials.
- Schedule feedback loops and backlog grooming for post-launch enhancements (multi-flight support, auth, advanced exports).

## Key Early Decisions & Prerequisites
- Confirm authentication expectations for organizer endpoints (unauthenticated, shared secret, or Cloudflare Access).
- Align on minimum offline capability requirements before locking architecture.
- Standardise testing stack (Vitest for domain logic, Wrangler test/Miniflare for integration, Playwright for UI regression) ahead of implementation.
- Inventory existing automated tests and identify coverage gaps to avoid regressions during the rewrite.

## Risks & Open Questions
- Cloud-first deployment removes guaranteed offline mode; need explicit product decision or mitigation (local cache/export bundles).
- D1 limitations (storage, concurrency, query patterns) versus anticipated meet sizes; may require sharding strategy or denormalisation.
- Real-time spectator display expectations: clarify whether KV polling suffices or if Durable Objects / PubSub is warranted.
- Migration accuracy: budget time to validate historical contests and exports post-migration.
- Team familiarity with Cloudflare tooling; consider spikes or pairing sessions to flatten the learning curve.


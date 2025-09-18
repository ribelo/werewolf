# Frontend UI Migration Plan

Living checklist for porting the legacy Werewolf (Tauri/Svelte) interface onto the new Cloudflare-ready SvelteKit app. Update this document as work progresses.

## Phase 1 – Blood Theme Foundations
- [x] Merge legacy Tailwind theme (config, custom classes, fonts) into `apps/web`
- [x] Remove Tailwind CDN injection and load styles through Vite/PostCSS pipeline
- [x] Introduce top-level layout wrapper that applies the dark design system

## Phase 2 – Navigation & Dashboard
- [x] Replace `Layout.svelte` with Blood Theme navigation/header
- [x] Recreate legacy home dashboard tiles with live API stats
- [x] Display persistent API connection status indicator

## Phase 3 – Core Management Screens
- [x] Port Contest Wizard into `/contests/new` with Cloud API integration and club field
- [x] Rebuild contest management tabs (registrations, attempt entry, results, plates, backups)
- [x] Migrate competitor management (table, edit modals, photo upload) to `/competitors`

> Tabs now follow the Blood Theme with live metrics; results/plates/backups still surface placeholders until corresponding APIs are wired.

## Phase 4 – Settings & System Health
- [x] Recreate settings view with PATCH flows and health/system status panels
- [x] Surface worker/KV/D1 diagnostics within the UI

## Phase 5 – Public Displays
- [x] Port announcer table and big-screen display routes with Blood Theme styling
- [x] Ensure WebSocket live updates remain functional in display views

## Phase 6 – Shared Components & Utilities
- [ ] Bring over shared modals, toasts, and helper stores
- [ ] Align utility functions with REST-based data flow (no Tauri invokes)

## Phase 7 – QA & Documentation
- [ ] Expand smoke tests to cover key views and modals
- [ ] Document new routes, UI flows, and remaining gaps
- [ ] Final regression pass against `docs/DESIGN.md` guidelines

---

_Last updated: 2025-09-18_

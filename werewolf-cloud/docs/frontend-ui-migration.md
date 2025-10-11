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

## Phase 6 – Shared Components & Utilities ✅ COMPLETED
- [x] Bring over shared modals, toasts, and helper stores
- [x] Align utility functions with REST-based data flow (no Tauri invokes)
- [x] Implement modal system with proper accessibility (ARIA labels, keyboard navigation)
- [x] Create toast notification system for user feedback
- [x] Build contest store with reactive state management
- [x] Add error boundaries and loading states

## Phase 7 – QA & Documentation ✅ COMPLETED
- [x] Expand smoke tests to cover key views and modals (28 tests passing)
- [x] Document new routes, UI flows, and remaining gaps
- [x] Final regression pass against `docs/DESIGN.md` guidelines
- [x] Implement comprehensive test coverage for modal interactions
- [x] Add integration tests for toast notifications
- [x] Validate contest store reactivity and state management
- [x] Document migration completion status and known limitations

---

## New UI Systems Documentation

### Modal System
- Centralised with `modalStore`
- Promise-based `.open<T>` resolves with user choice
- Supports simple content or component modals, retains accessibility helpers

```ts
import { modalStore } from '$lib/ui/modal';

async function confirmDelete(name: string) {
  const confirmed = await modalStore.open<boolean>({
    title: `Delete ${name}?`,
    content: 'This action cannot be undone.',
    confirmText: 'Delete',
    cancelText: 'Cancel',
    variant: 'danger',
  });

  if (confirmed) {
    // perform destructive action
  }
}
```

### Toast Notifications
- Helper functions: `toast.success/error/warning/info`
- Optional `duration` and action callbacks

```ts
import { toast } from '$lib/ui/toast';

toast.success('Contest created successfully');
toast.error('Failed to save registration', { duration: 7000 });
toast.warning('Connection unstable – working offline');
toast.info('Next attempt queued');
```

### Contest Store
- `contestStore.setContest(contest, registrations)` seeds state
- Derived stores (`currentContest`, `currentRegistrations`) expose reactive data
- Notification bridge keeps store in sync with WebSocket events

```ts
import { contestStore, currentRegistrations } from '$lib/ui/contest-store';

function bootstrapContest(data: { contest: ContestDetail; registrations: Registration[] }) {
  contestStore.setContest(data.contest, data.registrations);
}

$: registrations = $currentRegistrations;
```

## Pending Follow-ups
- Lazy-load locale dictionaries so the default bundle only ships the active language.
- Defer contest desk modals (`AttemptEditorModal`, `RegistrationDetailModal`, etc.) with dynamic imports to shrink the initial route chunk.
- Serve coefficient tables via the Cloud API (D1/KV) instead of bundling JSON so display routes load faster.

---

_Last updated: 2025-09-20_

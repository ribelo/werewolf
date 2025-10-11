# Werewolf Cloud User Guide

_Last updated: 2025-09-20_

This guide walks meet directors and volunteers through the full competition workflow using the Werewolf Cloud platform.

---

## 1. Before the Meet

### 1.1 Prerequisites
- Create Cloudflare resources (D1, KV, Durable Object) using `wrangler.toml`.
- Share the Cloudflare API token with trusted operators only.
- Verify reference data (age categories, weight classes, plate colours) is loaded via migrations.

### 1.2 Local Run-Through (Recommended)
1. Start the Worker: `cd werewolf-cloud && bun run dev`.
2. Start the frontend: `cd werewolf-cloud/apps/web && PUBLIC_API_BASE=http://127.0.0.1:8787 bun run dev`.
3. Walk through the contest workflow outlined below with test data.

---

## 2. Contest Setup

1. Navigate to **Zawody → Nowe zawody**.
2. Fill in contest details:
   - Name, date, location, organizer (required).
   - Optional: federation rules, notes.
   - Select included events (e.g. squat, bench, deadlift only).
3. Add initial competitors in the wizard or leave it empty for later registration.
4. Review rack height defaults (SQ=10, BP=5) and adjust per lifter as needed.
5. Click **Utwórz zawody**. The app takes you to the contest dashboard.

---

## 3. Managing Competitors

### 3.1 Add/Edit Competitors
- Use the **Zawodnicy** tab inside the contest or the global competitor list.
- The modal captures name, birth date, club, city, bodyweight, rack heights, equipment flags.
- All fields support Polish and English labels; required fields show `*`.

### 3.2 Auto Classification
- When bodyweight and birth date are provided, the system auto-selects weight and age categories.
- You can override these values manually; changes sync immediately to the contest desk and displays.

---

## 4. Attempt Desk Workflow

1. Open the contest dashboard and switch to **Próby i transmisja**.
2. Use the **Edytuj próby** button next to a lifter to open the grid editor:
   - Adjust weights for each attempt.
   - Toggle equipment flags and opening attempts.
   - Save changes; the UI updates optimistically.
3. Use the **+ Próba** quick action to queue the next attempt with a weight bump.
4. Update result status inline (Pending → Udana / Nieudana / Pominięta).
5. Press **Ustaw jako aktualną** to broadcast the attempt to displays.
6. Use **Wyczyść aktualną** when the lifter steps off the platform or flight switches.

All actions emit real-time events; displays update instantly, with polling fallback if WebSockets drop.

---

## 5. Displays & Sharing

### 5.1 Announcer Table (`/display/table`)
- Shows the active attempt, plate breakdown, upcoming queue, and overall contest summary.
- Includes a QR code and share button to open on another device.

### 5.2 Big Screen (`/display/current`)
- Full-screen display for projector/TV.
- Shows lifter name, attempt number, weight, plate plan, rack heights, equipment icons, and recent history.
- Defaults to Polish copy; change language in settings to switch.

---

## 6. Settings & System Health

- Access via **Ustawienia**.
- Toggle UI options (show weights, theme), update default bar weights, and change language.
- Monitor health status cards:
  - **API** – live connectivity to the Worker.
  - **Baza danych** – row counts in D1.
  - **KV** – cached payload statistics (after KV diagnostics ship).
- Backup and restore tooling is available via API endpoints (see docs/api-endpoints.md).

---

## 7. After the Meet

1. Export results via `/contests/:id/results/export` (JSON/CSV once implemented).
2. Trigger manual backups if running in production.
3. Clear the current attempt to reset displays.
4. Archive contests when no longer active (planned enhancement).

---

## 8. Troubleshooting

| Issue | Resolution |
|-------|------------|
| WebSocket disconnects in dev | Expected: Durable Objects aren’t emulated. The UI falls back to polling automatically. |
| API badge stuck on "Sprawdzanie…" | Ensure the Worker is running and `PUBLIC_API_BASE` matches the port. Reload after reconnecting. |
| Language change not applying | Confirm the `/settings` PATCH call succeeds; reload browser to rehydrate i18n cache. |
| KV diagnostics show “Brak danych” | Feature still in development. Track progress in `docs/post-migration-action-plan.md`. |

---

## 9. Keyboard Shortcuts & Accessibility

- **Esc** closes modals.
- **Enter** submits forms where applicable.
- Toast notifications are screen-reader friendly and dismissible.
- The announcer/big-screen views use high-contrast palettes suitable for projectors.

---

## 10. Support

Need help during a meet? Contact the maintainers via GitHub Issues/Discussions or the private Werewolf Discord. For Polish-language assistance, reach out to the original meet organizers.


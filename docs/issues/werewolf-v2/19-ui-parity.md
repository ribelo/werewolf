# 19: UI parity with the old app

**Parent:** werewolf-v2 (../werewolf-v2.md) — section "UI continuity"

**What to build:** Make the v2 interface almost identical to the old app, view by view: the same layout, columns, Polish texts, colours, buttons and flows. Each deviation that cannot be avoided is listed with its reason.

**Blocked by:** 18

**Status:** in-progress

## Method

The v2 screens copy the markup and the Tailwind classes of the old Svelte components (`~/projects/ribelo/werewolf/werewolf-cloud/apps/web`). The old Polish and English texts are bundled unchanged in `apps/web/src/legacy/` and read with `legacyText`. New texts are under the key `v2`.

## View checklist

Checked in Leash against the old app or its source, with the 2025 data and the 2026 registrations.

- [x] Login (old login card)
- [x] Contest list (tiles, count card, contest cards with town and date)
- [x] Contest tabs (Stanowisko, Rejestracja, Wyniki drużynowe, Obciążenia, one tab per lift)
- [x] Desk "Stanowisko" (status cards, screen links, setup tiles, current attempt, queue, recent attempts)
- [x] Registrations (filters, lift switches, competitor dialog, plates editor)
- [x] Lift tables (attempt grid with live and status buttons, weight inputs, points, sort, filters, export, QR, Synchronizuj)
- [x] Team results
- [x] Plates
- [x] Stage screen (decipher animation, attempt tiles with glow, barbell, plates, rack height, QR)
- [x] Announcer table (auto-sync, auto-scroll and speed, filters, lift choice, read-only table)
- [x] Public table (filters, read-only table)
- [x] Public results (individual and team tabs)
- [x] Edit contest and manage categories (dialogs)
- [ ] Contest wizard (v2 wizard kept; the 2025 wizard has 1563 lines of different steps)
- [ ] System and settings page (language only)

## Deviations

1. No flights: the spec has no flights, so the flight column, "Zarządzaj flightami" and the active flight are not shown. The tile is "Kopie zapasowe" (backups) instead.
2. No API status line in the page header: v2 has no separate API address. The desk status card shows the connection.
3. Contest status (SETUP, IN PROGRESS, COMPLETED) is computed from the verdicts; the 2025 app stored it by hand.
4. No city and no notes field for a lifter: v2 has no such fields.
5. "Wyczyść bieżącą próbę" is not shown: in v2 the next attempt in the lifting order is always current. "Nie wystartował (DNS)" takes its place.
6. The 2025 "Wyniki indywidualne" tab is removed at the client's request (2026-10-12); the lift tables show the same points.
7. The contest list shows no discipline, bar weights, delete button or registrations total: the catalog keeps only id, name, date and town.
8. Old bugs not copied: "100kg kg" in the recent attempts and the bar weight on the stage screen.

## Verified

- `bun run gate:full` passes. Screen tests: `apps/web/src/screens.test.tsx`.

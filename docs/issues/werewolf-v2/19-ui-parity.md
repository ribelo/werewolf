# 19: UI parity with the old app

**Parent:** werewolf-v2 (../werewolf-v2.md) — section "UI continuity"

**What to build:** Make the v2 interface almost identical to the old app, view by view. Same layout, same order of fields and columns, same Polish labels and texts, same colours, fonts and sizes, same button positions, same keyboard shortcuts, same flows (same number of clicks), same empty states, dialogs and messages. The meet-day operator must not learn the screens again. Each deviation that cannot be avoided is listed with its reason.

**Blocked by:** 18

**Status:** in-progress

## Inventory

Old app: `~/projects/ribelo/werewolf/werewolf-cloud` (read only). v2: this worktree.

| Old route (SvelteKit) | Old source | v2 view |
|---|---|---|
| `/login` | `routes/login/+page.svelte` | login card in `App.tsx` |
| `/` | `routes/+page.svelte` | `ContestCatalog.tsx` |
| `/settings` | `routes/settings/+page.svelte` | none yet (see deviations) |
| `/contests/new` | `routes/contests/new/+page.svelte` | `Wizard.tsx`, `RulebookEditor.tsx` |
| `/contests/[id]/+layout` | `routes/contests/[id]/+layout.svelte` | tabs in `ContestDesk.tsx` |
| `/contests/[id]/desk` | `ContestManagerView.svelte` | `MeetDay.tsx` |
| `/contests/[id]/registrations` | `ContestManagerView.svelte` | `EntriesPanel.tsx` |
| `/contests/[id]/results` | `results/+page.svelte`, `IndividualResultsTab.svelte` | `Results.tsx` |
| `/contests/[id]/team-results` | `team-results/+page.svelte`, `TeamResultsView.svelte` | `Results.tsx` (team part) |
| `/contests/[id]/plates` | `PlatesPanel.svelte` | plates tab in `ContestDesk.tsx` |
| `/contests/[id]/bench`, `squat`, `deadlift` | `LiftPanel.svelte` | lifts tab in `ContestDesk.tsx` |
| `/display/current` | `display/current/+page.svelte` | stage screen in `LiveScreens.tsx` |
| (announcer view) | `display/current` | announcer part of `LiveScreens.tsx` |
| `/display/table` | `display/table/+page.svelte` | `Scoreboard.tsx` |
| `/display/share` | `display/share/+page.svelte` | `ViewerScreen.tsx`, QR in `Scoreboard.tsx` |
| `/results/[id]` | `results/[id]/+page.svelte` | `ViewerScreen.tsx` (results) |
| exports (CSV, PDF, JPG) | `lib/export/*` | `export-pdf.ts`, `export-jpg.ts`, CSV in `Results.tsx` |
| backups | `settings/backup-workflows.ts` | `Backup.tsx` |
| dialogs | `CompetitorModal`, `AttemptEditorModal`, `ContestEditorModal`, `FlightAssignmentModal`, `ContestCategoryModal`, `MutationQueueModal` | inline forms in v2 screens |

## View checklist

Each box is ticked only after the view was checked in Leash (desk and organizer 1440x900, stage and scoreboard 1920x1080, public results and read-only links 390x844, both languages).

- [x] Login
- [ ] Contest list
- [ ] System and settings
- [ ] Contest wizard
- [ ] Contest tabs
- [ ] Desk (attempt entry, verdicts, lifting order, next attempt, plate calculator, rack heights)
- [ ] Registrations and import
- [ ] Individual results
- [ ] Team results
- [ ] Plates
- [ ] Lift tables (squat, bench, deadlift)
- [ ] Stage screen
- [ ] Announcer view
- [ ] Scoreboard
- [ ] Share screen and QR
- [ ] Public results (phone)
- [ ] Exports (CSV, PDF, JPG)
- [ ] Backups
- [ ] Dialogs and messages

## Deviations

Status: in-progress. Open views: contest list, system and settings, contest tabs, desk, registrations, individual results, team results, plates, lift tables, stage screen, announcer view, scoreboard, share screen and QR, public results, exports, backups, dialogs. Screenshots of the open views are in `/tmp/ww-parity/`.

Deviations found so far, each with its reason:

1. Contest list: location, discipline, bar weights, status badge and the delete button are not shown. Reason: the catalog response has only id, name and date. Adding fields changes the catalog response, so the owner must decide.
2. Contest list: only the contest count is shown. The registrations total and the database status card are not shown. Reason: v2 keeps one Durable Object per contest and has no global totals.
3. Contest list: the restore-from-backup control stays under the list. Reason: v2 keeps it there; the old app has no restore control on that page.
4. Page header: the API status line (URL, status, Check button) is not shown. Reason: v2 has no separate API base. Live status is shown on the desk.
5. Settings: only the language choice exists. Reason: the old database panel (health, KV backups, reset) has no v2 counterpart. A reset is not in the specification. Contest backups are in the desk tab "Kopie zapasowe".
6. Tile "System i ustawienia": the text is "Wybierz język interfejsu." Reason: the old text describes scoring and bar settings, which in v2 belong to each rulebook.
7. Desk: the tab "Boje" shows all lifts in one table. The old app has one tab per lift ("Wyciskanie", "Martwy ciąg"). Pending.
8. Fonts: the old app loads Bebas Neue, Inter and JetBrains Mono from Google Fonts. The test machine had no internet, so old screenshots show fallback fonts. v2 ships the same families.
9. Old login shows a "Real-time connection lost" toast. v2 does not show it yet.
10. Viewports: Leash windows are about 1884 x 943. Leash has no viewport option, so the requested 1440 x 900, 1920 x 1080 and 390 x 844 checks are not done yet.
11. Test data: the local v2 state has an extra contest "Ticket 05 browser proof" from earlier tests. The old app does not have it.

## Verified

- Login (Leash, Polish, both apps): same card, eyebrow, title, subtitle, field label, placeholder and button text. The card height is 316 px in v2 and 318 px in the old app. The button has the same red glow. The header is hidden on the login page, as in the old app.
- Contest list: header, two tiles, count card, section heading with the total, and the contest cards with START rows match the old structure. The deviations 1 to 4 apply.
- Desk tabs: the old labels and order are used (STANOWISKO, REJESTRACJA, WYNIKI INDYWIDUALNE, OBCIĄŻENIA, BOJE, KOPIE ZAPASOWE). The header and subtitle match the old desk. The desk body is not yet matched (deviations 7 and onward).

Screenshots are kept in `/tmp/ww-parity/` (not in the repository).

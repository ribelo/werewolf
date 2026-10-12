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

To be listed at the end of the ticket, each with its reason.

## Verified

Screenshots are kept in `/tmp/ww-parity/` (not in the repository).

# 22: Client feedback of 2026-10-14, second round

**Parent:** werewolf-v2 (../werewolf-v2.md) — stories ww-widg, ww-6pk1, ww-8tai, ww-254l, ww-gr75; section "Client meeting 2026-10-12"

**What to build:** A desk that uses the whole screen like an application, a clock with three states, separate export and print, a big-screen view and livelier stage screens.

**Blocked by:** 21

**Status:** in-progress

- [x] Attempt clock: one button walks start → stop (frozen on its second) → reset; core commands StartClock, StopClock, ResetClock; the clock is stamped and counted in server time (`/api/health` returns `now`), so devices with a wrong clock agree
- [x] Lift tabs: title, filters, sync, QR, export, print and clock in one row; the table fills the screen; no frame around the table
- [x] Compact application bar instead of the page header; no card around tables; smaller margins on every organizer view
- [x] "Stanowisko" is a dashboard of tiles (screens and setup); current and recent attempt cards removed
- [x] Export and Print are separate buttons on lift tabs, team results and the public results page (individual results gained both)
- [x] Print: A4 landscape, no browser header and footer, margins kept on every page, header row repeated
- [x] Team results use the same table style as the lift tables
- [x] Public table and announcer table auto-scroll also on screens with a device pixel ratio of 1
- [x] Announcer table: one-line header, QR in the corner, one box per attempt
- [x] Big screen (telebim) view: lifter, team, lift and attempt, weight, three attempts, clock, next three lifters, verdict flash and verdict videos; it uses the stage token
- [x] Tile "Filmy na telebim" opens the video library; the library left "Edytuj zawody"
- [x] Stage screen redrawn: name decipher with a sweep, attempt tiles pop in, the weight counts up, plates slide onto a drawn bar, next lifters glide to their new places, a verdict flash
- [x] Contest list: one toolbar with create and restore, no duplicated settings tile or contest counts
- [ ] Bodyweights of the 2026 contest from the weight classes: waiting for the source file

## Verified

- Core test for the clock states; `bun run check` passes.
- Local Worker with a copy of the production contest, headless Chrome at 1650×990: desk tabs, stage, big screen, announcer, public table, results, contest list; the clock went 1:00 → 0:57 (stop) → 0:57 → 1:00 (reset); the announcer table scrolled by itself; the print output rendered to PDF as two A4 landscape pages without header and footer.

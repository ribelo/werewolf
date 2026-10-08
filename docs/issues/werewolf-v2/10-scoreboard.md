# 10: Scoreboard on TV with remote filter and QR

**Parent:** werewolf-v2 (../werewolf-v2.md) — stories ww-8tai, ww-l06a, ww-uewf

**What to build:** Read-only scoreboard of all entries and attempts filtered by division, lift, sex, age class or weight class, with auto-scroll; the desk pushes a filter and shows/hides the QR remotely; state survives reconnects.

**Blocked by:** 08

**Status:** done

- [x] Desk filter push changes the TV within a second
- [x] QR visibility replayed to a screen that connects later
- [x] Only members of the chosen division appear

## Verified

- New command SetScoreboard (filter by division, lift, sex, age class, weight class; optional QR address). It lives in the command log, so a screen that connects later replays it.
- Screen tests (`Scoreboard.test.tsx`): only members of the chosen division are listed, MONSTER-only included only when chosen (ww-8tai, ww-zpeu); a pushed QR code is drawn (ww-l06a). Workerd test: a screen that connects after the push receives filter and QR in its snapshot (ww-l06a, ww-uewf).
- Real Chrome with a local Worker (throwaway script): the desk chose division MONSTER; the TV went from 4 rows to 2 in 64 ms; QR shown by the desk appeared on the TV; a screen opened afterwards showed 2 rows and the QR. The TV opens from its own read-only link without a password.
- Auto-scroll is a timer (1 px / 40 ms, back to the top); not checked on a real TV.
- `bun run gate:full` passes.

# 23: Stage screen and live attempt, 2026-10-15

**Parent:** werewolf-v2 (../werewolf-v2.md) — stories ww-widg, ww-adgy

**What to build:** Owner feedback on the stage screen and on who is live after a verdict.

**Blocked by:** 22

**Status:** done

- [x] Weights on the stage screen and the big screen always with two decimals (180.00)
- [x] Attempt tiles pulse again: the live one white with a light sweep, judged ones green or red (the entrance animation had replaced the pulse)
- [x] Surname and first name on separate lines on the stage screen and the big screen
- [x] "Następni" removed from the stage screen and the big screen
- [x] A verdict no longer moves the screens to the next lifter: the judged attempt stays live until the desk presses "Ustaw na żywo" (story ww-adgy changed by the owner)

## Verified

- Core test: a judged live attempt stays current; SetCurrent moves on; without a choice the first in order is live and its verdict pins it.
- Local Worker, headless Chrome: a verdict at the desk kept "Staroń Angelika" live; the stage screen showed her tile green and pulsing.
- `bun run check` passes.

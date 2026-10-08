# 08: Desk: full meet-day flow

**Parent:** werewolf-v2 (../werewolf-v2.md) — stories ww-u0ni, ww-adgy, ww-z7vp, ww-mq50, ww-lcu1, ww-8ta6, ww-tds3

**What to build:** The desk screen runs the meet: lifting order with the current attempt, one-click good/no lift that advances to the next attempt, next-attempt declaration, loadability check with suggestion, correcting any past attempt, manual reorder, undo.

**Blocked by:** 05, 03

**Status:** done

- [x] A full flight of a bench+deadlift contest can be run with mouse/keyboard only
- [x] Verdict + next current attempt in one click
- [x] Component tests for verdict and declaration

## Verified

- Component tests (`apps/web/src/MeetDay.test.tsx`, jsdom): one click on Good lift records the verdict and the next lifter becomes current (ww-adgy, ww-u0ni); G and N keys do the same (ww-adgy); the next attempt of the lifter who just lifted is offered with the last weight, an impossible weight shows the nearest loadable weight and blocks the button, "use nearest" then declares it (ww-z7vp, ww-mq50); manual move down and undo restore the queue (ww-tds3, ww-8ta6).
- Real Chrome against a local Worker (throwaway script): 4 entries, bench and deadlift, 24 attempts. I ran the whole flight with the keyboard only (G/N keys, Enter in the weight field): 24 verdicts reached the server log. A first run stopped with undeclared attempts because the next-attempt panel offered only the last judged lifter. That was a missing feature, not a test fault. The panel now lists every lifter whose next attempt has no weight (`MeetDay.tsx`), and the second run finished the flight. Any attempt can also be corrected in the Lifts tab (ww-lcu1).
- Tailwind restyle (owner decision, see the specification): desk tabs, status badges, attempt tables and buttons use the 2025 colours, fonts and layout. Compared with the screenshots of the 2025 desk screens by eye.
- `bun run gate:full` passes.

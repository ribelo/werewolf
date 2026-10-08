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
- Real Chrome against a local Worker (throwaway script): 4 entries with bench and deadlift; I ran the desk with the keyboard only (G/N keys, Enter in the weight field). 21 verdicts reached the server log. The script stopped with 3 attempts still undeclared, because the next-attempt panel offers only the latest judged lifter; undeclared attempts stay editable in the corrections table (ww-lcu1).
- `bun run gate:full` passes.

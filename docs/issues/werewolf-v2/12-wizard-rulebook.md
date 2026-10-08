# 12: Contest wizard, rulebook editor and presets

**Parent:** werewolf-v2 (../werewolf-v2.md) — stories ww-s8ny, ww-7s20, ww-r2tx, ww-6ft3

**What to build:** Step-by-step wizard (basics, rulebook from preset, divisions and classifications, teams, entries, review) and a rulebook editor; rulebook export/import as JSON; presets: powerlifting, bench + deadlift, single lift, and the client's 2026 rulebook (four team classifications, curl, MONSTER, kids placeholder).

**Blocked by:** 04, 11

**Status:** done

- [x] A new contest from the 2026 preset is ready in under 5 minutes
- [x] Invalid rulebook JSON rejected with a readable reason
- [x] Rulebook round-trips export → import unchanged

## Verified

- New: presets (2026 client, powerlifting, bench + deadlift, single lift) in the core, rulebook JSON export/import with one-sentence failures, a rulebook editor (name, lifts, divisions with conditions, age and weight classes, classifications incl. team quotas, equipment) and a six-step wizard at /new (basics, rulebook, divisions and classifications, teams, entries, review). Teams and entries entered in the wizard are kept as commands and sent after the contest exists.
- The 2026 preset now has a Kids division with no conditions and no classification: a placeholder. I did not invent kids rules (owner decides on 2026-10-10).
- Core tests (`presets.test.ts`): every preset parses with the right lifts (ww-s8ny); every preset exports to JSON and imports back equal (ww-7s20); broken JSON and a broken lift reference give one readable sentence (ww-7s20); the kids division is an empty placeholder (ww-e1fo).
- Screen tests (`RulebookEditor.test.tsx`): pasted broken JSON shows the reason and keeps the rulebook; a lift can be added; pasted exported JSON replaces the draft (ww-dwfd, ww-7s20).
- Real Chrome against a local Worker (throwaway script): login, /new, name, five clicks on Next, one team, an .xlsx import of 2 valid rows, Create: the contest, the team and both entries were on the desk. The scripted run took about 1 s; a human needs six screens. A first run lost the imported entries because the wizard used a stale list when many commands arrived at once; fixed.
- Not checked: the "under 5 minutes" criterion with a real person; the editor was exercised by tests and the scripted run, not by hand on a phone.
- `bun run gate:full` passes.

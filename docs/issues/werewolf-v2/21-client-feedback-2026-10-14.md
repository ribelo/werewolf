# 21: Client feedback of 2026-10-14

**Parent:** werewolf-v2 (../werewolf-v2.md) — stories ww-widg, ww-lcu1, ww-z7vp, ww-8pme, ww-1mwv, ww-6ft3

**What to build:** Fixes that the client asked for after a test of the deployed desk.

**Blocked by:** 20

**Status:** done

- [x] The barbell plan uses the fewest plates per side (170 kg was 3×20 + 5×2.5, now 2×25 + 20 + 2.5)
- [x] An attempt weight can be taken back: an empty field makes a declared attempt unannounced (command ClearWeight)
- [x] The attempt clock with start and stop is on every lift tab, not only on "Stanowisko"
- [x] Entry import: a "Kategoria wagowa" column such as "MĘŻCZYZNA DO 110 KG" gives the bodyweight 110 until the weigh-in; an open class ("+120 kg") gives no bodyweight
- [x] Backups on the server: "Utwórz kopię zapasową" writes a backup to R2 now; the list shows manual and automatic backups, each one can be downloaded or restored
- [x] Name order on the stage screen stays surname first; the swapped names came from the client's spreadsheet, not from the app

## Verified

- Core tests: fewest plates (ww-widg), ClearWeight and its refusal for a judged attempt (ww-lcu1), weight class limit in the import (ww-8pme ww-1mwv).
- Workerd test: create, list and fetch a backup on the server; 401 without the organizer (ww-6ft3).
- Local Worker in Leash: the clock counts down on the bench tab; an emptied second attempt shows "—"; "Utwórz kopię zapasową" adds a row to the list.
- `bun run check` passes.

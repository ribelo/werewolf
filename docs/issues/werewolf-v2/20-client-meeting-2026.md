# 20: Changes from the client meeting of 2026-10-12

**Parent:** werewolf-v2 (../werewolf-v2.md) — stories ww-ot23, ww-ss5k, ww-zpeu, ww-e1fo; section "Client meeting 2026-10-12"

**What to build:** The changes that the client asked for after the 2025 contest.

**Blocked by:** 19

**Status:** done

- [x] One entry per lifter: divisions are tags, Open is everybody, MONSTER (bench in a shirt) is a lift
- [x] Strict curl is a lift; SAMORZĄDOWIEC is not in the 2026 rulebook
- [x] Kids age classes 2–8, 9–12, 13–15; check boxes choose the age classes that count in team classifications (kids up to 12 are out by default)
- [x] Excel export and direct print of the lift and team tables, as filtered
- [x] Videos after a verdict on the stage screen (library in R2, one list for good and one for failed lifts)
- [x] Attempt clock: started and stopped by hand at the desk, 60 s by default, set in "Edytuj zawody", shown on the stage screen
- [x] Public table and announcer table scroll by themselves
- [x] Every plate in the barbell picture keeps a visible band of its colour
- [x] WUAP logo on the stage screen, the announcer table, the public table and the public results
- [x] One tab per team classification; no individual results tab

## Verified

- Core: new commands SetRulebook, StartClock, StopClock, ClearVerdict, SetEntryLifts, SetLifter, RemoveEntry; classification field ageClassIds; rulebook field clockSeconds; plate colour.
- Screen tests in `apps/web/src/screens.test.tsx`; local check in Leash with the 2025 data and the 2026 registrations.
- The video endpoints were checked with curl on the local Worker: upload needs the organizer, list and play do not.
- `bun run gate:full` passes.

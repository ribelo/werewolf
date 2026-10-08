# 11: Entries, teams, weigh-in and CSV/Excel import

**Parent:** werewolf-v2 (../werewolf-v2.md) — stories ww-2jxr, ww-tzv6, ww-1mwv, ww-ewrn, ww-nmgu, ww-y3gt, ww-8pme, ww-ss5k, ww-3vpp

**What to build:** Lifters and entries (lifts subset, divisions, team from the list, opening weights, rack heights, lot numbers), team list with rename/merge, a weigh-in screen updating classes and coefficients, and import from CSV/Excel with a preview and per-row errors.

**Blocked by:** 05

**Status:** done

- [x] Import of last year's entry list works with a mapping preview
- [x] Merging GÓRNIK into Górnik moves all entries
- [x] Weigh-in updates age/weight class and points immediately

## Verified

- New command SetEntryTeam (assign or clear a team). Entries tab: entry list with lot number (edit or draw), team, weigh-in with live age class, weight class, Reshel and McC. values while typing, division check boxes with the core's division warnings, rack heights, add-entry form with team and opening weights per lift, team list (add, rename, merge), import.
- Core tests (`entry-import.test.ts`): a semicolon CSV with BOM, Polish headers, quoted cell, European and ISO dates is mapped from its headers and planned with per-row problems (bad date, unknown sex) and no command for bad rows (ww-8pme); "Górnik" and "GÓRNIK" become one team (the core treats team names case-insensitively, so such a pair can never exist as two teams); lot numbers are drawn without clashes and a single-lift entry is accepted (ww-nmgu, ww-3vpp); a row without a division is rejected (ww-ss5k, ww-s8zx); merging a team moves all its entries and a team can be cleared (ww-tzv6). The draw loop once hung forever with a constant random source and hung the test run; it now picks from the free numbers.
- Screen tests (`EntriesPanel.test.tsx`): typing a bodyweight changes age class, weight class and Reshel at once, and the weigh-in button stores it (ww-1mwv); a CSV file is previewed with errors, only valid rows import, one team results (ww-8pme, ww-tzv6).
- Real Chrome (throwaway script) with a hand-built .xlsx file of the same list: the mapping was guessed from the headers, the preview showed 2 ready rows and the error "Zła data urodzenia 31.02.1990", and the import added the 2 entries to the 4 existing ones.
- I do not have the owner's real 2025 entry list; the importer is verified on a list in the shape the old database used (first name, last name, sex, birth date, club).
- Limit: lifts of an existing entry cannot be changed after creation (no command for it).
- `bun run gate:full` passes.

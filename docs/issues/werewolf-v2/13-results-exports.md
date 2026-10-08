# 13: Results pages, public results, exports

**Parent:** werewolf-v2 (../werewolf-v2.md) — stories ww-sbfk, ww-6hvn, ww-gr75, ww-254l, ww-52g7

**What to build:** Results screens for every classification (individual, split, team with counted lifters), a public live results page per contest with link and QR, and exports: CSV in last year's federation format, PDF and JPG.

**Blocked by:** 04, 10

**Status:** in-progress (the byte-for-byte CSV check needs the migrated 2025 contests of ticket 15)

- [ ] CSV matches last year's format byte-for-byte for the migrated contests (except MONSTER-leak corrections)
- [x] Public page updates live and works on a phone
- [x] PDF has correct page numbering

## Verified

- Core (`results-export.ts`): the federation CSV in the 2025 layout (BOM, semicolons, title row, blocks by sex and age class with women first, header row, places renumbered inside each block, failed attempts negative, a fourth attempt column, header spelling "McCoulogh" as before) and plain tables for individual and team classifications. Lifts get an export code (`code` in the rulebook, BP/DL/SQ/BC in the presets). Test `results-export.test.ts` (ww-52g7, ww-sbfk, ww-6hvn) checks a hand-written expected file, quoting and trailing-zero rules from the old tests.
- Screen tests: a split classification shows one table per age class (ww-sbfk, ww-zpeu); team table lists counted lifters with points (ww-6hvn); the public page has no export buttons (ww-gr75). PDF tests (`export-pdf.test.tsx`): a 140-row table spans several pages, every page is numbered "n / total", two classifications start on separate pages (ww-254l).
- Real Chrome against a local Worker (throwaway script): CSV, PDF and JPG were downloaded from the desk's Results tab (files `open-martwy-ciag.*`); the JPG shows the dark 2025-style table with Polish letters; the PDF (175 KB, Noto Sans subset, from the old app's font) opened as a valid PDF. A phone-sized public results page (390 px) listed the classifications and updated in about 9 ms after a verdict was accepted (ww-gr75).
- NOT verified: "CSV matches last year's format byte-for-byte for the migrated contests". It needs the 2025 contests (ticket 15). I matched the old exporter's code and tests by reading them, not byte by byte against a real file. Open point for ticket 15: the old file listed lifters without a good lift with a place number; this export does the same.
- `bun run gate:full` passes.

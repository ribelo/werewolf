# 03: Contest core: results and individual classifications

**Parent:** werewolf-v2 (../werewolf-v2.md) — stories ww-m7xy, ww-90sr, ww-sbfk, ww-zpeu, ww-1pjp, ww-e1fo

**What to build:** From the same commands the core derives per-entry best results and every individual classification: chosen divisions and lifts, formula kg / Reshel / Reshel × McCullough (age at contest date, timezone-free), optional split by age or weight class, IPF tie-breaks. Rankings contain only members of the classification's divisions.

**Blocked by:** 02

**Status:** done

- [x] Reshel and McCullough tables bundled; coefficients match the 2025 app for the same inputs
- [x] A MONSTER-only entry appears only in MONSTER rankings
- [x] Ties: points, then lighter bodyweight, then earlier time of result
- [x] A kids division with its own age range and kg formula needs only rulebook data

## Verified

2026-10-08:

- Ran `bun run gate:full`. Native TypeScript, Effect diagnostics, lint, formatting and Knip passed. All 18 tests passed. Seven public-core result scenarios cover all six story identifiers.
- Bundled the 894 coefficient rows from the committed 2025 datasets, with their source metadata. A manual Bun comparison used the original 2025 lookup functions: 4,221 Reshel inputs and 131 ages matched. Inputs include every row, half-step rounding, the missing table row and values outside the table ranges.
- Manually replayed a timestamped MONSTER-only entry. Open had no row; MONSTER had its 100 kg result. Scenario tests also verify explicit lift membership and complete multi-lift totals.
- Verified all three formulas with independent numeric expectations: 100 kg, 102.9 Reshel points and 152.292 Reshel × McCullough points. Calendar-date tests cover birthdays and leap-day boundaries.
- Verified points, bodyweight and actual result time in this order. A later-arriving command with an earlier occurrence time wins the final tie. Weight and verdict corrections keep the original attempt time.
- Verified all four split modes and exact weight boundaries. Ambiguous class ranges fail at the rulebook boundary; missing weigh-ins and class matches remain explicit pending results.
- Verified a configured child range and kilogram formula. Changing the age range needs only JSON rulebook data. No core branch identifies a named lift or division. No production resource changed.

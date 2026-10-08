# 02: Contest core: rulebook, entries, attempts, lifting order, verdicts

**Parent:** werewolf-v2 (../werewolf-v2.md) — stories ww-s8ny, ww-dwfd, ww-8fz8, ww-ot23, ww-lxn4, ww-ym25, ww-3vpp, ww-ss5k, ww-s8zx, ww-1mwv, ww-nmgu, ww-y3gt, ww-cdxd, ww-tds3, ww-u0ni, ww-adgy, ww-z7vp, ww-mq50, ww-lcu1, ww-8ta6, ww-tzv6, ww-sy28, ww-03e1

**What to build:** The pure contest core accepts a versioned rulebook JSON and an ordered list of commands and returns contest state, the lifting order and the current attempt. Lifts are generic (any name), attempts per lift come from the rulebook, divisions have explicit membership and optional conditions, weights are checked against bar + clamps and the plate inventory, verdicts, corrections, manual order overrides and undo are commands.

**Blocked by:** 01

**Status:** done

- [x] Scenario tests: bench+deadlift contest, curl-only contest, an entry with only one lift
- [x] Lifting order: lift by lift, round by round, weight asc, lot number asc; manual override honoured
- [x] Entry not meeting a division condition is warned/rejected per rulebook
- [x] Unloadable weight rejected with the nearest loadable weight suggested
- [x] Undo reverts exactly the last command
- [x] No code path mentions a specific lift name

## Verified

2026-10-08:

- Ran `bun run gate:full`: native TypeScript, Effect diagnostics, lint, formatting and Knip passed. All 11 tests passed, including 10 public-core scenarios and the Worker authentication scenario.
- Parsed rulebook JSON and commands through the public core interface. The scenarios verify two lifts, a single-lift entry and a curl-only rulebook with four attempts. Interpreter decisions use configured lift identifiers, not lift names.
- Verified ordering by lift, round, weight and lot. A manual move changes the order; explicit selection changes the current attempt; a verdict advances it. Past weight and verdict corrections retain the first result position in the log.
- Verified warning and rejection policies for sex, age, bodyweight and allowed lifts. MONSTER membership does not add Open. Completed-years age uses the supplied contest date.
- Verified the bar and clamp minimum, symmetric plate pairs, finite inventory, nearest-load ties and a non-greedy plate combination. A manual Bun call returned four custom-lift attempts and suggested 50 kg for an impossible 51.25 kg declaration.
- Verified exact command cancellation for weight, bodyweight, order and selection. Named undo preserves independent later edits and rejects cancellation when later commands require the removed entry.
- The pure core has no I/O or current-clock dependency. Rulebook labels contain Polish and English text. No production resource changed.

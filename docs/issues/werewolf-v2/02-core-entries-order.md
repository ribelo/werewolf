# 02: Contest core: rulebook, entries, attempts, lifting order, verdicts

**Parent:** werewolf-v2 (../werewolf-v2.md) — stories ww-s8ny, ww-dwfd, ww-8fz8, ww-ot23, ww-lxn4, ww-ym25, ww-3vpp, ww-ss5k, ww-s8zx, ww-1mwv, ww-nmgu, ww-y3gt, ww-cdxd, ww-tds3, ww-u0ni, ww-adgy, ww-z7vp, ww-mq50, ww-lcu1, ww-8ta6, ww-tzv6, ww-sy28, ww-03e1

**What to build:** The pure contest core accepts a versioned rulebook JSON and an ordered list of commands and returns contest state, the lifting order and the current attempt. Lifts are generic (any name), attempts per lift come from the rulebook, divisions have explicit membership and optional conditions, weights are checked against bar + clamps and the plate inventory, verdicts, corrections, manual order overrides and undo are commands.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Scenario tests: bench+deadlift contest, curl-only contest, an entry with only one lift
- [ ] Lifting order: lift by lift, round by round, weight asc, lot number asc; manual override honoured
- [ ] Entry not meeting a division condition is warned/rejected per rulebook
- [ ] Unloadable weight rejected with the nearest loadable weight suggested
- [ ] Undo reverts exactly the last command
- [ ] No code path mentions a specific lift name

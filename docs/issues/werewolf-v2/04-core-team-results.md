# 04: Contest core: team classifications incl. the client's four

**Parent:** werewolf-v2 (../werewolf-v2.md) — stories ww-4yp8, ww-fwnw, ww-gybz, ww-ub7m, ww-dtzk, ww-eje4, ww-6hvn

**What to build:** Team classifications from the rulebook: divisions or all, lifts counted, formula, quota (any N, or N men + M women), each lifter counted once with their best eligible result, incomplete teams ranked by their sum, tie-break by best counted lifter. The client's 2026 rulebook declares the four team rankings.

**Blocked by:** 03

**Status:** done

- [x] Men top-5 Reshel in bench or deadlift, one result per man
- [x] Women top-5 Reshel likewise
- [x] Bench 4 men + 1 woman; deadlift 4 men + 1 woman
- [x] Incomplete teams ranked below by their lower sum, never dropped
- [x] Each team row lists its counted lifters and points

## Verified

- Date: 2026-10-08, Europe/Warsaw. Full gate completed at 12:11.
- bun run format && bun run gate:full: passed. Lint had no warnings or errors. Native TypeScript and Effect checks passed. All 23 tests in four files passed. Format and Knip checks passed.
- Five retained public-core scenarios cover all seven ticket stories. They use parsed rulebooks and command replay, not internal mocks or network calls.
- The 2026 JSON rulebook declares men best five, women best five, bench four men plus one woman, and deadlift four men plus one woman. All use Reshel points and explicit Open membership. Equipment and individual classifications are editable starting values. Ticket 12 owns the kids placeholder; no kids conditions are invented here.
- Twelve dual-lift lifters give independently calculated sums of 1264.8, 1243.375, 999.695 and 1302.05. Counted rows contain each lifter's entry and points. High MONSTER, curl-only and unassigned entries do not change these sums.
- Any-count and sex-specific quotas work with a custom lift ID. Missing slots are not filled by the other sex. A one-lifter team with 550 points ranks above a complete five-lifter team with 500 points. An empty registered team stays with zero points.
- Equal sums of 200.1 + 0.2 and 100.1 + 100.2 rank by the best counted lifter. Scores use nine decimal places: gram weights and two three-decimal coefficient tables. Binary addition noise does not decide a place.
- A configured two-lift masters total of 250 kg gives 380.73 points. A missing weigh-in stays explicit in the pending list.
- Removed one invalid temporary fixture: replay already rejects a second entry with the same lifter ID. Dual-lift quota scenarios verify one result per lifter without a redundant identity map.

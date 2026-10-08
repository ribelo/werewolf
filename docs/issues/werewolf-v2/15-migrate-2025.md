# 15: Migrate the 2025 contests

**Parent:** werewolf-v2 (../werewolf-v2.md) — stories ww-zchn

**What to build:** A one-off script converts the 2025 production export into rulebooks + command logs in new contest Durable Objects, and a report compares the new rankings with the old app's results.

**Blocked by:** 04, 05

**Status:** done

- [x] Both 2025 contests load with 190 entries and 705 attempts
- [x] Differences from the old rankings are listed and explained (MONSTER leak, tie-breaks)
- [x] Script is idempotent and runs against the new deployment only

## Verified

- `scripts/migrate-2025.ts` reads the production export (the D1 SQL dump of 2026-10-07), converts both 2025 contests into restorable backups (rulebook plus command log), compares the new rankings with the stored 2025 results, and can upload to the new deployment. The report is in `docs/migration/2025-report.md` (lifters by lot number, no names).
- Counts: 25 + 165 = 190 entries and 135 + 570 = 705 attempts with a weight (the two contests together). Verified from the report and from the uploaded contests through the snapshot endpoint (263 and 1159 commands).
- Comparison with the stored 2025 places: 154 + 25 Open places, age and weight class places compared. 75 differences: 63 are lifters with 0 points who got a place in the old app and are unranked now; 12 are ties on equal points that now follow the specified tie-break. Zero unexplained. All points agree to 0.01. The report says the same.
- Idempotent and new deployment only: the script uploads with `POST /api/contests/<2025 id>/restore`, so a second run replaces the same contest. I ran it twice against a local Worker: the catalog listed exactly the two contests with the same command counts. It refuses a host that does not contain "werewolf-v2", "localhost" or 127.x (tested with the old Pages host). I did not upload to any deployed Worker.
- Core change made for this ticket: result mode `sumDone` (sum of the lifts done, the 2025 rule) in the rulebook and the editor. Conversion test `scripts/migration/convert.test.ts` (ww-zchn): rows convert, pending attempts stay declared, team name variants merge, MONSTER-only lifters are outside Open, the 2025 total equals the hand-computed sum, converting twice gives the same file.
- Adjustment worth knowing: the 20 kg opening weights on a bare bar. The 2026 rule rejects a weight below bar + clamps, so the migrated rulebooks use clamps of 0 kg. I first tried allowing the bare bar in the core; the existing test of story ww-mq50 forbids it, so I reverted that and chose the rulebook workaround.
- `bun run gate:full` passes.

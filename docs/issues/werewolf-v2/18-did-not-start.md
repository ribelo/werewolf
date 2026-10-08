# 18: Did not start (DNS)

**Parent:** werewolf-v2 (../werewolf-v2.md) — story ww-9jq6

**What to build:** An entry can be marked "did not start" in one lift. One click on the desk marks the current lifter; the entry leaves the lifting order for that lift, has no result and no place there, shows DNS in the scoreboard, results tables, PDF, JPG and the federation CSV, and the mark can be undone. The 2025 migration turns three burned 20 kg attempts into DNS.

**Blocked by:** 08, 13, 15

**Status:** done

- [x] One click on the desk marks the current lifter DNS and the next attempt becomes current
- [x] The mark can be undone (Undo or an explicit false); it cannot be set after a verdict in that lift, and a DNS lift takes no verdict
- [x] No place in that lift; the other lifts of the entry are unaffected
- [x] DNS shown in tables and in the federation CSV (place text DNS, listed after the ranked entries, not numbered)
- [x] The 2025 migration converts all-attempts-20-kg-failed into DNS and reports it

## Verified

- Core tests (`did-not-start.test.ts`, ww-9jq6): the entry leaves the order for that lift only and the next attempt becomes current; Undo and `value: false` restore the order; a judged lifter cannot be marked and a DNS lift refuses a verdict; the lift ranking has no row for the entry and lists it as pending with reason "didNotStart"; the results table and the CSV show DNS after the ranked rows without a number; the other lift is untouched.
- Screen test (`MeetDay.test.tsx`): one click on "Nie wystartował (DNS)" moves the queue on; "Cofnij ostatnią zmianę" brings the lifter back. The scoreboard shows DNS across the attempt columns; the Lifts tab shows a DNS badge.
- Migration (`convert.test.ts`): three failed 20 kg attempts become one DNS mark and no verdict commands, converting twice gives the same file. Real data: 13 pairs in the second 2025 contest (as the owner counted).
- `bun run gate:full` passes.

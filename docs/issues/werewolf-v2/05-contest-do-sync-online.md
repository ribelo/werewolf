# 05: Contest Durable Object, WebSocket push, minimal online desk

**Parent:** werewolf-v2 (../werewolf-v2.md) — stories ww-bdzb, ww-uewf

**What to build:** Each contest is a Durable Object storing the rulebook and command log in its SQLite, numbering accepted commands and pushing them to connected devices over WebSocket. A minimal desk can create a contest from a preset rulebook, add an entry, declare a weight and record a verdict; a second window (read-only link) sees the change within ~200 ms.

**Blocked by:** 01, 02

**Status:** done

- [x] Commands validated by the shared core on the server; rejected commands return a reason
- [x] Late joiner receives a snapshot plus later commands
- [x] Read-only link token cannot submit commands
- [x] Workerd test with two clients

## Verified

- 2026-10-08, Europe/Warsaw: `bun run gate:full` passed. All 24 tests passed. `bun run build` passed.
- The public workerd test covers ordered push, core rejection, duplicate retry, late join, and read-only write denial. Each of the first three pushes took less than 200 ms.
- Two real Chrome windows used the local Worker at port 8791. The desk created a preset contest, added Ada Browser, declared 50 kg, and recorded a good lift. The read-only window showed all three commands and the same result. It had no forms.
- A MutationObserver measured 9 ms from the native entry-form submit event to the read-only render. This is one local observation, not a venue-network guarantee.
- The desk rejected 51 kg with a Polish load error. The accepted log stayed at one command. English labels and the good-lift result also rendered.
- After a real Worker restart, the public snapshot still contained all three commands and the final `SetVerdict`.
- UI evidence: [desk](../../verification/05-desk-pl.png) and [read-only screen](../../verification/05-viewer-pl.png). These are the minimal ticket-05 views, not the final stage or announcer views.
- Only the isolated local v2 Worker ran. No production resource or route changed.

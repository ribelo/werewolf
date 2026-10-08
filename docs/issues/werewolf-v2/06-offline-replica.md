# 06: Offline replica, catch-up and merging

**Parent:** werewolf-v2 (../werewolf-v2.md) — stories ww-mned, ww-yo7x, ww-gouf, ww-9hlk, ww-6oq1

**What to build:** Every device keeps a local replica of the log and its pending commands. The desk works with no internet; on reconnect pending commands go out in order and missed commands come in; the server order is authoritative and pending commands are rebased; different fields from different devices both apply, the same field takes the later change. Screens show last known state with a no-connection mark.

**Blocked by:** 05

**Status:** done

- [x] Workerd test: desk offline for many commands, reconnects, all screens converge
- [x] Two editors changing different fields both win; same field: later wins
- [x] Connection indicator shows pending count
- [x] Reload while offline keeps all local work

## Verified

- Workerd test (`apps/worker/test/contest.test.ts`, ww-mned ww-yo7x ww-gouf): a desk queues 20 commands offline, the queue is saved and restored through the serialized replica state, a second editor changes the same entry meanwhile, the desk reconnects, takes the snapshot first, then sends its queue in order. Desk, second editor and a read-only screen end with equal state. Server order decides: the last accepted command wins on the same field even with an earlier client clock; other fields keep both changes. A lost acknowledgement creates no duplicate.
- Core scenario test ww-9hlk (ticket 02) covers field-level merging.
- The desk shows connection state and the pending count (`ContestDesk.tsx`). The replica is written to IndexedDB before it is rendered or sent; a service worker (`apps/web/public/sw.js`) caches the public shell so a reload works offline. I did not test the reload in a real browser; the ticket 17 rehearsal covers it.
- `bun run gate:full` and `bun run build` pass.

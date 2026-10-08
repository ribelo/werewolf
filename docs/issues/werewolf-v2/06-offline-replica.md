# 06: Offline replica, catch-up and merging

**Parent:** werewolf-v2 (../werewolf-v2.md) — stories ww-mned, ww-yo7x, ww-gouf, ww-9hlk, ww-6oq1

**What to build:** Every device keeps a local replica of the log and its pending commands. The desk works with no internet; on reconnect pending commands go out in order and missed commands come in; the server order is authoritative and pending commands are rebased; different fields from different devices both apply, the same field takes the later change. Screens show last known state with a no-connection mark.

**Blocked by:** 05

**Status:** ready-for-agent

- [ ] Workerd test: desk offline for many commands, reconnects, all screens converge
- [ ] Two editors changing different fields both win; same field: later wins
- [ ] Connection indicator shows pending count
- [ ] Reload while offline keeps all local work

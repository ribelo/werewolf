# 05: Contest Durable Object, WebSocket push, minimal online desk

**Parent:** werewolf-v2 (../werewolf-v2.md) — stories ww-bdzb, ww-uewf

**What to build:** Each contest is a Durable Object storing the rulebook and command log in its SQLite, numbering accepted commands and pushing them to connected devices over WebSocket. A minimal desk can create a contest from a preset rulebook, add an entry, declare a weight and record a verdict; a second window (read-only link) sees the change within ~200 ms.

**Blocked by:** 01, 02

**Status:** ready-for-agent

- [ ] Commands validated by the shared core on the server; rejected commands return a reason
- [ ] Late joiner receives a snapshot plus later commands
- [ ] Read-only link token cannot submit commands
- [ ] Workerd test with two clients

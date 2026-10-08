# 14: Backups: download, restore, automatic to R2

**Parent:** werewolf-v2 (../werewolf-v2.md) — stories ww-6ft3, ww-edqp

**What to build:** Download a contest (rulebook + command log) as one file and restore it into a new or the same contest; the Durable Object writes periodic snapshots to R2 during the meet.

**Blocked by:** 05

**Status:** ready-for-agent

- [ ] Restore reproduces identical rankings
- [ ] Automatic snapshot at least every 5 minutes while commands arrive
- [ ] Restore cannot happen offline or without the organizer password

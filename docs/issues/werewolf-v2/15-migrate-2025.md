# 15: Migrate the 2025 contests

**Parent:** werewolf-v2 (../werewolf-v2.md) — stories ww-zchn

**What to build:** A one-off script converts the 2025 production export into rulebooks + command logs in new contest Durable Objects, and a report compares the new rankings with the old app's results.

**Blocked by:** 04, 05

**Status:** ready-for-agent

- [ ] Both 2025 contests load with 190 entries and 705 attempts
- [ ] Differences from the old rankings are listed and explained (MONSTER leak, tie-breaks)
- [ ] Script is idempotent and runs against the new deployment only

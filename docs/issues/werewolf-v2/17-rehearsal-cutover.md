# 17: Rehearsal on real devices and cut-over

**Parent:** werewolf-v2 (../werewolf-v2.md) — stories ww-4g2a, ww-mned, ww-bjq1

**What to build:** Run a mock contest with the desk, announcer, TV and a phone on one Wi-Fi, cutting the internet several times; fix findings; then point the organizer to the new app and retire the old one.

**Blocked by:** 02–16

**Status:** prepared (needs the owner, real devices and the venue Wi-Fi; nothing has been switched)

- [ ] Mock meet completed with internet cuts and no lost or reordered results
- [ ] Owner signs off
- [ ] Old app retired only after sign-off

## Prepared (not executed)

- The new app is deployed beside the old one at https://werewolf-v2.r-krzywaznia-2c4.workers.dev and holds both 2025 contests (migrated, ticket 15). For the rehearsal create a copy with the **Kopia** tab ("create a new contest from the backup") so that the 2025 contest stays unchanged. Use the organizer password from the `.env` file.
- Rehearsal plan: [docs/rehearsal.md](../../rehearsal.md). It lists the devices, the steps, how to cut the internet, what to write down and the sign-off questions.
- What I could test without the devices (all on one machine, so none of it replaces the rehearsal): the full flight with the keyboard only (ticket 08), a desk and two screens through a killed Worker (ticket 07, 46–61 ms over the peer channel), reload while offline (ticket 06), restore and backups (ticket 14).
- Cut-over is not done. The steps are in the plan: the old Worker, D1 database and Pages project are left alone until the owner signs off.

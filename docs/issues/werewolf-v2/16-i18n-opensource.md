# 16: Polish and English complete, open-source deployment guide

**Parent:** werewolf-v2 (../werewolf-v2.md) — stories ww-dh53, ww-029g

**What to build:** Every screen fully translated in Polish and English with a catalog completeness test; README and deployment guide let another organizer deploy their own copy with Alchemy and a Cloudflare login; license chosen by the owner.

**Blocked by:** 12, 13

**Status:** in-progress (only the clean-account test is open; it needs a second Cloudflare account, during the rehearsal of ticket 17)

- [x] Catalog test: identical key sets, every used key present
- [ ] A clean Cloudflare account can deploy following the guide (needs a second account; to be tried in ticket 17)

## Verified

- Catalog test (`apps/web/src/i18n.test.tsx`, ww-dh53): Polish and English have identical key sets and no empty text; every message key written in a screen file exists in both catalogs; the keys built at run time (warnings, import problems, import fields, wizard steps, presets) exist for every value the code can produce. I also moved the last hard-coded texts (accessible names of the barbell and the QR code, the sex letter on the scoreboard) into the catalogs.
- Documents: `README.md`, `docs/deployment.md` (what is created, secrets, login, plan, deploy, first meet, 2025 migration, removal, problems) and `docs/user-guide.md` (meet-day flow). The commands are those I used.
- Deployment check (ww-029g): I ran `bun run plan` and `bun run deploy` from this checkout with the existing `werewolf` profile. The new stack WerewolfV2 now runs at https://werewolf-v2.r-krzywaznia-2c4.workers.dev (Worker, two Durable Object classes, R2 bucket Backups). The old stack was not touched. The first request after the first deploy failed once and worked on retry; the guide says so. A browser run against that address showed the migrated 2025 contest: login, desk with the full log in 0.9 s, results and scoreboard (165 rows).
- NOT verified: the criterion "a clean Cloudflare account can deploy following the guide". I have only this account, and its profile and stack already existed, so steps 2 and 3 of the guide were not run from nothing. Someone with a second account must follow the guide once.
- License: the owner chose MIT (2026-10-08). `LICENSE` has MIT, 2026, Rafał Krzyważnia (the spelling of the git author name). The README points to it.

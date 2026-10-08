# 01: Scaffold: workspace, one Worker, Alchemy, organizer login

**Parent:** werewolf-v2 (../werewolf-v2.md) — stories ww-029g, ww-n7wy, ww-4g2a

**What to build:** A fresh Bun workspace (Effect server, React + Effect Atom client, shared contest core package) replaces the old code in this worktree. An Alchemy stack deploys one Worker serving the API and the static app at a NEW URL beside the old app, using the Cloudflare OAuth profile. The organizer logs in with one password; everything else is read-only. One check gate (typecheck, lint, tests) runs locally and in CI.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Old SvelteKit/Hono/legacy Tauri code is removed from this branch (kept in git history)
- [ ] `bun run check` runs typecheck, lint and all tests and passes
- [ ] `bun run deploy` deploys to a new Worker URL; the old production app is untouched
- [ ] Login with the organizer password sets a session; protected endpoints refuse without it
- [ ] Polish and English message catalogs exist with the login screen translated

# 01: Scaffold: workspace, one Worker, Alchemy, organizer login

**Parent:** werewolf-v2 (../werewolf-v2.md) — stories ww-029g, ww-n7wy, ww-4g2a

**What to build:** A fresh Bun workspace (Effect server, React + Effect Atom client, shared contest core package) replaces the old code in this worktree. An Alchemy stack deploys one Worker serving the API and the static app at a NEW URL beside the old app, using the Cloudflare OAuth profile. The organizer logs in with one password; everything else is read-only. One check gate (typecheck, lint, tests) runs locally and in CI.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] Old SvelteKit/Hono/legacy Tauri code is removed from this branch (kept in git history)
- [x] `bun run check` runs typecheck, lint and all tests and passes
- [x] `bun run deploy` deploys to a new Worker URL; the old production app is untouched
- [x] Login with the organizer password sets a session; protected endpoints refuse without it
- [x] Polish and English message catalogs exist with the login screen translated

## Verified

- 2026-10-08: `bun run gate:full` passed. Native TypeScript checks app code, tests and configuration. Lint reports no warnings. The workerd HTTP test passed. Format and Knip checks passed.
- The test `ww-029g ww-n7wy` checks wrong-password refusal, session cookies, protected requests, tampering, cross-origin writes, malformed input and logout.
- Alchemy planned one new Worker, `werewolf-v2`, and two secret bindings in stack `WerewolfV2`. Deployment passed at https://werewolf-v2.r-krzywaznia-2c4.workers.dev. No old Worker, Pages or D1 resource appears in the plan.
- Managed Chrome showed the Polish login screen on the new URL. The organizer password opened the empty contest list. Local Chrome also showed the English login, password label, contest list and logout control. Unauthenticated requests to the deployed contest API returned 401.
- Removed legacy code from this branch only. Git history keeps the previous implementation.

# Werewolf Cloud FAQ

_Last updated: 2025-09-20_

## General

### Why move from the Tauri desktop app to Cloudflare?
The desktop version served us well, but the cloud rewrite gives us easier multi-screen sharing, real-time sync between roles, and managed infrastructure without sacrificing offline resilience. We still support local development for meet-day reliability.

### Is the desktop app still available?
Yes. The legacy Tauri project lives in `src/` and `src-tauri/`. It is no longer the primary target, but you can build it using the legacy instructions if you need a fully offline fallback.

### What browsers are supported?
Chrome/Chromium, Firefox, and Safari on desktop. Tablet support is in progress; mobile devices should use the table display view for now.

## Accounts & Security

### Do organizers need individual logins?
Not yet. The initial release assumes a trusted network with shared access. The roadmap includes optional Cloudflare Access or token-based auth for admin routes.

### Where should I store the Cloudflare API token?
Keep it in the `.env` file for local development only. In production, configure secrets via `wrangler secret put` and Cloudflare Pages environment variables. Never commit the token to git.

### What permissions does the API token require?
Workers KV Storage (Edit), Workers D1 (Edit), Workers Scripts (Edit), Workers Tail (Read), Cloudflare Pages (Edit), Workers R2 (Edit). The provided token is scoped to the Werewolf project only.

## Data & Reliability

### How are contests stored?
Contests, competitors, registrations, attempts, and results live in Cloudflare D1 (SQLite backend). Reference data (age/weight classes, settings) is seeded via migrations.

### What if D1 goes down during a meet?
Wrangler’s local dev stores data in `.wrangler/state`. In production, Cloudflare D1 provides high availability. The roadmap includes an offline mutation queue so the desk can continue accepting attempts during brief outages.

### Is KV used today?
KV currently stores contest snapshots for display preloading. Diagnostics UI is under construction (see `docs/post-migration-action-plan.md`).

## Running a Meet

### How fast do displays update?
Under normal conditions the announcer and big-screen update within ~1 second via WebSockets. If the WS connection drops, the UI switches to polling every 2 seconds until the socket resumes.

### Can I run multiple contests at once?
The current Proof-of-Concept assumes one active contest per deployment. Multi-flight and multi-platform support is on the roadmap.

### How do I change the language?
Go to **Ustawienia** → **Preferencje interfejsu**, choose Polish or English. The selection is persisted in the settings table and takes effect immediately after the next render.

## Development

### How do I run the app locally?
1. `cd werewolf-cloud && bun run dev` to start the Worker.
2. `cd werewolf-cloud/apps/web && PUBLIC_API_BASE=http://127.0.0.1:8787 bun run dev` for the frontend.
3. Visit `http://localhost:5173` (or the port Vite chooses). Details are in the README.

### The console says `Cannot apply new_classes migration to existing class ContestRoom`. What now?
Use `wrangler.dev.toml` for local development or clear the `.wrangler/state` directory before re-running `bun run dev`. We also provide a `bun run dev:clean` script to reset local bindings.

### Why do I see “connection lost” toasts locally?
Durable Objects aren’t fully emulated in the combined Worker + Pages dev setup. The UI falls back to polling and recovers automatically. In production, the WebSocket stays connected.

## Future Enhancements

### When will results export return?
It’s tracked in `REQUIREMENTS_AND_ROADMAP.md` and the post-migration plan. The target is to ship CSV and JSON exports alongside plate-set presets before the first public beta.

### Will there be authentication and audit trails?
Yes, after the parity work is complete. The planned approach uses Cloudflare Access or signed tokens for desk operators, plus audit logging in D1.

### How can I contribute?
Open an issue describing the bug or enhancement, follow the coding standards in the README, and submit a PR. We welcome help tightening tests, polishing UX, and expanding documentation.


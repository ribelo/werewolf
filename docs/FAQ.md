# Werewolf Cloud FAQ

Answers reflect the code in `werewolf-cloud/`. Architecture: [architecture.md](../werewolf-cloud/docs/architecture.md);
routes: [api-endpoints.md](../werewolf-cloud/docs/api-endpoints.md).

## General

### Why move from the Tauri desktop app to Cloudflare?
The cloud app gives multiple screens (desk, announcer, big screen) the same live data over WebSockets, works
from any browser, and keeps the contest in D1 so a lost laptop does not lose the meet.

### Is the desktop app still available?
Yes, the legacy Tauri project lives in `src/` and `src-tauri/`. It is frozen reference material and is no
longer developed; new work happens in `werewolf-cloud/`.

### What browsers are supported?
The organizer desk targets desktop Chrome/Chromium, Firefox and Safari. The display routes
(`/display/current`, `/display/table`, `/results/[id]`) are simple pages that also render on tablets.

## Accounts & security

### Do organizers have logins?
Yes. There is one organizer account per deployment. `POST /auth/login` takes the password from the
`ADMIN_PASSWORD` secret, sets an HttpOnly `werewolf_session` cookie and stores the session in KV for 14
days. `POST /auth/logout` clears it and `GET /auth/session` probes it. All GET routes, including the public
displays, stay open; every write needs the session. Multi-user accounts and audit trails are out of P0 scope.

### Where is the Cloudflare API token stored?
In `werewolf-cloud/.dev.vars` locally (git-ignored, template in `.dev.vars.example`) and as Wrangler/Pages
secrets in production (`wrangler secret put`). Never commit it and never paste it into issues or logs.

### What permissions does the deploy token need?
Workers Scripts, D1, Workers KV and Cloudflare Pages edit permissions for this account, plus Workers Tail for
reading live logs. See `werewolf-cloud/docs/cloudflare-environments.md` for the provisioned ids.

## Data & reliability

### How are contests stored?
Contests, competitors, registrations, attempts, results, plate sets, categories, settings and the coefficient
tables live in Cloudflare D1. Reference data is seeded by the migrations in `werewolf-cloud/migrations/`.

### Is KV used today?
Yes: session records, backup metadata, display filter sync payloads and short-lived rankings/public-bundle
caches. KV does **not** hold live contest state or Durable Object snapshots.

### What if the connection drops during a meet?
The desk keeps working: mutating calls that cannot reach the Worker are queued in IndexedDB and replayed when
the connection returns, while displays keep rendering their last payload and poll every 2 seconds. On
reconnect the client fetches the latest state over REST; there is no event replay.

### What if D1 goes down during a meet?
Local development persists state in `.wrangler/state`. In production D1 is a managed service; a D1 outage is
still a hard stop for writes, which is why the offline queue exists and why backups matter.

## Running a meet

### How fast do displays update?
While the WebSocket is connected, updates are sub-second. When the socket drops the client polls
`/contests/:id/attempts/current` and `/contests/:id/attempts` every 2 seconds until it reconnects.

### Can I run multiple contests at once?
No. The current version assumes one active contest per deployment, although each contest has its own
Durable Object room. Multi-contest routing is post-P0 work.

### How do I change the language?
Open **Ustawienia** and switch the language. The choice is saved through `PUT /settings/language` and kept
in `localStorage`; Polish is the default.

## Development

### How do I run the app locally?
1. `cd werewolf-cloud && bun install && bun run dev` (Worker API on `http://127.0.0.1:8787`).
2. `cd werewolf-cloud/apps/web && PUBLIC_API_BASE=http://127.0.0.1:8787 bun run dev` (UI on `http://127.0.0.1:5173`).
3. Sign in with the `ADMIN_PASSWORD` from `werewolf-cloud/.dev.vars`.

### What does `Cannot apply new_classes migration to existing class ContestRoom` mean?
The local Durable Object state is older than the current Worker config. Stop the dev server, delete
`werewolf-cloud/.wrangler/state` and run `bun run dev` again.

### Why do I see "connection lost" toasts locally?
Durable Objects behave differently under local Wrangler than in production. The UI falls back to polling and
recovers on its own; production keeps the WebSocket.

## Future

### Can I export results?
Yes: `POST /contests/:id/results/export` returns CSV or JSON. Federation-specific templates and PDF
exports are not built.

### What about authentication and audit trails?
Organizer login and sessions exist (see above). Audit logging in D1, multi-user accounts and multi-tenant
deployments are post-P0; the tracked list is in `werewolf-cloud/docs/BACKLOG.md`.

### How can I contribute?
Start with [CONTRIBUTING.md](../CONTRIBUTING.md). Bugs and enhancements go through GitHub issues; follow the
checks and migration rules there.

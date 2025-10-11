# Werewolf Cloud

Cloud-native powerlifting contest management designed for meet directors who need a reliable, real-time system that still works when the gym WiFi flakes out. The Werewolf rewrite moves the legacy Tauri desktop experience to a modern Cloudflare stack while preserving the workflows that kept our meets running for years.

> **Audience:** Powerlifting organizers and volunteers running the scoring desk, announcer table, and public display screens.

---

## Feature Highlights

- **Contest Control Centre** – Create contests, register lifters, manage flights, and drive the live desk from one responsive UI.
- **Attempt Desk Tools** – Edit attempts in-place, mark judges' calls, queue the next lift, and broadcast the current lifter to displays within 1–2 seconds.
- **Dual Display Surfaces** – Dedicated announcer table view and big-screen scoreboard, each with QR sharing for audiences.
- **Resilient Updates** – WebSocket delivery with automatic polling fallback; mutation queue design ready for offline-first enhancements.
- **Cloudflare Native** – Worker API (Hono), D1 relational database, KV metadata, Durable Object room per contest, deployed via Wrangler/Pages.
- **Type-Safe Everything** – Shared TypeScript contracts, Zod validation, Vitest/Playwright coverage, automated CamelCase envelopes.
- **Polish/English i18n** – All UI strings and status badges localised, with operator language preference stored in settings.

---

## Repository Layout

```
werewolf/
├── werewolf-cloud/              # Cloud implementation (primary focus)
│   ├── apps/
│   │   ├── api/                 # Cloudflare Worker (Hono)
│   │   └── web/                 # SvelteKit frontend
│   ├── docs/                    # Cloud-specific documentation (kept in root docs/)
│   └── migrations/              # D1 SQL migrations
├── docs/                        # Shared documentation
├── src/, src-tauri/             # Legacy Tauri desktop implementation (kept for reference)
└── ...
```

The legacy desktop app is still present under `src/` and `src-tauri/` for historical comparison; all new development targets `werewolf-cloud/`.

---

## Local Development

### 1. Prerequisites
- Bun ≥ 1.2
- Node ≥ 20 (for tooling compatibility)
- Wrangler (provided via Nix flake or `bunx`)
- SQLite CLI (optional, useful for inspecting local D1 state)

### 2. Environment Variables
Create `werewolf-cloud/.env` with the credentials you received:
```
CLOUDFLARE_ACCOUNT_ID=2c42f4960f9c28a9235cac01483bd626
CLOUDFLARE_API_TOKEN=MeKJV3fDOswsV_JB-70ZFjE7YobOich5nLgydGoO
ENV=development
PUBLIC_API_BASE=http://127.0.0.1:8787
```
`PUBLIC_API_BASE` is only required when running the frontend separately.

### 3. Start the Worker (API)
```bash
cd werewolf-cloud
bun install
bun run dev             # wraps wrangler dev with local D1/KV bindings
```
This spins up the Worker at `http://127.0.0.1:8787`, applies migrations to `.wrangler/state`, and exposes Durable Object + KV emulation.

### 4. Start the Frontend
```bash
cd werewolf-cloud/apps/web
bun install
PUBLIC_API_BASE=http://127.0.0.1:8787 bun run dev -- --host 0.0.0.0 --port 5173
```
Vite may move to the next free port (e.g. 5174) if 5173 is taken. The frontend automatically connects to the running Worker, falls back to polling when Durable Objects are unavailable locally, and writes contest cache snapshots to `localStorage`.

### 5. Run Checks and Tests
```bash
# API type check & tests
cd werewolf-cloud/apps/api
bun run typecheck
bun run test

# Frontend type check & tests
cd werewolf-cloud/apps/web
bun run check
bun run test:run

# Integration smoke (root)
cd werewolf-cloud
bun run test
```

---

## Deployment Workflow

1. **Configure bindings** in `wrangler.toml` (`werewolf-d1`, `werewolf-d1-dev`, `werewolf-kv`, `werewolf-kv-dev`, `werewolf-contest-room`).
2. **Login & publish**
   ```bash
   bunx wrangler@latest login
   bunx wrangler@latest deploy --env production --config wrangler.toml
   ```
3. **Promote frontend** via Cloudflare Pages (v2 build: `bun install && bun run build`).
4. **Verify** using `scripts/curl-api-test.sh` and open the announcer/big-screen URLs generated from the Worker host.

---

## Documentation
- [Architecture](docs/ARCHITECTURE.md) – detailed system diagram, component responsibilities, deployment topology.
- [User Guide](docs/USER_GUIDE.md) – running a meet from setup to teardown.
- [FAQ](docs/FAQ.md) – common questions from operators and tech volunteers.
- [Post-Migration Action Plan](docs/post-migration-action-plan.md) – remaining work before release.
- [Requirements & Roadmap](REQUIREMENTS_AND_ROADMAP.md) – long-term scope decisions.

The legacy Tauri instructions remain in `CLAUDE.md` for historical reference; the new Cloud-focused workflow lives here.

---

## Support & Feedback
- **Issues** – GitHub Issues for bugs or feature requests.
- **Questions** – GitHub Discussions or direct contact with the Werewolf maintainers.
- **Polish Language** – All docs available in Polish on request; the app ships with Polish as the default locale.

Werewolf Cloud keeps the spirit of the original desktop app—fast, opinionated, and built for real gyms—while embracing the resilience and reach of the cloud. Contributions are welcome; just keep one goal in mind: help directors run a flawless meet.

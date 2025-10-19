# Werewolf Cloud

Cloudflare-native rewrite of the Werewolf powerlifting contest manager. This workspace houses the new TypeScript stack that targets Workers + Pages with Hono, D1, and optional KV usage. The desktop Tauri app remains in `../`.

## Structure

```
werewolf-cloud/
├── apps/            # Application entry points (API worker, UI)
├── packages/        # Shared libraries (domain logic, utilities)
├── config/          # Shared configuration (lint/typecheck)
├── migrations/      # D1 SQL migrations
├── docs/            # Project documentation (parity matrix, env reference)
├── wrangler.toml    # Cloudflare Pages configuration (SSR bundle)
└── wrangler.worker.toml    # Cloudflare Worker configuration (API, migrations)
```

## Getting Started

```bash
# Enter the Cloud dev shell (provides Node 20, Bun, Wrangler)
nix develop ../#cloud

# Install dependencies
bun install

# Start Workers in local dev mode
bun run dev
```

## Migration Checklist
- [ ] Port domain logic from Rust into `packages/domain`
- [ ] Implement Hono API in `apps/api`
- [ ] Rebuild organizer & display UI in `apps/web`
- [ ] Set up D1 migrations and data import scripts
- [ ] Deliver backup/export story on Cloudflare

## Cloudflare Resources

Provisioned IDs and deployment instructions live in `docs/cloudflare-environments.md`. Update that reference whenever new environments or bindings are added.
```

# Werewolf v2

A rulebook-driven strength meet app. This rewrite runs beside the 2025 app.

## Development

Use Bun 1.4 or later.

```sh
bun install
bun run dev
```

The Worker serves the API and React app at the address printed by Wrangler.

```sh
bun run check
```

This command checks lint, types, and tests. Worker tests run locally in workerd.

## Deployment

The Alchemy stack is `WerewolfV2`. It does not adopt resources from the old `Werewolf` stack.

Configure `ORGANIZER_PASSWORD` and `SESSION_SECRET` in an ignored `.env` file. Use a random session secret. Never commit secrets.

```sh
bun run cloudflare-login
bun run plan
bun run deploy
```

The existing `werewolf` OAuth profile can be reused. Deployment prints the new Worker URL.

## Plan

See [the specification](docs/issues/werewolf-v2.md) and [the ticket index](docs/issues/werewolf-v2/README.md).

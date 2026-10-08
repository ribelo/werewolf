# Werewolf v2

Werewolf runs strength meets: entries, lifting order, judging, live screens and results. This is the second version. It is open source and each organizer deploys a copy.

- **Rulebook as data.** A contest is a JSON rulebook: lifts, divisions, classes and classifications. A new lift or a new ranking is configuration, not code.
- **Works offline.** The desk keeps working when the internet drops. Devices on the same Wi-Fi keep each other up to date (WebRTC). Everything syncs when the connection returns.
- **Screens.** Desk, stage screen with barbell, announcer view, scoreboard with remote filter and QR, public live results, exports (CSV, PDF, JPG), backups.
- **Languages.** Polish and English.
- **Stack.** Bun, Effect, React with Effect Atom, Tailwind. One Cloudflare Worker with one Durable Object per contest. Deployed with Alchemy v2.

## Use it

- [Deployment guide](docs/deployment.md) — put your own copy on Cloudflare.
- [User guide](docs/user-guide.md) — run a meet.
- [Specification](docs/issues/werewolf-v2.md), [ticket index](docs/issues/werewolf-v2/README.md), [glossary](GLOSSARY.md), [decisions](docs/adr).

## Develop

Use Bun 1.4 or later.

```sh
bun install
bun run dev      # builds the web app and starts the Worker locally with Wrangler
bun run check    # lint, types and all tests (the tests run the Worker in workerd)
bun run gate:full  # check + format + unused code
```

`packages/core` holds all contest rules and has no I/O. `packages/sync` holds the sync protocol and the device replica. `apps/worker` is the Worker and the Durable Objects. `apps/web` is the React app. `scripts/` holds one-off tools, such as the 2025 migration.

Commits go through the gate in `.githooks`. Run `git config core.hooksPath .githooks` once.

## License

[MIT](LICENSE). The bundled font Noto Sans is under the SIL Open Font License.

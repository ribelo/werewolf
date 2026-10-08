# Deploy your own copy

You need a Cloudflare account and a computer with Bun 1.4 or later. The deployment creates these resources in your account:

| Resource | Used for |
|---|---|
| Worker `werewolf-v2` | API and web app |
| Durable Object classes `ContestDO`, `ContestCatalogDO` | One object per contest, and the contest list |
| R2 bucket (Alchemy name `Backups`) | Automatic backups every 5 minutes during a meet |

All of them fit in the Cloudflare free plans for a meet of 200 entries. R2 needs a payment method on the account before you can use it; check the current Cloudflare pricing page.

## 1. Get the code

```sh
git clone <repository-url> werewolf
cd werewolf
bun install
git config core.hooksPath .githooks
```

## 2. Set the two secrets

Create a file named `.env` in the project folder. Git ignores it. Never commit it.

```sh
ORGANIZER_PASSWORD=choose-a-long-password
SESSION_SECRET=$(openssl rand -hex 32)
```

Write the real value of `SESSION_SECRET` in the file, not the command. The organizer password is the only login. Everybody else uses read-only links.

## 3. Log in to Cloudflare

```sh
bun run cloudflare-login
```

A browser window opens. Allow Alchemy to use your account. No API token is needed. The login is saved in a profile named `werewolf` in `~/.alchemy-werewolf`. To use other names, set `ALCHEMY_PROFILE` and `ALCHEMY_HOME` before every command.

## 4. Check, then deploy

```sh
bun run plan      # shows what will be created; changes nothing
bun run deploy    # runs the checks, builds the app, deploys
```

The last lines print the address of your Worker, for example `https://werewolf-v2.<your-subdomain>.workers.dev`. Open it and log in with the organizer password.

Deploying again updates the same resources. The data of your contests stays.

## 5. First meet

1. Log in. Choose **Nowe zawody** (new contest) and follow the wizard. Pick a preset rulebook or load your own JSON.
2. Add entries by hand or import a CSV or Excel file.
3. On the desk, open the **Stół** tab. The links at the top open the stage screen, the announcer view, the scoreboard and the public results. Each link works without a password. Show a QR code on the scoreboard from the desk.
4. Download a backup (tab **Kopia**) before the meet.

## Move data from the 2025 app

The 2025 export is a SQL file from the old D1 database. Run `bun scripts/migrate-2025.ts --dump <file> --target https://<your-worker> --password-env ORGANIZER_PASSWORD`. The script refuses to upload to an address that does not contain `werewolf-v2`, `localhost` or `127.`. Running it again replaces the same contests. See `docs/migration/2025-report.md` for what it changes.

## Remove everything

```sh
ALCHEMY_HOME=~/.alchemy-werewolf ALCHEMY_PROFILE=werewolf bunx alchemy destroy
```

This deletes the Worker, the contests and the R2 bucket. Download your backups first.

## Problems

- *An error on the very first request after the first deployment.* Cloudflare is still preparing the Durable Objects. Wait a few seconds and try again.
- *"Unauthorized" after login.* The browser blocks cookies for the address. Use the HTTPS address.
- *The deployment fails on R2.* Enable R2 in the Cloudflare dashboard, then run `bun run deploy` again.
- *Peer sync between devices does not work.* The Wi-Fi blocks traffic between devices (client isolation). Turn it off on the router. Devices still sync through the Worker when the internet works.

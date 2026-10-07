# GitHub Actions

| Workflow | Trigger | Purpose |
| --- | --- | --- |
| build.yml — **CI** | push to master, main, develop; PRs to master, main; manual | Cloud workspace checks (werewolf-cloud/) |
| desktop.yml — **Desktop (legacy Tauri)** | manual (workflow_dispatch) | Compile check and Rust tests for the frozen desktop app |
| release.yml — **Release (legacy Tauri)** | manual (workflow_dispatch, needs the name of an existing tag) | Builds desktop installers and publishes a GitHub Release |

werewolf-cloud/ is the product and ships through Wrangler/Pages (see werewolf-cloud/docs/deployment.md), not through GitHub Releases. That is why the desktop workflows are manual only: nothing in them runs on a push or on a tag.

---

## Default CI (build.yml)

Runs on every push to the main branches and on pull requests.

**Job cloud** — `cd werewolf-cloud && bun install --frozen-lockfile && bun run check`. That one command is the whole check: typecheck (`tsc --build`), oxlint, the root Vitest suites (packages/domain, apps/api and scripts) and, inside apps/web, `svelte-kit sync` + `svelte-check` followed by the jsdom Vitest suite. The API integration suite takes ~100s. There is no separate web job.

The job uses Bun 1.2.x. No secrets, tokens or certificates are needed.

---

## Legacy desktop workflows (manual)

The Tauri app under src/ and src-tauri/ is frozen reference code. Use these workflows only when you deliberately need to verify or ship it.

### desktop.yml

The steps the old CI ran: frontend build, `cargo build --release`, `cargo test`, `cargo clippy -- -D warnings`, `cargo fmt --all -- --check`, all on Linux.

### release.yml

Manual dispatch with one input: the **existing** tag to release (for example v0.2.0).

```bash
# 1. Push the tag first - the workflow refuses tags that do not exist
git tag v0.2.0
git push origin v0.2.0

# 2. Actions tab -> Release (legacy Tauri desktop, manual) -> Run workflow -> tag: v0.2.0
```

It creates a GitHub Release with an auto-generated changelog and uploads the platform installers:

- werewolf_0.2.0_x64.msi — Windows installer
- werewolf_0.2.0_x64.dmg — macOS Intel
- werewolf_0.2.0_aarch64.dmg — macOS Apple Silicon
- werewolf_0.2.0_amd64.deb — Linux package
- werewolf_0.2.0_amd64.AppImage — Linux universal

Installers are unsigned, so users see the usual SmartScreen (Windows) and Gatekeeper (macOS) first-run warnings; Linux has none. GITHUB_TOKEN is provided automatically - there is nothing to configure.

---

## Running workflows locally with act

Optional, and Docker is required.

```bash
# Cloud CI
act push

# Legacy desktop build and checks
act workflow_dispatch -W .github/workflows/desktop.yml

# Legacy desktop release (fixture supplies inputs.tag = v0.1.0)
act workflow_dispatch -W .github/workflows/release.yml -e events/release.json
```

.actrc holds the runner images and flags; .github/events/ holds the event payloads (push.json for `act push`, release.json for workflow_dispatch).

What works locally: compilation, tests and type checks. What does not: cross-platform builds, artifact uploads and release publishing - those need GitHub runners.

---

## Making changes

Key files: .github/workflows/build.yml (CI), .github/workflows/desktop.yml and .github/workflows/release.yml (manual legacy runs), and werewolf-cloud/config/vitest.config.ts for test discovery.

Before pushing: check the YAML parses, test with act where practical, and keep this file in step with the workflows. A syntax error here blocks every run of that workflow.

# Werewolf v2

Work in this worktree on branch `v2`. Do not change the old app or its production resources.

Before implementation, read `docs/issues/werewolf-v2.md`, all tickets in `docs/issues/werewolf-v2/`, `GLOSSARY.md`, and `docs/adr/0001`–`0004`. Complete tickets in dependency order. Do not change the agreed specification.

Use Bun, Effect 4, React, Effect Atom, and Alchemy v2. `apps/worker` serves the API and static app. `apps/web` contains the client. `packages/core` owns deterministic contest rules.

Run `bun run check` before each commit. Tests follow the three seams in the specification. Put story IDs in test names. Mark verified tickets done, record evidence, and commit each ticket. Do not push.

The default Git hooks are empty. For commits in this worktree, run `git -c core.hooksPath=.githooks commit`. This runs the v2 pre-commit gate without changing the shared Git configuration. Never bypass the gate.

Deploy only stack `WerewolfV2` through profile `werewolf` and `ALCHEMY_HOME=$HOME/.alchemy-werewolf`. Never adopt old resources. Kids rules remain a configuration placeholder until the owner confirms them.

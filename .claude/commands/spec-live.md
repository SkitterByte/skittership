---
description: Put one spec live on the already-running dev server — bare takes the spec you are on, `<spec>` takes that one, `main` hands the instance back
argument-hint: "[<spec> | main | status | release | abort]"
allowed-tools: Bash(pnpm exec skitterspec spec-env live:*)
disable-model-invocation: true
---
!`pnpm exec skitterspec spec-env live $ARGUMENTS`

Relay the engine output above verbatim. Add nothing and run nothing else.

The engine enforces every refusal itself and prints why — a hotfix, a stateful
spec (`Stack: worktree + docker`), a branch touching migrations, a dirty tree, a
rebase conflict, or another spec already holding the instance. Do not re-explain
or work around any of them.

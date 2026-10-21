---
description: Expose one spec's dev servers on the canonical localhost ports — bare uses the spec you are on, `main` hands them back
argument-hint: "[<spec> | main]"
allowed-tools: Bash(pnpm exec skitterspec spec-env connect:*)
disable-model-invocation: true
---
!`pnpm exec skitterspec spec-env connect $ARGUMENTS`

Relay the engine output above verbatim. Add nothing and run nothing else.

Only if it reports a **canonical port is in use**: say that the main checkout's
dev server still holds that port, and that stopping it and re-running is the fix
(the proxy cannot share a port main is bound to).

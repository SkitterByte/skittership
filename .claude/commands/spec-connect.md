---
description: Expose one spec's dev servers on the canonical localhost ports (or `main` to hand them back)
argument-hint: "[spec|main]"
allowed-tools: Bash(npx skitterspec spec-env connect:*)
disable-model-invocation: true
---
!`npx skitterspec spec-env connect $ARGUMENTS`

Relay the engine output above verbatim. Add nothing and run nothing else.

Only if it reports a **canonical port is in use**: say that the main checkout's
dev server still holds that port, and that stopping it and re-running is the fix
(the proxy cannot share a port main is bound to).

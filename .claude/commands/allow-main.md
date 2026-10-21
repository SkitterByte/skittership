---
description: Allow writes on the base branch for this session — bare allows it with no reason, a reason records why, `off` clears it
argument-hint: "[<reason> | off]"
allowed-tools: Bash(pnpm exec skitterspec spec-env main allow:*)
disable-model-invocation: true
---
!`pnpm exec skitterspec spec-env main allow $ARGUMENTS`

Relay the engine output above verbatim. Add nothing and run nothing else.

**Only you can run this, and that is the whole guard.** The main-guard hook
refuses an `Edit` or a `Write` in the primary checkout while it sits on the base
branch, and it names two exits: move the work with `/no-spec` or `/spec-start`,
or have you lift the guard. Claude can take the first exit on its own and can
never take the second — a guard the model can lift is decoration, which is the
same line `/spec-reviewed` draws.

**Give it a reason.** `/allow-main fixing the lockfile by hand` records why; bare
records `none given`. The reason is the part a reviewer can argue with, exactly
as with a `Gating:` header — and it is what you will read when you wonder later
why the base branch has an uncommitted file on it.

**It lapses with the session where it can.** The allow is recorded against this
session, so it ends when the session does. Where the harness exposes no session
id it degrades to a repo-wide allow that outlives the session and is cleared only
by `/allow-main off`; the engine says which kind you got, so do not read a bare
"allowed" as temporary.

**It is machine-local and gitignored.** Unlike `/spec-remote-review`, this writes
nothing anyone else pulls: it is your decision about your checkout, not the
project's policy. The project-wide switch is `guards.mainIsLandingZone` in
`specs/.core/env.config.json`, and turning that off is a different, committed
decision.

---
description: Move on from a phase without a verdict, with the reason on the record — clears the review gate
argument-hint: "\"<reason>\""
allowed-tools: Bash(pnpm exec skitterspec spec-env review skip:*)
disable-model-invocation: true
---
!`pnpm exec skitterspec spec-env review skip "$ARGUMENTS"`

Relay the engine output above verbatim. Add nothing and run nothing else.

**It refuses with no reason, and that refusal is the feature.** A skip with no
reason is indistinguishable from nobody having looked — where
`none: additive, nothing to revert` is a decision a reviewer can argue with. If
the engine asked for a reason, relay that and stop; do not supply one on the
operator's behalf.

**It is one of exactly two exits**, and the other is a committing verdict on the
page. Nothing else discharges a phase's obligation — not a mid-run `Continue`,
not an action, not a render.

**Only you can run it.** Like `/allow-main`, this lifts a guard aimed at Claude,
so Claude must not be able to lift it. `/spec-connect` and `/spec-live` are
user-only for the milder reason that there is no judgement to apply; this one is
user-only because of who the guard is for.

# `gating.config.json` — release-gating config

Opt-in config for **release gating**: whether each spec records a decision about
shipping behind a feature flag.

The problem it solves is not "we forgot to use a flag" — it is that
**nobody can tell whether the question was asked**. A spec can go from `/spec`
through
implementation to `/spec-complete` with no flag and no mention of one, and that
is indistinguishable from "we considered it and decided against". Prose guidance
in a project rule has already been shown not to close that gap; a required header
does, because its absence is visible.

**Skitterspec bakes in the offer, never the mechanism.** How your project does
flags — a resolver, an admin toggle, env precedence, a vendor SDK — is none of
its business, and it never reads your flag code. It asks the question, cites your
own documentation, and records the answer.

**Adopt it** by copying `gating.config.json.example` → `gating.config.json` here
(or `skitterspec init --gating`). While this file is absent the feature is
entirely unused: no grill question, no header, nothing to check — which is read
as "this project does not use feature flags".

## Fields

```jsonc
{
  // Where THIS project documents how its flags work — a repo-relative path,
  // cited when the question is asked so the answer is an informed one.
  // Skitterspec never reads the file; it only names it. Empty = say nothing.
  "guidance": ".claude/rules/feature-flags.md",

  // The value written when the user declines a flag, so a project can
  // standardise its wording. Must keep the `none: <reason>` shape — the reason
  // half is the whole point (see below). Empty falls back to `none: <reason>`.
  "default": "none: <reason>"
}
```

## The header it drives

With this file present, every spec `/spec`, `/spec-bug` and `/spec-hotfix` write
carries a `Gating:` field beside `Stack:` in `00-overview.md`:

```
> **Gating:** search-ranking-v2
> **Gating:** none: additive, nothing to revert
```

Two valid shapes, and one that is not:

| Value | Meaning |
|-------|---------|
| a flag name | ships behind that flag |
| `none: <reason>` | deliberately not flagged, and why |
| *missing, empty, or a bare `none`* | **not a decision** — nobody answered |

The reason half is load-bearing. `none: additive, nothing to revert` is a
decision a reviewer can disagree with; a bare `none` is a shrug, and a missing
line is an oversight. Distinguishing those three is the entire feature.

## What it never does

- **It never blocks.** `skitterspec gating check` reports and exits 0;
  `/spec-start` and `/spec-complete` mention a missing header and carry on.
  Nothing here can stop a spec being started, completed or landed.
- **It never accuses an old spec.** Only `specs/backlog/` and
  `specs/in-progress/` are read. Specs finished or abandoned before you adopted
  gating are out of range by construction, not by a filter someone has to
  remember.
- **It never learns your flag system.** `guidance` is a path it prints, nothing
  more.

## Checking

```
skitterspec gating check              # the spec in flight here
skitterspec gating check <spec>       # one named spec
skitterspec gating check --all        # every active spec
skitterspec gating check --json       # for tooling
```

---
name: spec-sync
description: Run the repo-wide spec-sync operations against GitHub — what is linked, the project's statuses, read-back verification, manual stamping, and bulk apply. Run it bare for the repo-wide overview. Defers to /spec-push and /spec-status for per-spec work. Opt-in — needs specs/.core/github.config.json. Use when the user says "/spec-sync", "run spec-sync", "what's linked to GitHub", "which statuses does the project have", or "mirror the whole backlog".
disable-model-invocation: true
---

# /spec-sync — the repo-wide GitHub sync operations

> Stay silent while this runs — speak only to ask something you cannot answer
> yourself, or to report a failure at the moment it happens. Read
> `.claude/rules/spec-reports.md` before reporting; it defines the block this
> skill ends with.

`/spec-push` and `/spec-status` cover **one spec**. This skill covers everything
**repo-wide**, and is the answer to a bare "run spec-sync" — which is not itself
a command.

**Opt-in**: only runs when `specs/.core/github.config.json` exists. If absent,
tell the user how to enable GitHub sync and stop.

## The invocation — always state it

`spec-sync` is a subcommand of a binary that is a **local devDependency**, so it
is never on `PATH`. Typing `spec-sync` gives `command not found`, which reads as
a broken install rather than a wrong invocation. Always run it — and always show
the user you ran it — in full:

```
pnpm exec skitterspec-github spec-sync <subcommand> [args]
```

In a project that installs the GitHub superset the binary is
`skitterspec-github` (it also answers to `skitterspec`). Never print a bare
`spec-sync …` as if the user could type it.

## 1. Route the ask

| The user asks | Run |
|---------------|-----|
| bare `/spec-sync`, "what's linked?", "how much is mirrored?" | `linked` |
| "what states does the board have?" | `states` |
| "what specs are there?", "what's in the backlog?" | `list` — or hand to `/spec-list` |
| "what's waiting to become a spec?", "any new issues?" | `intake [query]` |
| "did the mirror survive the push?" | `verify <spec> --stored <file>` |
| "link this spec to #1 by hand" | `stamp <spec> --issue #1` |
| "mirror the whole backlog / every complete spec" | `apply --all <bucket>` — **confirm first** |
| "what ticket am I on?", writing a commit | `ref` |
| "what shipped in this release?" | `released` |
| "is any of this wired up?", "why isn't sync working?" | `doctor` — scaffold, isolation, tracker and credentials in one |
| "set my GitHub credentials", "am I authenticated?" | `credentials <status\|set\|unset>` |
| push one spec, or "what would push?" | **defer** — see below |

The Linear provider's `retarget`, `reattach`, `stage` and `sanitise` are **not
yet shipped for the GitHub provider** — say so when one is asked for, rather
than improvising an equivalent. Assignment (`assign`, `whoami`, `users`) is
`/spec-claim`'s — hand over to it.

**With no argument, run `linked`.** It is the repo-wide overview, it is
read-only, and it is what a bare "run spec-sync" means.

**When the ask is genuinely ambiguous between a read and a write — ask.**
"Sync the backlog" could mean `linked` (show me) or `apply --all backlog`
(write dozens of issues). Never resolve that guess in favour of the write.

## 2. Defer, don't duplicate

Two front doors to one write path is worse than none:

- **Push one spec** → `/spec-push`. It owns the transport choice, the
  status-name gate, the plan, the apply, the stamping and the snapshot.
- **Per-spec drift** ("is this spec in sync?", "what would push?") →
  `/spec-status`.

Say which skill you're handing to and stop; don't reimplement either.

## 3. The read-only subcommands

```
pnpm exec skitterspec-github spec-sync linked [--json]
pnpm exec skitterspec-github spec-sync states [--via api|mcp] [--json]
pnpm exec skitterspec-github spec-sync intake [query] [--json]
```

- **`linked`** is offline: which specs carry a `github_identifier`, their bucket,
  and an `N/M linked` total. Relay it, and when specs in `in-progress` have no
  issue, say so — those are the ones a push would mint.
- **`states`** reaches the board. It also reports the **transport** (`api`
  when a token resolves, else `mcp`), which is the honest way to answer "how
  is this talking to GitHub?". Its non-JSON output ends with the **bucket map** —
  every lifecycle bucket against the board's real Status options, with the
  issue's own open/closed beside it, a verdict per row — which is the answer to relay when the user asks whether the mapping is
  right.
- **`list`** is the read side of the mirror: every spec issue GitHub holds,
  joined to the local spec folder that owns it. Unlike `linked`, it asks the
  board what exists rather than the repo — which is the only way to see a spec started
  on a branch this checkout has not got. Scope is the live statuses by default
  (`--all`, or `--state <name>`). **`/spec-list` is the front door** — hand over
  to it for anything beyond a bare listing; it carries the MCP path and the
  offline degradation.
- **`intake [query]`** is the inbox `/spec --from-issue` browses: open issues
  carrying `intake.label` that no spec has adopted and that are not themselves
  spec or phase issues, each with the skill its labels route it to
  (`/spec-hotfix` first, then `/spec-bug`, else `/spec`). `query` filters titles.
  Without a token it says so on one line and exits 0 — it is a convenience.

## 4. `verify` — check what the tracker actually stored

```
pnpm exec skitterspec-github spec-sync verify <spec> --stored <file>
```

`--stored` is **what GitHub currently holds**, read back over MCP:

```json
{ "issue": "…", "subIssues": { "01-engine": "…" } }
```

**It is not a `github-base/*.base.json` snapshot.** That file holds content
*hashes* keyed by identifier; comparing one against a description reports
enormous losses on a perfectly intact mirror. The engine refuses a snapshot
outright — if you see that refusal, you passed the wrong file, not found a bug.

Warns, never fails. The repo is the source of truth; a mangled mirror is fixed
by pushing again. GitHub stores the markdown it was sent, so a clean push reads
back identical; the comparison still ignores bullet markers and whitespace.

## 5. `stamp` — the manual escape hatch

```
pnpm exec skitterspec-github spec-sync stamp <spec> --issue #1 [--url URL] [--sub <ref>=#2 …]
```

Writes the keys into the spec's frontmatter without touching GitHub. For adopting
an issue created by hand, or repairing a stamp — not the normal path, which is
`/spec-push`. A wrong key here makes the next push see an **unlinked** spec and
mint a duplicate, so read the values back to the user before writing.

## 6. `apply --all <bucket>` — bulk, and the one with real blast radius

```
pnpm exec skitterspec-github spec-sync apply --all <bucket> [--via api|mcp] [--json]
```

**Confirm before running, and state creates and updates separately.** They are
not the same risk:

- an **update** refreshes a mirror that already exists;
- a **create** mints new issues and sub-issues in someone's shared tracker.

A repo adopting GitHub reports "N to create" for every unlinked spec, so an
unconsidered `--all` can mint dozens of sub-issues. Get the counts first — run
`linked` to see what is unlinked, or `spec-sync plan <spec>` per spec for exact
numbers — then show the user something like:

```
apply --all backlog would:
  create  12 issue(s) + 34 sub-issue(s)   ← new objects in GitHub
  update   3 issue(s) +  5 sub-issue(s)   ← refresh existing mirrors
```

Only run it on an explicit yes. It is resumable: every key is stamped the moment
its object exists, so an interrupted run continues rather than duplicating.

`--all` refuses over MCP by design — bulk goes through the API path.

## 7. `ref` and `released` — tickets in commits

```
pnpm exec skitterspec-github spec-sync ref [--json]
pnpm exec skitterspec-github spec-sync released [<range>] [--json]
```

`ref` prints the ticket for the branch you are on, so a commit can carry
`Refs: #N` — see `.claude/rules/commit-trailers.md`.
**Off a spec branch, or on a spec that is not linked, it prints nothing and exits non-zero.**
That is the correct answer, not an error to work around: do not invent a ref,
and never write `Refs: none`.

`released` reports the tickets in a commit range — by default since the most
recent tag, and it always prints the range it chose so a wrong default is
visible. It is **read-only**: it does not move anything in GitHub. A release can
be cut and never deployed, so moving a Status stays a deliberate act.

Relay the **unreferenced count** even when it is zero. A chore commit
legitimately carries no ticket and a *missed* trailer looks identical, so
omitting the number reads as "everything is accounted for" when it may not be.

**Bookkeeping commits are excluded.** A spec's `chore(spec): complete <name>`
commit carries the same ref as the code it describes but lands *after* the tag
that shipped it, so counting it would put the ticket in two consecutive releases.
A commit whose changed paths are **all** under `release.ignorePaths` (default
`specs/`) contributes nothing; one that touches an ignored path *and* a source
file still counts. Relay the **ignored count** whenever it is non-zero — that is
the report saying which commits it set aside.

## 7b. `release` — mirror what shipped onto GitHub Releases and the board

```
pnpm exec skitterspec-github spec-sync release create <tag> --stage <env> [--apply]
pnpm exec skitterspec-github spec-sync release deployed <tag> <env> [--apply]
pnpm exec skitterspec-github spec-sync release complete <tag> [--apply]
pnpm exec skitterspec-github spec-sync release reconcile [--apply] [--json]
```

These need `releases.series` in the config — `github.config.md` → "Releases"
carries the field reference and semantics. Every verb is a **dry run without
`--apply`**, so relay the plan rather than re-deriving it. `create` mints a
prerelease listing the tag's tickets, `deployed` sets the board's Deployed
option on them, `complete` clears the prerelease flag. They are CI's verbs
first — run by the host project's pipeline on a tag — and re-run by hand to
repair the mirror.

`reconcile` is the self-healing one: it probes the npm registry for each
series' live versions and moves every marked release that shipped — including
one superseded by a newer live version — to the series' final env, backfilling
a release for a pushed tag that never got one. It is schedule-friendly: a
version the registry lacks is "not yet" and exits 0, so relay its per-release
lines verbatim and never read a `kept` as a failure. It refuses over MCP and on
a shallow clone, exactly as `create` does.

## 8. Report

Relay the engine's output **above the block**, and name the subcommand you ran
**in full**, so the user can re-run it themselves.

End with the block defined in `.claude/rules/spec-reports.md`. That file carries
the shape; this section carries only what is specific here.

**Verdicts**

- `✅` — the subcommand did what it says.
- `⚠️` — it ran, with something worth knowing — a partial result, a warning it
  printed, a degradation it fell back to.
- `❌` — it wrote some objects and failed on another. Say what exists now.
- `⏸` — it refused: no config, an unvalidated status list, a bad argument.
  Nothing was written.

**A branch-local bucket is the normal case, never the caveat.** `linked`
reads the checkout it runs in, and an in-flight spec's move to
`in-progress` lives on its own unlanded branch — so from the primary
checkout the spec still reads `backlog` while the tracker (pushed from
the worktree) is ahead. That is worktree mode working as designed:
report it `✅` with the fact in `Notes`. Spending `⚠️` on the normal
case is how the verdict stops meaning anything — the same argument
`spec-reports.md` makes for `Untouched`.

**Fields:** `Tracker` · `Notes` · `Follow-ups` · `Next`

`Tracker` says what changed in GitHub **and that the repo is unchanged** — it is
the source of truth either way, and a report that omits the second half reads as
though a sync had edited the repo.

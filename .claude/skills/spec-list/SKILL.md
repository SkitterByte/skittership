---
name: spec-list
description: List every spec GitHub holds — key, title, status, and the local spec folder name to paste into /spec-start. Read-only, and it starts nothing. Falls back to the repo's own listing when GitHub is unreachable. Opt-in — needs specs/.core/github.config.json. Use when the user says "/spec-list", "what specs are there", "what is in the backlog", or "list specs from GitHub".
disable-model-invocation: true
---

# /spec-list — every spec GitHub holds

> Stay silent while this runs — speak only to ask something you cannot answer
> yourself, or to report a failure at the moment it happens. Read
> `.claude/rules/spec-reports.md` before reporting; it defines the block this
> skill ends with.

Read-only. It answers a question and writes nothing — no branch, no folder move,
no GitHub write.

Why ask GitHub rather than `ls specs/`? Because `/spec-start` moves a spec to
`specs/in-progress/` **on that spec's own branch**. On the base branch an
in-flight spec still reads `backlog`, and a teammate's unlanded spec is not on
disk at all. GitHub knows what is actually in progress; the repo knows what each
issue is **called on disk**. The listing joins the two.

**Opt-in**: only runs when `specs/.core/github.config.json` exists. If absent,
tell the user how to enable GitHub sync (`/spec-github-setup`) and stop.

## 1. Turn the question into flags

The user asks in plain language; the engine takes flags. Map, then run:

| They ask | Flags |
|----------|-------|
| "what specs are there", "/spec-list" | *(none — the live default)* |
| "what's done", "everything" | `--all` |
| "what's cancelled", a named status | `--state "<name>"` (repeatable) |

The default scope is **live** — whatever `config.states` maps `backlog` and
`in-progress` to. It is deliberately not everything: in a project with any
history, Done dwarfs the rows anyone wanted.

`--state` and `--all` are **alternatives**, and the engine refuses the pair
rather than letting one win silently.

The Linear provider's `--mine`, `--by` and `--next` filters are
**not yet shipped for the GitHub provider** — assignee filtering and backlog
ordering wait on identity support. Say so when one is asked for, rather than approximating it.

## 2. Run the engine

```
skitterspec spec-sync list [--state <name> …|--all] [--json]
```

- **`transport = api`** (credentials resolve) → it queried GitHub and printed the
  listing. **Relay its output verbatim** and stop. Do not re-format it and do not
  make GitHub calls of your own — the engine already joined the local spec
  folders on.
- **`transport = mcp`** → the engine made no call. Go to step 3.
- Anything else it prints on one `spec-sync list:` line is a **degradation**, not
  a crash — go to step 4.

## 3. The MCP path

Only when the engine said `transport = mcp`. Discover the board **read** tool at
runtime the way `/spec-push` describes (`projects_list` / `projects_get`). If
GitHub isn't connected or the tool is missing, go to step 4 — do not stop with
nothing.

Then list the board's items once per run:

- **Only this repo's issues.** A board can hold other repos' issues, draft items
  and pull requests; keep items whose content is an issue in
  `github.owner/github.repo`.
- **Scope by state.** The live default is the open issues; `--state` keeps only
  items whose `github.statusField` value matches; `--all` keeps closed ones too.
- **Filter out phase sub-issues** — keep issues with no parent. A spec is a
  top-level issue; a phase is its sub-issue, and a listing that includes them
  buries the specs.
- **Page, and never cap silently.** Follow the tool's pagination until it runs
  out. If you stop early, say so on its own line and say what you stopped at.

**The current phase, on in-progress rows only.** For each row whose Status is
the in-progress one, read its sub-issues (`issue_read`). Order them by
**number** — sub-issues are minted in phase order, so the number carries it.
Print the live one as `2/5 — <title>`. Three shapes, none of them guessed at:

- **No child in progress** — print nothing extra. A spec sits between phases all
  the time; that is not a missing phase.
- **More than one** — print the lowest-numbered, then append
  `(+N more in progress)`. Two people on one spec is real, not an error.
- **`mapping.phases` is `inline` for this spec's bucket** — skip the call
  entirely. Those phases live in the spec issue's own body, so there are no
  sub-issues, and asking would report "no phase in progress" for a spec that is
  mid-build.

Do **not** make this call for backlog, done or cancelled rows — one lookup per
in-progress row is the budget, and there are rarely many.

Then join locally — no second GitHub call:

```
skitterspec spec-sync linked --json
```

That is `[{ spec, bucket, identifier }]`. Key it by `identifier` and attach each
issue's local `spec` folder name. Format the rows exactly as the API path does
(step 5), including the `showing N of M` count.

## 4. Degrade — never leave them with nothing

GitHub unreachable, no credential, no MCP tool, a GitHub error: **do not stop**.
Print the local listing instead:

```
skitterspec spec-sync linked --json
```

Show `spec`, `bucket` and `identifier`, under a one-line banner naming what is
missing and why it may be wrong:

```
GitHub unreachable (<reason>) — this is the repo's own listing.
Buckets are this branch's; a spec someone else has started still reads "backlog" here.
```

That caveat is the point of the banner. A local bucket is not evidence of a
spec's real state — it is evidence of what this branch knows, which is exactly
what the command exists to go beyond. A query command that fails closed is one
people stop typing.

## 5. Report

Relay the listing. Whatever the path, three things must survive into what the
user reads:

- **The count, as `showing N of M`.** If they are not the same number, say what
  was left out and how to see it.
- **The phase, on in-progress rows** — `2/5 — <title>`, after the status.
- **A row with no local match stays in**, marked `— (not linked here)`. It is not
  noise: a teammate's unlanded spec, or one authored inside another spec's
  worktree, is precisely what the repo could not have told them.

Finish with the hand-off, because every row carries the folder name for it —
as a sentence, not a fenced block: say that `/spec-start <name>` starts any of
them, with the name copied from a row.

**Never start it yourself.** `/spec-start` provisions a branch, moves a folder
and commits, and it has dirty-tree refusals this skill does not reproduce.
Offering the name is the whole job.

End with the block defined in `.claude/rules/spec-reports.md`. That file carries
the shape; this section carries only what is specific here.

**The listing goes above the block, unflattened.** It is rows of other people's
work; the block is the verdict on this run of the query. Do not fold the listing
into fields, and do not repeat it there.

**Verdicts**

- `✅` — the listing is GitHub's, joined to the local folder names.
- `⚠️` — listed, with a caveat that changes how the rows read: a paging cap you
  stopped at, or the local fallback listing under its banner.
- `⏸` — refused before acting: no config, so there is nothing to list against.
- `❌` — the query was wrong: `--state` and `--all` together, or a status name
  GitHub rejects.

**Fields:** `Follow-ups` · `Next`

**No `Tracker` row.** This skill names many specs and owns none, so an id row
would have to pick one. The counts — `showing N of M` — belong to the listing
above, where the engine already prints them.

`Next` is the hand-off: `/spec-start <name>`, with a name copied from a row.

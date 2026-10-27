---
name: spec-claim
description: Take ownership of a spec, hand it back, or give it to a teammate — the spec records who is building it and its GitHub issue is assigned to them. Opt-in — needs specs/.core/github.config.json with the repo owning assignee in sync.fieldOwnership. Use when the user says "/spec-claim", "claim this spec", "take ownership of this", "I'm picking this up", "hand this back", or "assign this spec to someone".
disable-model-invocation: true
---

# /spec-claim — take a spec, hand it back, or hand it over

> Stay silent while this runs — speak only to ask something you cannot answer
> yourself, or to report a failure at the moment it happens. Read
> `.claude/rules/spec-reports.md` before reporting; it defines the block this
> skill ends with.

Ownership lives in the repo: the spec's frontmatter records who is building it,
and the push that follows tells GitHub. This skill is how that record changes
after `/spec-start` has set it — a hand-off mid-flight, a spec picked up from
someone who moved on, or work a lead is distributing.

**Opt-in.** Needs `specs/.core/github.config.json` *and* the repo to **own**
`assignee` in its `sync.fieldOwnership` — which `"none"` declines as surely as
omitting it does. If either is missing, say which one and stop: without the field
the stamp would sit in the file doing nothing.

**The engine refuses this too, and that is the point.** `spec-sync assign` checks
the same thing and writes nothing, so the rule holds for a script, a chained
command, and anyone who reached for the CLI directly. This paragraph was the only
thing enforcing it for long enough that the engine's own success line —
`next: push it, so GitHub agrees` — was printed over a push that would drop the
field. Prose in one skill is not a guard; it is a guard's documentation.

## 1. Identify the target spec

The argument, else the spec in flight for this session, else ask. Unlike
`/spec-next` this does not refuse a spec you are not standing in: reassigning a
colleague's spec from your own checkout is a normal thing to want, and it writes
no code.

## 2. Work out the mode

| Invocation | Mode |
|------------|------|
| `/spec-claim [<spec>]` | **take** — you are building it |
| `/spec-claim [<spec>] --release` | **release** — nobody is |
| `/spec-claim [<spec>] --to <name-or-email>` | **hand over** — they are |

### take

1. `skitterspec spec-sync whoami --json`. If it answers, use that `id`/`name`.
   If it reports `transport = mcp`, call `get_me` and cache
   the answer with `whoami --set <id> --name "<name>"`.
2. **If the spec already records someone else, confirm before taking it** —
   name them and say what will happen. Taking a colleague's spec by accident is
   the one mistake here worth a round trip; every other path is reversible with
   a second `/spec-claim`.
3. Stamp it: `skitterspec spec-sync assign <spec> --to <id> --name "<name>"`.
4. Set `> **Developer:**` to **`git config user.name`** — not the GitHub display
   name. You are taking this spec yourself, so the header should name you the
   way `Author:`, the **State log** and your commits already do. The GitHub name
   belongs to the *assignment*, which step 3 just recorded; the two answer
   different questions.

### release

`skitterspec spec-sync assign <spec> --release`. This removes the stamp and, on
the next push, unassigns the GitHub issue.

**It does not clear `> **Developer:**`** — that header records who *actioned*
the work, which outlives who is currently holding it. If nobody will pick the
spec up, `/spec-cancel` is the honest move; releasing only says "not me, for
now".

### hand over (`--to`)

1. **Resolve the person through a search, never a typed id.** Run
   `skitterspec spec-sync users <name-or-email>` (or the user-list tool on MCP)
   and **confirm the match** before writing. This is the one path where the repo
   writes into somebody else's GitHub inbox, so a mistyped id would assign a
   stranger and nothing downstream would notice.
2. On several matches, show them and let the user pick. On none, say so and
   stop — do not fall back to the raw argument as an id.
3. Stamp it with the resolved id and display name.
4. Set `> **Developer:**` to that person's **GitHub display name**.

   This is the **one** place the tracker's name reaches the header, and the
   exception is the whole reason it exists: there is no `git config user.name`
   for somebody else's machine, so without it the header would go on crediting
   you for work you just gave away. Everywhere else — `/spec-start`, the
   `/spec-next` backfill, and taking a spec above — the git name wins, because
   there the person *is* you and the rest of the spec already names you that way.

## 3. Record it in the spec

Add a dated line to the **Changelog** in `00-overview.md` — who it moved to (or
from), and why if the user said. Ownership is a course-correction, not a
lifecycle transition, so it belongs there and **not** in the State log.

## 4. Push

Run `/spec-push`. The stamp is repo state, and the mirror catches up like any
other edit.

**If the push fails, the claim still stands.** Say so and stop: the repo is
correct, the mirror is disposable, and the next push repairs it. Do not roll the
stamp back — that would throw away the one durable half of the change.

## 5. Report

End with the block defined in `.claude/rules/spec-reports.md`. That file carries
the shape; this section carries only what is specific here.

**Verdicts**

- `✅` — the spec records the new owner and GitHub agrees.
- `⚠️` — the spec records it; GitHub does not yet. The spec file is the record
  and the ticket is the mirror, so this is a lag rather than a conflict — say
  which way round it is.
- `⏸` — nothing to claim, or no provider configured.

**Fields:** `Tracker` · `Follow-ups` · `Next`

`Tracker` is who owns it now and whether GitHub agrees yet — the whole answer,
in one row.

# Commit Trailers

Extends `commit-messages.md` — the format, length limits and `Release-Note:`
grammar there all still apply. This file adds one trailer, and it is only
installed when a ticketing provider is.

## `Refs:` — the ticket this commit belongs to

A commit carries the GitHub issue **its own changes** belong to, as the **last**
trailer in the message:

```
fix(sync): verify no longer flags every update

- Key the apply read-back by ref, resolving id via the projection

Release-Note: Pushing a spec whose phases already exist on GitHub no
longer reports every one of them as a possible stale reference.

Refs: #29
```

Get the value from the engine rather than reading it off a spec by hand:

```
pnpm exec skitterspec-github spec-sync ref
```

Bare, that answers **from the branch** — correct whenever you are committing
that branch's own implementation work, which is nearly always.

## When the branch and the commit disagree

The branch is a proxy for "what this commit is about", and it is a good one
right up until you commit something that is not this branch's work.

**Where isolation is configured, `/spec` closes the usual way in.** It
provisions the new spec's own `--docs` worktree before writing a line of it and
moves the session there, so the spec commit happens on the new spec's branch —
and the **bare** command is then correct, because the branch and the commit's
subject are the same spec. This is the normal path, and it needs nothing typed.

**Without isolation the split is still real.** Part-way through a spec a design
question warrants its own spec, `/spec` writes it into `specs/backlog/` on the
branch you are standing on, and that commit is **entirely the new spec's** while
the bare command answers with the old spec's ticket.

Name the spec instead — still the engine, never a hand-written id:

```
pnpm exec skitterspec-github spec-sync ref feat-distance-prescriptions
```

The branch is not consulted, so this works from `main` too. An unknown spec name
fails rather than falling back to the branch, so a typo can't become a
confidently wrong ref.

**A spec in ANOTHER spec's worktree is still the thing to avoid**, and the fix
is no longer "author from the base branch" — it is the provision above, which
moves the session out of that tree and into the new spec's own. What was always
true of the accident stays true: a spec written inside another spec's worktree
physically lives on that branch, so it is not on `main` until that spec lands,
and it is cancelled along with it.

## Rules

- **The ref names the commit's subject, not your location.** If they disagree,
  the commit's subject wins — resolve it with `spec-sync ref <spec>`.
- **Omit the trailer entirely when there is no ref.** `spec-sync ref` exits
  non-zero and prints nothing on a commit that has no ticket — on `main`, or on
  a spec kept deliberately local. Never invent one, and never write
  `Refs: none`: the release report counts unreferenced commits, and a fabricated
  ref is worse than an honest gap.
- **One ref per commit.** A commit belongs to one spec. If work genuinely spans
  two tickets, that is two commits — and that is the fix when a single commit
  would mix a branch's own work with another spec's files.
- **Never use GitHub's closing keywords** — `close`, `closes`, `closed`,
  `fix`, `fixes`, `fixed`, `resolve`, `resolves`, `resolved`, followed by an
  issue number. Those close the issue the moment the commit reaches the default
  branch, which is wrong here: a ticket moves when its work is **released**, not
  when it merges, and the board's Status is the engine's to set. `Refs:` is
  deliberately inert to GitHub's automation.
- **`#N` only — never `owner/repo#N`.** The trailer names an issue in THIS repo,
  and `spec-sync released` ignores a cross-repo ref by design, so writing one
  moves the commit out of every release report.
- **An older tracker's ref is history, not a ref.** A repo that moved here from
  Linear or Jira still has `Refs: SKS-29` all through its log; `released`
  counts those commits as `historical`, never as missing a trailer. Never
  rewrite them, and never write a new one.
- **Blank line before it**, like `Release-Note:` — it is a git trailer, not body
  text.
- Put it **after** `Release-Note:` when both are present, so the human-facing
  note reads first.

## Why it exists

The repo lands specs with `merge --ff-only`, so history is linear and branch
names never reach it. The commit message is the only artefact that survives into
the range a release scans, which is what lets
`spec-sync released <range>` report the tickets a release contains. A ref that
names the wrong ticket does not merely lose information — it moves a commit onto
another ticket's release report, which is worse than the gap it was meant to
close.

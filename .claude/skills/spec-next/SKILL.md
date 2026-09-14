---
name: spec-next
description: Build the next unfinished phase of the spec in flight for this session — pre-flight, implement with tests, record progress and refresh the tracker. Refuses when no spec is in flight rather than guessing one, and never builds a spec it is not standing in. Use when the user says "/spec-next", "build the next phase", "continue the spec", or "carry on with this spec".
---

# /spec-next — build the next phase of the spec in flight

It assumes the workbench is already set up: a spec is **in flight** on this
checkout, and this skill implements its next unfinished phase. Putting a spec in
flight — provisioning, moving it to `in-progress`, getting its branch here — is
`/spec-start`'s job. Re-run this per phase until the spec is done, then
`/spec-complete`.

## 1. Identify the spec in flight

Resolve **in this order**, and stop at the first that answers:

1. **The live spec of this checkout** — run
   `skitterspec spec-env live status` and read its `live:` line. `live: yes`
   names the spec whose branch is checked out here; that is the one to build.
2. **The worktree you are standing in** — if this session's cwd is inside a
   spec's worktree, that spec is in flight *for this session*. This is the
   manual-parallel path: several specs may be provisioned, and a terminal tab
   opened in one is its own workbench.
3. **The current branch, in `checkout` mode** — no worktrees exist, so the
   branch the checkout is on names the spec.

**If none answers, refuse and stop:**
`no spec in flight — run /spec-start <name> to start one`.

**Never fall back to the spec "in context".** A spec discussed in conversation
is not a spec in flight, and this skill writes real code: building the wrong
spec's phase produces commits on a branch nobody asked for. The refusal is
cheap; the mistake is not.

A **name argument** is accepted, but it must *match* the spec in flight — it
narrows a re-run, it does not select a different spec. A mismatch refuses,
naming both.

## 2. Pre-flight — commit prior work

Before writing any code for this phase, get the workspace clean:

- **Confirm the last-worked phase is committed.** Run `git status` and
  `git log --oneline -5`. The most recently *implemented* phase (not necessarily
  the numerically previous one) should already be committed. If prior-phase work
  is still uncommitted, **stop and suggest committing it first** (e.g. via
  `/commit`) so each phase lands as its own reviewable commit — don't build the
  next phase on top of an uncommitted one. (Skip if this is the first phase —
  there's nothing prior to commit.)

## 3. Implement the phase

Identify the **first unfinished phase** from the `00-overview.md` phase index,
then open its phase file (`0N-<slug>.md`) — that file holds the tasks. Mark it
started: set the phase-file heading to `🔄` and its `> **Status:**` to
`In progress`, and flip the matching row in the overview phase index to `🔄`.

**Then sync with the tracker (only if a provider is installed).** The phase has
just changed state, so refresh the mirror before the build starts — that is what
makes the phase show as in progress *while* it is being built rather than only
once it is over. Without a provider this is a no-op and nothing below changes.



Then build it, following the project rules in `.claude/rules/*.md` and `CLAUDE.md`:

- Work task by task through the phase file. Make focused edits that match
  surrounding code.
- Honour the project's conventions (see `.claude/rules/spec-planning.md` and the
  rules it links).
- **Tests are part of the phase, not after it.** Create/extend tests for the
  work, then run the project's typecheck and test commands. Do not declare the
  phase done until green.
- Never hardcode dates in tests; never run destructive commands against a real
  database — use the project's test database only.

## 4. Record progress

- In the **phase file**: tick completed tasks (`- [x]`), flip its heading to `✅`,
  and set its `> **Status:**` to `Done`.
- In **`00-overview.md`**: flip the matching phase-index row to `✅`.
- If anything changed from the plan (a decision, a deviation, a discovered
  constraint), add a dated **Changelog** entry in `00-overview.md`.
- If new work surfaced, add it as tasks to the appropriate phase file (or add a
  new phase file + index row) rather than doing it silently.

**Then refresh the mirror (only if a provider is installed).** The phase is done
in the repo now; leaving the tracker to catch up at `/spec-complete` is what makes
a mirror lag a whole spec behind. Without a provider this is a no-op.



## 5. Report

Summarise what was implemented, the test result (quote failures if any), and
which phase is next. Do **not** `git commit` unless the user asks — finish,
verify, and wait.

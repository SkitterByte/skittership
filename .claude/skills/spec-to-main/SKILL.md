---
name: spec-to-main
description: Land an in-progress spec's branch onto main WITHOUT finishing it — rebase + fast-forward so the work reaches main (to run it in CI / a shared test env), while the worktree stays and the spec stays In Progress. Repeatable — land again as you commit more. Targets a spec by name (arg) or the spec in context. Use when the user says "/spec-to-main", "land this on main but keep going", "I need this on main to run tests before finishing", or "merge to main without completing the spec".
disable-model-invocation: true
---

# /spec-to-main — land the branch on main, keep the spec open

The **intermediate** landing. `/spec-complete` also lands the branch, but then
verifies every phase, flips the status to Complete, `git mv`s the spec to
`complete/`, and tears the environment down.
**`/spec-to-main` stops after the land**: the worktree stays, the spec stays
`In Progress`, and you can land again as you add commits.

Use it when a later phase can only be done *after* the current work is on `main` —
e.g. it needs to run in CI, a deploy pipeline, or a shared test environment that
builds from `main`. Land what you have, run that step, then come back and finish
the remaining phases with `/spec-next` and eventually `/spec-complete`.

It reuses the **same engine** as `/spec-complete`'s landing (`spec-env integrate`
— rebase + fast-forward), so it produces identical linear history. Because a
fast-forward leaves `base == branch`, the operation is
**idempotent and repeatable**: new commits put the branch ahead of base again,
and you can run `/spec-to-main` as many times as you like.

## 0. Preconditions — when this applies

- **Isolation must be on** (`specs/.core/env.config.json` exists **and** the spec
  was provisioned by `/spec-start` — a worktree, or its branch in the checkout under
  `mode: checkout`). If isolation is absent, there is nothing to land — the spec
  is authored directly on `main` already. Say so and stop. `spec-env integrate`
  reads `mode` and emits the matching plan; in checkout mode it rebases in place,
  switches to base and fast-forwards, all in the one repo.
- **Feature / Bug specs only.** A **Hotfix** (`Type: Hotfix`) is built on a
  release *tag* and cannot fast-forward onto `main` — refuse it and point the user
  at `/spec-complete` (it lands a hotfix via tag + cherry-pick). Check the header
  `> **Type:**` before proceeding.

## 1. Identify the target spec

- Use the name/path argument if given, else the spec **in context**. If unclear,
  ask which spec.
- Locate its folder under `specs/in-progress/`. Entry point is `00-overview.md`;
  confirm `> **Status:**` is `In Progress` and `> **Type:**` is `Feature` or
  `Bug`.

## 2. Require a clean worktree

The land rebases the branch — it refuses a dirty tree. If the worktree has
uncommitted changes, offer `/commit` and **stop**; don't auto-commit.

**If the spec is live** (you took the running instance with `/spec-live`):
`integrate` is live-aware — it ends the live session first (releases the branch
back to base, re-isolates it into its worktree, clears the receipt), then prints
the landing plan. Commit any live fixes to the branch first; it refuses if the
primary checkout is dirty, or if a *different* spec holds it (release that one with
`/spec-live main`, which the user types).

## 3. Tests must be green before landing

Don't push red to `main`. Run the project's typecheck and test commands
**in the worktree**; the suite must be **green**. For a **Bug** spec, confirm
the originally-failing test now passes. If anything is red, stop and report —
landing broken code onto `main` defeats the purpose.

(Note this is the *worktree* suite. The whole point of this skill is often to run
a *further* check that only exists on `main` / in CI — that one runs **after** the
land, in step 5.)

## 4. Land — rebase + fast-forward

Run `skitterspec spec-env integrate <name>` and run the printed commands
**in order**:

- `git -C <worktree> rebase <base>` — replay the branch onto base.
- `git -C <mainRepoPath> merge --ff-only <branch>` — fast-forward base.

On a **rebase conflict** (non-zero exit), run `git -C <worktree> rebase --abort`,
relay the conflict, and **stop** — leave the resolution to the user; change
nothing else.

On a **no-op** ("already landed on `<base>` — nothing to integrate"), just say so
and continue — the branch has no commits base doesn't already have.

## 5. Re-test on base, then report

- Run the project's test command **from the primary checkout** — base must be
  **green** after the fast-forward.
- Add a **Changelog** entry to `00-overview.md` recording the intermediate land
  and *why*, e.g.
  `- <YYYY-MM-DD> — Landed intermediate work onto <base> to <run CI / deploy to
  test env / …>; spec stays In Progress.`
- Do **NOT**: add a State-log row (status doesn't change), flip any phase/status
  to Complete, `git mv` the spec, or tear down the worktree/stack.
  **The spec stays `In Progress` and the worktree stays put.**
- Report: the base branch, the fast-forward result, and the green base test. It
  **never pushes** — mention the user can `git push` the base branch themselves to
  trigger CI / the shared env.
- Point the way forward: `/spec-next` to continue the remaining phases (you'll keep
  committing on the same branch and can `/spec-to-main` again), and `/spec-complete`
  when every phase is genuinely done — it will land the final commits, finalise,
  and tear down.

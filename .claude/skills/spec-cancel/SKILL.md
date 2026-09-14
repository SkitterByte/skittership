---
name: spec-cancel
description: Cancel a spec — capture the reason, record final progress, stamp the reason on the spec header, then move it into specs/cancelled/. Targets a spec by name (arg) or the spec currently in context. Use when the user says "/spec-cancel", "drop this spec", "we're not doing this spec", or "shelve <spec>".
---

# /spec-cancel — record, stamp a reason, archive a spec

## 1. Identify the target spec

- Use the name/path argument if given, else the spec **in context**. If unclear,
  ask which spec.
- Locate it under `specs/` (any bucket — `backlog/`, `in-progress/`, …). Entry point
  is its `00-overview.md`; phases are separate files (`01-<slug>.md`, `02-…`) listed
  in its phase index (legacy specs may be a bare `<name>.md`).

## 2. Ask for the cancellation reason — required

Ask the user **why** it's being cancelled (e.g. superseded by X, descoped, no
longer needed, blocked indefinitely). Do not proceed without a reason; capture
it verbatim/condensed for the header.

## 3. Double-check and record progress

- Read the overview and every phase file and reconcile task state with reality:
  tick anything that was actually completed before cancelling so the record is
  honest about what landed.
- Note any partial/abandoned work so it isn't mistaken for unstarted.
- **Check for pre-existing uncommitted changes — before you touch anything.**
  Run `git status`. Anything already uncommitted is the *user's* work and must not
  be swept into the cancellation commit: offer `/commit` and **stop**. Everything
  this skill writes in steps 4–5 is its own, and step 5 commits that.

## 4. Stamp the spec

Update the **Status** header in the entry point so the reason is visible at the
top:

```
> **Status:** Cancelled (<YYYY-MM-DD>) — <reason>
```

Append a **State log** row:
`| <YYYY-MM-DD> | Cancelled | cancelled | <git user.name> |`.

Add a **Changelog** entry:
`- <YYYY-MM-DD> — Cancelled: <reason>.`

## 5. Move to cancelled — and commit it

`mkdir -p specs/cancelled` then **`git mv`** the file or folder:
`git mv "specs/<bucket>/<name>" "specs/cancelled/<name>"` (preserve history;
move the whole folder).



Then **commit the cancellation edits** — this skill wrote them, so it commits
them:

```
git add specs/ && git commit -m "chore(spec): cancel <name>"
```

**This matters more here than anywhere else.** Teardown (step 7) refuses a dirty
worktree and offers `--force` as the way through — and forcing would destroy the
cancellation record this skill just wrote. Committing first means teardown never
needs `--force`. Do not `git push`.

## 6. Report

Confirm the cancellation, the reason recorded, the new location, and the commit.

## 7. Tear down the environment (opt-in, only if configured)

**Only when `specs/.core/env.config.json` exists**, offer — don't force — to
reclaim the cancelled spec's environment. On confirmation, run the `spec-env` CLI
directly (the old `/spec-env-down` skill is gone — teardown is folded in here):

1. If `.spec-env/connected` names this spec, run `skitterspec spec-env connect
   main` first to free the canonical ports.
2. `skitterspec spec-env dev down <name>` — stop its host dev servers.
**Standing in the worktree? Leave it before you tear it down.** If this
session's cwd is inside the spec's own worktree, get out **first**, then run the
teardown commands. How you leave depends on how you got in:

- **`/spec-start` moved this session in** — the normal path in `worktree` mode.
  Call **`ExitWorktree`** with `action: "keep"`. It restores the session to the
  directory it started from *and* clears the caches still pointing at the
  worktree, which a bare `cd` does not: after a `cd` the session stays registered
  against the tree and asks you about it again when it ends.
- **You opened the terminal yourself** — `cd` to the primary checkout, as always.
  `ExitWorktree` is a no-op outside a session it moved, so trying it costs
  nothing, but the `cd` is what relocates you.

**Always `keep`, never `remove`.** `ExitWorktree` refuses to remove a worktree
entered by path in any case, and the `spec-env down` plan below has to stay the
single thing that deletes — a second deleter is how the teardown guards get
bypassed.

Not because git refuses — it does not. `git worktree remove` **succeeds** on the
tree you are standing in, and that is the problem: the directory vanishes under
the shell, `pwd` keeps reporting the path that no longer exists, and every
command after it dies with `fatal: Unable to read current working directory`.
The teardown looks fine and everything following it breaks — the report, the
prune, any check you meant to run. Relocating first costs nothing and is the
only ordering that survives.

3. `skitterspec spec-env down <name>` — then execute the printed commands to
   remove the worktree/stack and free the slot. It respects the teardown guards
   (won't destroy a dirty/unpushed worktree without `--force`).

   If the plan prints a `remote branch — confirm with the user first:` section,
   **ask before running that line** — it is a `git push <remote> --delete`, and
   the branch is merged, so it loses nothing. Usually there is nothing to ask:
   a cancelled spec is normally **unlanded**, and the planner deliberately never
   offers the remote delete then, because the pushed branch is the only surviving
   copy of abandoned work. Seeing no such section here is the expected case, not
   a fault — and if the user wants the remote branch gone anyway, that is their
   call to make explicitly, not something to tidy away on their behalf.
4. `skitterspec spec-env prune` — reap orphaned test-DB volumes that belong to no
   live spec (leftovers from declined/aborted teardowns or manual worktree
   removal). Show the orphan list and, **only on the user's confirmation**, run
   the printed `docker volume rm` commands. Non-fatal: if it can't run or the user
   declines, report and finish cancelling anyway.

If `env.config.json` is absent, skip this entirely — behave exactly as before.

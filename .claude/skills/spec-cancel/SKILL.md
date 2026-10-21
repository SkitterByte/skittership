---
name: spec-cancel
description: Cancel a spec — capture the reason, record final progress, stamp the reason on the spec header, then move it into specs/cancelled/. Targets a spec by name (arg) or the spec currently in context. Use when the user says "/spec-cancel", "drop this spec", "we're not doing this spec", or "shelve <spec>".
---

# /spec-cancel — record, stamp a reason, archive a spec

> Stay silent while this runs — speak only to ask something you cannot answer
> yourself, or to report a failure at the moment it happens. Read
> `.claude/rules/spec-reports.md` before reporting; it defines the block this
> skill ends with.

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
them. Ask the engine which paths are this spec's, then stage and commit
**exactly those**:

```
skitterspec spec-env stage <name>     # lists them; --json to consume
git add -- <the owned paths>
git commit -m "chore(spec): cancel <name>" -- <the owned paths>
```

**Never `git add specs/`.** That stages a *directory*, so a spec another
session is part-way through writing lands in this commit under this spec's
ticket. The `--` on the **commit** is the other half: a checkout has one
`.git/index`, shared by every session standing in it, so a bare `git commit`
takes whatever else is staged there however carefully you staged your own.
`.claude/rules/spec-planning.md` carries the full account.

**This matters more here than anywhere else.** Teardown (step 7) refuses a dirty
worktree and offers `--force` as the way through — and forcing would destroy the
cancellation record this skill just wrote. Committing first means teardown never
needs `--force`. Do not `git push`.

## 6. Report

**The block is emitted when the run ends, not where this section sits.** The
sections below run after it, so their outcome belongs in the block — write it
once, at the end, with what actually happened.

End with the block defined in `.claude/rules/spec-reports.md`. That file carries
the shape; this section carries only what is specific here.

**Verdicts**

- `✅` — stamped, moved to `cancelled`, committed, torn down.
- `⚠️` — cancelled, with something worth knowing: teardown declined, a tracker
  refresh that failed, unpushed commits the operator chose to let go.
- `❌` — it acted and stopped part-way. Say what is where.
- `⏸` — no reason given, or no such spec. Nothing changed.

**Fields:** `Tracker` · `Spec` · `Worktree` · `Follow-ups` · `Next`

**The reason goes in the verdict clause** — `✅ /spec-cancel · feat-foo ·
superseded by feat-bar`. It is the one thing anyone reading this later wants,
and a cancellation is an ordinary successful run, so it must not be mistaken for
a `Why`: that field is for a run that did not do what it set out to.

`Worktree` says what was reclaimed, or that teardown was declined and the
worktree still stands — on a cancelled spec that worktree may hold the only copy
of the work, so an unreclaimed one is worth a line rather than a silence.

## 7. Tear down the environment (opt-in, only if configured)

**Only when `specs/.core/env.config.json` exists**, offer — don't force — to
reclaim the cancelled spec's environment. On confirmation, run the `spec-env` CLI
directly (the old `/spec-env-down` skill is gone — teardown is folded in here):

0. **Name a pass still waiting for THIS spec — before anything is removed.**

   ```
   skitterspec spec-env review waiting --json
   ```

   Filter to the spec being cancelled and say nothing about any other: a run
   reports itself and nothing else (`.claude/rules/spec-reports.md`). For each
   one, give the code, the verdict and the age, then the two exits — claim it
   now with `/spec-reviewed <code>` **while the worktree still stands**, or
   disown it with `skitterspec spec-env review <spec> --drop <code>`.

   **Why here and not anywhere else.** Nothing is about to become unreachable —
   a pass can be disowned long after its spec is gone. What is about to pass is
   the last moment the verdict can still be **honoured**: before teardown a
   `commit` pass can be claimed and acted on, after it there is no branch left
   to commit to and disowning is all that remains. On a cancelled spec that is
   sharper still — the worktree may hold the only copy of the work, so a pass
   approving it is the one thing that might argue for keeping it.

   **It reports, and it never blocks.** No refusal, no confirmation of its own,
   no non-zero exit — this step already asks before it reclaims anything, and a
   waiting pass is information rather than a second gate.
   And **it never claims** — reporting a pass is not taking one, and
   `/spec-diff` §0 is untouched by this step.

   Put what you found in the report's `Notes` row.
   Silent when nothing is waiting, which is the usual case.

1. If `.spec-env/connected` names this spec, run `skitterspec spec-env connect
   main` first to free the canonical ports.
2. `skitterspec spec-env dev down <name>` — stop its host dev servers.
**Standing in the worktree? Leave it before you tear it down.** If this session's
cwd is inside the spec's own worktree — the normal case in `worktree` mode, since
`/spec-start` moves you there — get out **first**, then run the teardown commands.
One instruction covers it:

```
cd <primary checkout>
```

That is the whole mechanism, and it does not matter how you got in: the session
was moved by a `cd` and it leaves by one. There is no tool to call here, and none
should be reached for — the move in is a plain `cd` precisely because a tool that
asks for approval is unusable on a phone.

**`spec-env down` stays the single thing that deletes a worktree.** The plan
below is the only deleter, because a second one is how the teardown guards get
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

   **When it refuses over unpushed commits, relay both ways out.**
   A cancelled spec is normally unlanded, so this is the one moment in the
   lifecycle where that guard genuinely fires — and it fires about real loss.
   The worktree is the only copy of this work: the branch is on no remote and
   not merged into the base branch, so removing it ends it. Say that plainly,
   relay the engine's reason, and give both endings:

   ```
   publish it first — keeps the work reachable, then re-run /spec-cancel:
     git -C <worktreePath> push -u origin <branch>

   or accept the loss (the worktree and its commits go):
     skitterspec spec-env down <name> --force
   ```

   **Print the push; never run it.** Publishing abandoned work to a shared
   remote is the same unasked-for act this workflow took out of `/spec-start`,
   and it is no more wanted here — someone may well want this branch to exist
   nowhere but their own machine. Offer the command and wait for an answer.

   **Never reach for `--force` yourself either.** The engine's own message names
   only that half, which is the whole reason this step exists: meeting a wall
   labelled *--force to tear down anyway* at the exact moment a backup is still
   cheap is how work gets thrown away. Both options, then stop — the choice is
   a decision about someone's work, and it is theirs.

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

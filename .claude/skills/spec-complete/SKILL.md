---
name: spec-complete
description: Finish a spec — verify all phases are genuinely done, update progress, then move it into specs/complete/. Targets a spec by name (arg) or the spec currently in context. Use when the user says "/spec-complete", "mark this spec done", or "this spec is complete".
---

# /spec-complete — verify, finalise, archive a spec

## 1. Identify the target spec

- Use the name/path argument if given, else the spec **in context**. If unclear,
  ask which spec.
- Locate the spec folder under `specs/` (usually `specs/in-progress/`). Entry
  point is its `00-overview.md`; phases are separate files (`01-<slug>.md`, `02-…`)
  listed in its phase index (legacy specs may be a bare `<name>.md`).

## 2. Double-check progress — don't rubber-stamp

Before marking complete, confirm the work is actually finished:

- Read every phase file. For each **unchecked** task, check whether it is in fact
  done in the code — tick it (`- [x]`) if so, or surface it if not.
- Run the project's typecheck and test commands. The suite must be **green** to
  call a spec complete.
- For a **Bug** or **Hotfix** spec (`Type: Bug` / `Type: Hotfix`), confirm the
  originally-failing test named in the spec now passes — that test is the proof
  the fix works.
- If genuinely incomplete work remains, **stop and tell the user** rather than
  forcing completion. Offer to finish it (`/spec-next`) or to complete with the
  remaining items explicitly listed as deferred.
- **Check for pre-existing uncommitted changes — before you touch anything.**
  Run `git status`. Anything already uncommitted is the *user's* work (a
  half-finished phase, a stray fix) and must not be swept into the completion
  commit: offer `/commit` and **stop**. Everything this skill writes in steps 3–4
  is its own, and step 4 commits that.


### Release gating (only when configured)

**Only when `specs/.core/gating.config.json` exists.** Run
`skitterspec gating check <spec>` and report what it says. This is the last point
at which the question can still be answered cheaply, which is exactly why it is
asked here — a spec that reaches `Complete` with no decision recorded is the gap
the feature exists to close.

**Never refuse to complete over it.** Say plainly that no decision was recorded,
offer to record one now, and finish either way. The work is done; withholding the
status flip would punish the wrong thing.

**This check is advisory.** It reports; it never refuses, and nothing below is
conditional on it. A spec written before the project adopted gating has no header
and is not broken — turning this into a gate would accuse the very specs the
feature was designed not to disturb.

## 3. Update the spec

- Tick all completed tasks in the phase files; flip every finished phase-file
  heading **and** every row in the `00-overview.md` phase index to `✅`.
- Set the **Status** header in the entry point:
  `> **Status:** Complete (<YYYY-MM-DD>)`.
- Append a **State log** row:
  `| <YYYY-MM-DD> | Complete | complete | <git user.name> |`.
- Add a **Changelog** entry:
  `- <YYYY-MM-DD> — Completed; all phases done, tests green.`
  (Note any consciously-deferred items here too.)

## 4. Move to complete — and commit it

`mkdir -p specs/complete` then **`git mv`** the file or folder:
`git mv "specs/in-progress/<name>" "specs/complete/<name>"` (preserve history;
move the whole folder). The `specs/complete/` folder is the record of finished
specs — `git log`/the per-spec State log give the completion order.



Then **commit the completion edits** — steps 3–4 are this skill's own output, so
it finishes its own work rather than handing you a dirty tree:

```
git add specs/ && git commit -m "chore(spec): complete <name>"
```

Step 2 established the tree was otherwise clean, so this commits exactly the
status flip and the move — nothing of yours rides along.
**This is what lets step 6 land:** `integrate` refuses a dirty worktree, so
without committing here the skill would block on the very edits it just made.
Do not `git push`.

## 5. Report

Confirm the move, the commit, the final test result, and list anything deferred.

## 6. Land the branch (opt-in, only if isolated)

**Only when `specs/.core/env.config.json` exists and the spec was provisioned**
(a worktree in `worktree` mode, or its branch in the checkout in `checkout`
mode — `spec-env integrate` and `down` pick the right plan from `mode`, so the
commands you run differ but these steps do not)
(it was provisioned by `/spec-start` or `/spec-hotfix`). Otherwise skip this entirely
— a non-isolated spec has nothing to land, and `/spec-complete` behaves exactly as
before. When it applies, offer to land the finished branch so the work reaches its
destination in one flow. **How it lands depends on the spec type:**

### 6-hotfix. `Type: Hotfix` — tag + cherry-pick (not fast-forward)

A hotfix is built on an old release **tag**, so it can't fast-forward onto `main`.
Use the hotfix landing instead of the integrate steps below:

1. **Require a clean worktree.** Step 4 already committed the completion edits, so
   this should pass. If the tree is *still* dirty, that's unrelated work — offer
   `/commit` and **stop**.
2. **Plan + execute.** Run `skitterspec spec-env hotfix land <name>` — add
   `--also <tag>` for each extra release line to patch (test/demo on their own
   versions). Run the printed commands **in order**. It:
   - tags the hotfix branch with the **patch-bumped base tag** (the deploy tag) —
     **created locally; you push it** (`git push origin <tag>`) to trigger CI/CD;
   - for each `--also` target, cherry-picks the fix onto a throwaway worktree at
     that tag and re-tags it;
   - cherry-picks the fix onto `main` for the next release.
   On a **cherry-pick conflict** (non-zero exit), run `git -C <checkout>
   cherry-pick --abort` there, relay the conflict, and **stop** — don't offer
   teardown.
   On a **no-op** ("nothing to land"), say so and continue.
3. **Re-test on `main`** after the cherry-pick — it must be **green**.
4. **Report** the deploy tag(s) and the `main` cherry-pick. It **never pushes** —
   remind the user to `git push origin <deploy-tag>` to deploy. Then teardown
   (step 7) applies: a tagged hotfix branch tears down with **no `--force`**.

### 6-feature/bug. `Type: Feature` / `Type: Bug` — rebase + fast-forward

Land the finished branch on the base branch so the work reaches `main` (or your
configured `baseBranch`) in one flow. (Need the work on `main` *before* the spec
is finished — e.g. to run a later phase in CI or a shared test env? Use
**`/spec-to-main`**: same rebase + fast-forward, but it leaves the spec
`In Progress` and the worktree standing, and it's repeatable.)

1. **Require a clean worktree.** Step 4 already committed the completion edits, so
   integrate's dirty-tree guard should pass. If the tree is *still* dirty, that's
   unrelated work — offer `/commit` and **stop**; don't sweep it in.
   **If the spec is live** (you took the running instance with `/spec-live`):
   `integrate` is live-aware — it ends the live session first (releases the branch
   back to base, re-isolates it into its worktree, clears the receipt), then prints
   the normal landing plan. Commit any live fixes to the branch first; it refuses
   if the primary checkout is dirty, or if a *different* spec holds it (release that
   one by typing `/spec-live main`). Teardown (step 7) is unchanged.
   **Work-loss abort.** Before it ends the live session, `integrate` checks the
   work is actually landable and **aborts loudly** rather than finalize a spec
   having landed nothing. Two cases, both leaving the live session intact:
   - *stranded commits* — commits sit on the worktree's **detached HEAD** (e.g. a
     pre-fix `/spec-next` committed there instead of on the branch). It prints the
     count, the sha, and a `git -C <worktree> branch <tmp> <sha>` recovery hint —
     recover those commits onto the branch, then re-run.
   - *no worktree* — the spec is live but its worktree is gone. Re-isolate it with
     `skitterspec spec-env up <name>`, then re-run.
   Relay the diagnostic to the user and **stop** — do not tear anything down.
2. **Plan + execute.** Run `skitterspec spec-env integrate <name>` and run the
   printed commands **in order**:
   - `git -C <worktree> rebase <base>` — replay the branch onto base.
   - `git -C <mainRepoPath> merge --ff-only <branch>` — fast-forward base.
   On a **rebase conflict** (non-zero exit), run
   `git -C <worktree> rebase --abort`, relay the conflict, and **stop** — leave it
   to the user; do not tear anything down.
   On a **no-op** ("already landed"), just say so and continue.
3. **Re-test on base.** Run the project's test command from the primary checkout;
   it must be **green** before you call the landing done.
4. **Report** the landing (base branch, fast-forward result). It **never pushes** —
   mention the user can `git push` the base branch themselves.

## 7. Tear down the environment (opt-in, only if configured)

**Only when `specs/.core/env.config.json` exists.** Reclaiming the environment is
what completing a spec *is*, so sub-steps 1–3 run **automatically — do not ask**.
Run the `spec-env` CLI directly (the old `/spec-env-down` skill is gone —
teardown is folded in here).

**The precondition is that the work actually landed.** Only tear down when step 6
completed: it landed (or reported "already landed") **and** the base suite came
back green. A rebase conflict, a work-loss abort or a red suite means step 6 told
you to stop — tear nothing down, because the worktree is where the user picks the
problem up. That precondition is what makes a confirmation redundant: by the time
you get here the branch is an ancestor of base and the engine's guards have
nothing left to protect.

**Opt-out:** if the user passed **`--keep-env`**, skip sub-steps 1–3, say the
worktree and branch are being kept, and go straight to sub-step 4. Mention
`skitterspec spec-env up <name>` re-attaches it later either way.

1. **Disconnect the proxy if this spec is connected.** If `.spec-env/connected`
   names this spec, run `skitterspec spec-env connect main` first so the
   canonical ports go back to the primary checkout.
2. **Stop its host dev servers:** `skitterspec spec-env dev down <name>` (a
   no-op when none are running / configured).
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

3. **Remove worktree + stack + slot:** run `skitterspec spec-env down <name>`
   and execute the commands it prints, in order. After a landing — merged into
   base for a **feature/bug**, captured by the deploy tag for a **hotfix** —
   teardown needs **no `--force`** and drops the branch with `git branch -D`,
   which is safe precisely because the commits are already somewhere else. It
   still respects the guards (won't destroy a dirty, or unpushed-and-unlanded,
   worktree without `--force`), so if it *does* refuse, relay that and stop
   rather than reaching for `--force`.

   **If the plan prints a `remote branch — confirm with the user first:` section, ask before running it.**
   `/spec-start` pushed this branch when it provisioned, so the remote copy
   outlives teardown unless someone deletes it. The planner only ever offers
   this for a branch that has **landed**, so say so plainly when you ask — the
   commits are on the base branch (or captured by the deploy tag), so deleting
   the remote branch loses nothing. On a yes, run the printed
   `git push <remote> --delete <branch>`; on a no, leave it and say the remote
   branch is still there. Never fold it into the `run these:` batch — a project
   that wants it unattended sets `teardown.deleteRemoteBranch: "always"` in
   `env.config.json`, and then it appears in `run these:` instead of here.
4. **Reap orphaned test-DB volumes:** run `skitterspec spec-env prune`. It lists
   Docker volumes in the repo namespace that belong to **no live spec** (no
   worktree) — leftovers from declined/aborted teardowns, manual
   `git worktree remove`, or `--keep-volumes`. Show the user the orphan list and,
   **only on their confirmation**, execute the printed `docker volume rm`
   commands. **This one still asks**, unlike 1–3: it reaps volumes belonging to
   *other* specs, and this spec having landed cleanly says nothing about those.
   Non-fatal: if prune can't run (Docker down) or the user declines, report it and
   finish completing anyway — never block the spec on it. Skip when Docker isn't
   in use (the command self-reports "no orphaned volumes").

**Report from where you now are.** After a teardown you relocated for, the
worktree path in the report is a directory that no longer exists and the landed
work is on the base branch in the primary checkout — say both, so nobody goes
looking for a tree that is gone. A session that was a worktree tab has finished
its job at that point; its shell is the operator's own to close.

**Say what you reclaimed.** With no confirmation step the user never saw this
coming, so the final report must name the worktree path removed and the branch
deleted (or, under `--keep-env`, that both were kept). A teardown nobody
authorised and nobody was told about is the one way this step can lose someone's
place.

If `env.config.json` is absent, skip this entirely — behave exactly as before.

---
name: spec-complete
description: Finish a spec — verify all phases are genuinely done, update progress, then move it into specs/complete/. Targets a spec by name (arg) or the spec currently in context. Use when the user says "/spec-complete", "mark this spec done", or "this spec is complete".
---

# /spec-complete — verify, finalise, archive a spec

> Stay silent while this runs — speak only to ask something you cannot answer
> yourself, or to report a failure at the moment it happens. Read
> `.claude/rules/spec-reports.md` before reporting; it defines the block this
> skill ends with.

## 1. Identify the target spec

- Use the name/path argument if given, else the spec **in context**. If unclear,
  ask which spec.
- Locate the spec folder under `specs/` (usually `specs/in-progress/`). Entry
  point is its `00-overview.md`; phases are separate files (`01-<slug>.md`, `02-…`)
  listed in its phase index (legacy specs may be a bare `<name>.md`).
- **A hotfix already in `specs/complete/` whose worktree still stands** is a
  hotfix waiting on its deploy. That run is the teardown only: go straight to
  step 7's hotfix paragraph, and do not re-verify, re-move or re-land it.

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

**Only when `specs/.core/github.config.json` exists** and the spec's overview
carries a `github_identifier`. Either missing → **skip**, in one line
(`not linked to GitHub — /spec-push to mirror it`), and carry on. Nothing else in
this step changes.

**Refresh the mirror now, without asking.** Run `/spec-push`. The repo has just
become the truth about this spec's state, and the tracker is a generated mirror
of it — leaving them to diverge until someone remembers to push by hand is the
gap this exists to close. It costs one engine call and no model tokens when a
GitHub token is set (see `apply.transport` in `github.config.md`).

- **Never mint.** An unlinked spec is skipped, not created. An issue born closed
  is tracker noise, and a spec kept deliberately local should stay
  that way — `/spec-push` is how someone opts in.
- **Never fatal.** If the push fails — offline, no token, a GitHub error — say so
  and **finish the operation anyway**. The spec is complete/cancelled/reviewed in
  the repo regardless; the mirror is disposable and the next push repairs it.
  Do not roll anything back, and do not stop to ask.
- **Say what happened** in the skill's report: mirror updated, skipped as
  unlinked, or failed with the reason.
- **There is no unassign step, and that is not an omission.** Where the repo owns
  `assignee`, the projection derives it from the spec's lifecycle
  bucket — so moving the folder to `complete`/`cancelled` is *itself* what
  releases the issue, and the push above carries it like any other field. The
  `github_assignee_id` stamp and the `> **Developer:**` header both stay put:
  they record who actioned the work, which outlives who is holding it.

### Why it sits here

In `/spec-complete` and `/spec-cancel` this step is deliberately pinned
**after the `git mv` and before the commit**, and both halves matter:

- **After the move**, because the projection reads a spec's workflow state from
  its folder bucket. Push while the folder is still in `in-progress/` and the
  issue is set to the state the spec is *leaving*.
- **Before the commit**, because the push stamps ids into the spec and writes a
  snapshot under `specs/.core/`. Push after the commit instead and both are left
  uncommitted, which makes `spec-env integrate` refuse to land the branch.

The snapshot is reached **by name**, not by breadth. It is a declared
`spec.companionPaths` entry (`specs/.core/github-base/{identifier}.base.json`),
so `spec-env stage` returns it among this spec's owned paths and the commit below
names it. This is why the commit no longer stages `specs/` wholesale: the one
file outside the spec's folder that had to be swept up is addressable, so the
breadth bought nothing and cost another session's work.

Then **commit the completion edits** — steps 3–4 are this skill's own output, so
it finishes its own work rather than handing you a dirty tree. Ask the engine
which paths are this spec's, then stage and commit **exactly those**:

```
skitterspec spec-env stage <name>     # lists them; --json to consume
git add -- <the owned paths>
git commit -m "chore(spec): complete <name>" -- <the owned paths>
```

**Never `git add specs/`.** That stages a *directory*, so a spec another
session is part-way through writing lands in this commit under this spec's
ticket. The `--` on the **commit** is the other half: a checkout has one
`.git/index`, shared by every session standing in it, so a bare `git commit`
takes whatever else is staged there however carefully you staged your own.
`.claude/rules/spec-planning.md` carries the full account.

So this commits exactly the status flip and the move, and nothing of yours — or
of anyone else's — rides along.
**This is what lets step 6 land:** `integrate` refuses a dirty worktree, so
without committing here the skill would block on the very edits it just made.
Do not `git push`.

## 5. Report

**The block is emitted when the run ends, not where this section sits.** The
sections below run after it, so their outcome belongs in the block — write it
once, at the end, with what actually happened.

End with the block defined in `.claude/rules/spec-reports.md`. That file carries
the shape; this section carries only what is specific here.

**Verdicts**

- `✅` — every phase done, tests green, landed, torn down.
- `⚠️` — finished, with something worth knowing: teardown declined, a tracker
  refresh that failed, a hotfix tag still waiting to be pushed, an after-land
  command that failed.
- `❌` — it acted and stopped part-way — a conflicted rebase, a failed
  cherry-pick, a red base after landing. Say what state the repo is in and quote
  the failure; there is a mess to clear and the reader needs to know where.
- `⏸` — phases are unfinished, tests are red, or the tree is dirty. Nothing
  moved.

**Fields:** `Tracker` · `Spec` · `Tests` · `Notes` · `Landed` · `Worktree` ·
`Follow-ups` · `Next`

`Notes` carries the after-land commands step 6 ran, and where, and any it
skipped because the land matched no `when` — or, on a failure, the command that failed and the ones that did not run. A project with
no `afterLand` says nothing about it.

**Report this spec and no other.** A completion is the moment it is most
tempting to survey what is left — what else is in flight, what is in the
backlog, which worktrees are still standing — and it is the moment it helps
least: the reader has just finished something and cannot tell whether a line
about another spec followed from it. `Next` is one action for this spec, and
`/spec-list` is where the wider picture lives if they want it.

`Landed` says how, because the two ways differ: a fast-forward names the base
and the commit, a hotfix names the release tag, whether it was pushed, and the
`main` carry — and a release tag that has not been pushed is a `⚠️`, not a `✅`. `Worktree` says
what was reclaimed, including any orphaned volumes swept, or that teardown was
declined and the worktree still stands.

## 6. Land the branch (opt-in, only if isolated)

**Only when `specs/.core/env.config.json` exists and the spec was provisioned**
(a worktree in `worktree` mode, or its branch in the checkout in `checkout`
mode — `spec-env integrate` and `down` pick the right plan from `mode`, so the
commands you run differ but these steps do not)
(it was provisioned by `/spec-start` or `/spec-hotfix`). Otherwise skip this entirely
— a non-isolated spec has nothing to land, and `/spec-complete` behaves exactly as
before. When it applies, offer to land the finished branch so the work reaches its
destination in one flow. **How it lands depends on the spec type:**

### 6-hotfix. `Type: Hotfix` — release, push, carry (not fast-forward)

A hotfix is built on an old release **tag**, so it can't fast-forward onto `main`.
The engine runs its landing itself — `hotfix land` releases, pushes and carries,
in that order, and stops at the first step that fails:

1. **Require a clean worktree.** Step 4 already committed the completion edits, so
   this should pass. If the tree is *still* dirty, that's unrelated work — offer
   `/commit` and **stop**. The order matters beyond tidiness: a project's
   `hotfix.releaseWith` (skittership's `release-hotfix.cjs`) refuses a dirty tree
   and an already-tagged HEAD, so the release has to run **after** the §4 commit.
2. **Ask before pushing.** Pushing the tag is what starts the prod deploy, so it is
   the operator's to say yes to — ask once, plainly, naming the tag-to-be and the
   remote (`skitterspec spec-env hotfix land <name> --plan` says what will run).
3. **Land it.** On a yes:

   ```
   skitterspec spec-env hotfix land <name> --push
   ```

   On a no, run it **without** `--push`. Add `--also <tag>` for each extra release
   line to patch (test/demo lines — tag-only, never through `releaseWith`).
   It:
   - **releases** the branch head — through `hotfix.releaseWith` when the project
     set one (its version commit and tag; its one JSON line names the tag), else
     the built-in tagger (`hotfix.bump`: `patch`, or `hotfix-suffix` for
     `X.Y.Z-hotfix.N`). The release is recorded, so a re-run never cuts a second;
   - **pushes** the branch, then the tag, to `origin` — only with `--push`. Without
     it the run **holds** here, exit 0, printing both push commands; a re-run after
     the operator pushes by hand finds the tag on the remote and carries on;
   - **carries** the fix onto `main`: the branch's commits minus the version commit
     and minus anything `main` already has, so the spec's completion commits arrive
     and `main`'s version line does not move. In place when `main` is checked out
     and clean, through a throwaway worktree when it is not checked out, and
     **refused** — with the command to run later — when it is checked out and
     dirty.

   Relay its step lines. A **non-zero exit** is a refusal or a failure at a named
   step — a refused release, a failed push, a conflicted carry (already aborted,
   naming the commit). Relay it and **stop**; whatever was cut is recorded, so the
   fix is to clear the cause and re-run the same command. On a **no-op** ("nothing
   to land"), say so and continue.
4. **Run the after-land commands** when the run ends with a
   `then, in the primary checkout (<path>), run:` section — exactly as step 3
   of 6-feature/bug below says. `hotfix land` prints it only when the carry moved
   `main`, so a held, prod-only or already-carried land has none.
5. **Re-test on `main`** after the carry — it must be **green**.
6. **Report** — `Landed` names the release tag and whether it was **pushed**, and
   what the carry did. A tag cut but not pushed is a `⚠️`, not a `✅`.
   **Then stop: the worktree is kept** (step 7). The branch is what the next
   `-hotfix.N` is cut from if this deploy fails, so it waits for the deploy.

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
3. **Run the after-land commands.** Where the plan ends with a
   `then, in the primary checkout (<path>), run:` section — the project's
   `afterLand`, such as a data migration — run those commands in that
   directory, in order, after the fast-forward succeeds. Run only the lines under that
   heading; a `skipped (nothing in the land matched):` block lists conditional
   entries this land did not need, and is information, never commands.
   **Also on the no-op**:
   the engine prints them there deliberately, because a land made on another
   machine leaves them pending here. **Stop at the first non-zero exit** — a
   later command may depend on it — and carry on with the rest of the skill:
   a failure makes the run `⚠️`, naming the command that failed and the ones
   that did not run, and it
   **never undoes the land and never blocks teardown** (step 7). The land is correct; catching up is the operator's.
   No section, nothing to run, and nothing to say about it.
4. **Re-test on base.** Run the project's test command from the primary checkout;
   it must be **green** before you call the landing done.
5. **Report** the landing (base branch, fast-forward result). It **never pushes** —
   mention the user can `git push` the base branch themselves.

## 7. Tear down the environment (opt-in, only if configured)

**A hotfix is torn down later, by `hotfix finish`.**
It is never torn down here on the run that landed it. Skip sub-steps 0–3 for a `Type: Hotfix` spec that step 6 just landed,
and say the worktree is kept until the deploy is confirmed. When the operator runs
`/spec-complete` **again** on that hotfix — it is already in `specs/complete/` and
already landed — this step is the whole run: `cd` to the primary checkout, then

```
skitterspec spec-env hotfix finish <name>
```

It tears down only when the tree is clean, a release tag is at HEAD and the branch
is on `origin` at HEAD, naming every check that fails; there is no `--force`.
Relay a refusal and stop. Report what it removed in `Worktree`.


**Only when `specs/.core/env.config.json` exists.** Reclaiming the environment is
what completing a spec *is*, so sub-steps 1–3 run **automatically — do not ask**.
Run the `spec-env` CLI directly (the old `/spec-env-down` skill is gone —
teardown is folded in here).

**The precondition is that the work actually landed.** Only tear down when step 6
completed: it landed (or reported "already landed") **and** the base suite came
back green. A failed after-land command is **not** a reason to stop here — the
land stands, and the command is the operator's to re-run from the primary
checkout, which teardown does not touch. A rebase conflict, a work-loss abort or a red suite means step 6 told
you to stop — tear nothing down, because the worktree is where the user picks the
problem up. That precondition is what makes a confirmation redundant: by the time
you get here the branch is an ancestor of base and the engine's guards have
nothing left to protect.

**Opt-out:** if the user passed **`--keep-env`**, skip sub-steps 1–3, say the
worktree and branch are being kept, and go straight to sub-step 4. Mention
`skitterspec spec-env up <name>` re-attaches it later either way.

0. **Name a pass still waiting for THIS spec — before anything is removed.**

   ```
   skitterspec spec-env review waiting --json
   ```

   Filter to the spec being completed and say nothing about any other: a run
   reports itself and nothing else (`.claude/rules/spec-reports.md`). For each
   one, give the code, the verdict and the age, then the two exits — claim it
   now with `/spec-reviewed <code>` **while the worktree still stands**, or
   disown it with `skitterspec spec-env review <spec> --drop <code>`.

   **Why here and not anywhere else.** Nothing is about to become unreachable —
   a pass can be disowned long after its spec is gone. What is about to pass is
   the last moment the verdict can still be **honoured**: before teardown a
   `commit` pass can be claimed and acted on, after it there is no branch left
   to commit to and disowning is all that remains.

   **It reports, and it never blocks.** No refusal, no confirmation of its own,
   no non-zero exit. And **it never claims** — reporting a pass is not taking
   one, and `/spec-diff` §0 is untouched by this step.

   Put what you found in the report's `Notes` row.
   Silent when nothing is waiting, which is the usual case.

1. **Disconnect the proxy if this spec is connected.** If `.spec-env/connected`
   names this spec, run `skitterspec spec-env connect main` first so the
   canonical ports go back to the primary checkout.
2. **Stop its host dev servers:** `skitterspec spec-env dev down <name>` (a
   no-op when none are running / configured).
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

3. **Remove worktree + stack + slot:** run `skitterspec spec-env down <name>`
   and execute the commands it prints, in order. After a landing — merged into
   base for a **feature/bug** (a hotfix never reaches this sub-step; see the top
   of step 7) —
   teardown needs **no `--force`** and drops the branch with `git branch -D`,
   which is safe precisely because the commits are already somewhere else. It
   still respects the guards (won't destroy a dirty, or unpushed-and-unlanded,
   worktree without `--force`), so if it *does* refuse, relay that and stop
   rather than reaching for `--force`.

   **The unpushed half of that guard cannot fire here, by construction.**
   Step 6 landed the branch, so `merged` is true and `planDown` skips the check
   entirely (`env/teardown.js`) — completing a spec never meets it, however the
   branch was or was not published. `/spec-cancel` is where it does fire, because
   a cancelled spec is unlanded and its worktree really is the only copy; the
   publish-or-`--force` path therefore lives in that skill and this one needs no
   equivalent. A refusal reaching this step is about a **dirty tree** instead,
   which means something wrote into the worktree after the landing — read it,
   don't force it.

   **If the plan prints a `remote branch — confirm with the user first:` section, ask before running it.**
   Nothing published this branch for you, so a remote copy exists only because
   you pushed it by hand — and it outlives teardown unless someone deletes it. The planner only ever offers
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

---
name: spec-start
description: Put a spec in flight — provision its branch, move it to in-progress, refresh the tracker, then build phase 1. Commits the spec itself when that is all that is uncommitted, and refuses to touch anyone else's unfinished work. Use when the user says "/spec-start", "start this spec", or "begin implementing <spec>".
---

# /spec-start — put a spec in flight

> Stay silent while this runs — speak only to ask something you cannot answer
> yourself, or to report a failure at the moment it happens. Read
> `.claude/rules/spec-reports.md` before reporting; it defines the block this
> skill ends with.

One checkout, one spec in flight. This skill is how a spec gets there:
provision, move it to `in-progress`, refresh the tracker, then hand straight on
to `/spec-next` for phase 1. Continuing a spec afterwards is `/spec-next`;
finishing it is `/spec-complete`.

## 1. The gate — what each mode demands of the tree

**Check this first, before resolving anything or touching a file.** What the
gate demands depends on the mode, because the two modes hold work in different
places — read `mode` from `specs/.core/env.config.json` (default `worktree`).

**`worktree` mode — there is no tree gate.** The spec is built in its own
worktree, so neither another spec being in flight nor its uncommitted files are a
conflict; both are the parallelism the mode exists for. `git worktree add`
carries nothing and forks from a commit, and the one thing this run writes into
the checkout — the spec's own commit, which `spec-env up` plans for you — names
its paths on both the `add` and the `commit`, so it cannot reach a file that is
not this spec's. Work belonging to someone else is **reported and left alone**,
never a refusal. Nothing is switched here and nothing is parked.

**`checkout` mode — the workbench must be free**: on the base branch (`main`, or
the configured `baseBranch`) and clean, since the branch is built right here and
this mode holds one spec at a time. If it isn't, relay what is in flight and
stop — name the spec holding the checkout and the two ways out, then end your
turn:

- **`/spec-complete`** — it's finished; land it and free the workbench.
- **`/spec-cancel`** — it isn't wanted; record why and free the workbench.

**Never get past the gate yourself.** Do not stash, do not commit
**another spec's** work, do not switch branches for them. An uncommitted tree
and a half-built phase are each a decision someone must make deliberately — and
the cost of guessing is another spec's work moved without its author asking. A
refusal costs one command; the alternative can cost an afternoon.

**What `spec-env up` does with the tree**, in both modes — relay what it says
rather than deciding for yourself:

| What it found | `worktree` | `checkout` |
|---------------|-------------|-------------|
| clean | provisions | provisions |
| every path is this spec's | commits those paths **first**, then forks | same, then switches |
| some path is not | commits this spec's, provisions, **reports the rest** | refuses, naming them |

That is membership in an exactly-known set — the spec's own folder plus the
project's `spec.companionPaths` — and **not** a judgement about whether the
changes look important. It never decides that.

**The last row is the only real difference, and it is mechanical.**
`git switch -c` carries the working tree onto the new branch, so in
`checkout` mode a colleague's files really would be moved without them asking.
`git worktree add` carries nothing, so in `worktree` mode the same files are
simply not this run's business — and refusing over them fired on the commonest
tree this workflow produces: a second spec authored while the first is still
uncommitted. When it reports them, say how many and whose in the `Untouched` row
and **keep the verdict `✅`** — nothing went wrong.

When it plans the commit, the paths are printed above the commands, so run them
as printed; when it refuses, relay the reason and stop.

It also refuses a **clean** tree whose spec is not in the commit the worktree
would fork from — otherwise you get a branch missing the very spec it is for.

**A spec that `/spec` already landed is the HEALTHY case of that check.**
It is not the refusal. `/spec` authors in its own `--docs` worktree and its committing
verdict fast-forwards the base branch, so by the time `/spec-start` runs the
spec is already in the commit the worktree forks from and the tree is clean —
which is exactly what that check is looking for. Do not read "clean tree,
nothing to commit" as a sign something was skipped: it means the landing worked.

**And the worktree may already exist**, because `Commit & Start` keeps it. That
is a re-attach, not a clash: `spec-env up` plans the attach form rather than a
second `-b` fork, and its `then, run:` line — `spec-env bootstrap <name>`,
without `--docs` — is where the `setup` commands `--docs` deliberately skipped
finally run. So run it — the install belongs to this moment, the first at which
the tree is used for code — and report a re-attach rather than a fresh
provision.

## 2. Identify the spec

- Use the name/path argument when given.
- Otherwise use the spec **in context** (the one just created or discussed).
  Unlike `/spec-next`, that fallback is safe here: this skill starts nothing
  without the gate above passing, and a wrong guess is caught by the operator
  before any code is written.
- Locate it under `specs/` — `specs/backlog/` first, then the other buckets. A
  spec is a `<name>/` folder whose entry point is `00-overview.md`, with one
  file per phase beside it (`01-<slug>.md`, `02-…`). Legacy specs may be a bare
  `<name>.md`, or a `00-overview.md` with inline phases — handle those too.
- A spec already in `specs/in-progress/` was started before. Its worktree
  probably still exists, so this is a re-attach: say so rather than reporting a
  fresh start, and skip the housekeeping that is already done.

## 2b. Bring the review server up — from here, before anything else

**Only when the project has per-spec isolation** (`specs/.core/env.config.json`
present). Without it there is no review server and this step does not exist —
skip it in silence rather than explaining an absence.

```
skitterspec spec-env review serve --host 0.0.0.0
```

**Here is the point.** Right now this session is standing in the
**primary checkout**, and in a moment step 3 `cd`s into a worktree and stays
there. A
daemon started after that `cd` is started *by the worktree's copy of the code* —
and when `/spec-complete` removes that worktree, the daemon keeps answering on
its port and fails on every page it is asked for, for every spec. The engine
defends against that now, but the cheapest fix is to never create the situation:
start it while you are still somewhere that outlives the spec.

It is also what lets **several specs be reviewed at once**. Reviews all render
into the primary checkout's `.spec-env/reviews/`, so one server serves every
provisioned spec — including specs another agent is building in another
worktree. Starting it here means that one server belongs to the checkout none of
them can delete.

**Say nothing when it is already up.** The usual outcome is adoption — a server
is running and this changes nothing — and a line per `/spec-start` about a
daemon nobody asked about is the narration `.claude/rules/spec-reports.md`
forbids. Speak only if it could not start.

**Never fatal, never a gate.** A busy port, no network address, a refused
spawn — say it in one line and **carry on**; provisioning is not conditional on
it, and the page falls back to its `file://` URL exactly as it does today.

**`--host 0.0.0.0` is the deliberate half.** It binds the server to this
machine's network addresses so the page opens on a phone, and the engine mints a
token with that bind as its only guard. On a machine you would rather not expose,
drop the flag — the server is then reachable from this machine alone and the
render says so. On **`--plan`** this step does not run at all.

## 3. Build its branch

### `worktree` mode

**One path. There is no branching here and none should be added back.**

1. **Provision.** Run `skitterspec spec-env up <name>` — a planner, so run the
   `to provision, run:` commands it prints and confirm they succeeded.

2. **Trust the worktree.** `spec-env up` wrote the printed `trusted:` root into
   `.claude/settings.local.json`, but that file does not hot-reload in this
   session — run **`/add-dir <trusted root>`** before editing into the worktree,
   or the first write prompts. This is not tab machinery: worktrees live outside
   the checkout, and the trust entry is what stops the prompt.

3. **Bootstrap it, and move into it.** The `cd` is in the command itself, and it
   **moves this session** — that is what it is for, not a side effect of it. The
   Bash working directory persists between calls, so from here on this session is
   standing in the worktree, which is what lets a bare `/spec-next` resolve the
   spec on its own:

   ```
   cd "<worktreePath>" && skitterspec spec-env bootstrap <name>
   ```

   That is the planner's `then, run:` line, with the `cd` in front. It seeds
   the gitignored files before `setup` itself — a fresh worktree has neither, so
   hooks, typechecks and tests fail until both have happened — and stops at the
   first step that fails, naming it. Relay its step lines; a non-zero exit is a
   failure to report at the moment it happens, not a reason to run the steps by
   hand.

   **The worktree steps are the engine's to run, never yours.** Seeding the
   gitignored files, the env file, `setup` and the stack all happen inside
   `skitterspec spec-env bootstrap <name>` — one call that names no file. Do not
   reconstruct them as shell: they used to be printed that way, an agent's copy was
   never faithful, and a project's secrets hook refused every rewrite that named a
   `.env` path. `bootstrap --plan` says what it would do, for reading only.

   **Then confirm the move landed — never assume it.** Ask for a positive signal
   rather than reading silence as success (`.claude/rules/negative-checks.md`
   rule 1): run `skitterspec spec-env resolve` with **no argument** and read the
   `spec:` line it prints.

   ```
   skitterspec spec-env resolve        # must name this spec
   ```

   Three states, not two. It names this spec → carry on. It names something else,
   or resolves nothing → **the `cd` did not take**. Say so plainly and fall back
   to the stop-here ending in step 6, printing the path so the operator can open
   a session there themselves; do not build a phase from a session whose location
   you could not confirm. A failed `cd` leaves you in the primary checkout on the
   base branch, where a phase's worth of code looks entirely normal at the time.

4. **Housekeep with `git -C <worktreePath>`** — step 4 below, against the
   worktree.

   **Keep the `-C` prefix**, even though the session is inside the worktree now
   and a bare `git` would usually do the same thing. It is immune to the one
   failure this sequence can have — a `cd` that silently did not take — where a
   bare `git` would instead write the spec's move into the primary checkout on
   the base branch. It costs nothing and removes a whole failure mode, so do not
   tidy it away.

5. **Print the worktree path.** What happens next is step 6 — it is offered
   there, not decided here.

**The session moves into the worktree, and nothing opens a window.** Those are
two different claims and both are load-bearing. The move is real, and the `cd` in
step 3 is its whole mechanism — no tool call, because an approval prompt is
unusable on a phone and leaves the session stuck. Nothing is *spawned*: no new
terminal, no tab, no editor sent anywhere, because that machinery had nothing
left to do and was removed deliberately.

**Do not move the branch into this checkout**, and do not ask the operator to.
`/spec-live` is for testing a finished-enough spec on the already-running dev
server; it is not how work gets started.

**`/spec-next`'s refusal is unchanged by this.** Its rule 2 — "the worktree you
are standing in" — is what answers afterwards, and step 3 is what puts the session
there; nothing about rules 1 to 3 is loosened, and it must stay that way, because
the refusal exists so the wrong branch is never built. What changed is where the
session stands, not how weakly the rules read: a bare `/spec-next` typed from
somewhere that is neither a worktree nor a live checkout still refuses exactly as
it did. `--worktree <path>` survives untouched beside it — it answers before those
rules and cannot be reached by guessing.

**And the `cd` is a convenience, not the only thing holding this together.**
`/spec-next`'s **rule 4** asks the engine for the sole provisioned spec, so a
bare `/spec-next` resolves this spec from anywhere in the repo — after a
`/clear`, from a new tab, tomorrow morning. That is what makes step 6's
stop-here ending an honest offer rather than a promise only this session can
keep. Do not delete rule 4 as redundant with the `cd`: the `cd` is session state,
and rule 4 is what is left once it is gone.

### `checkout` mode

Run `skitterspec spec-env up <name>` and the single `git switch` it prints.
There is no worktree, no bootstrap and no hand-off — the checkout is already the
workbench. Its planner enforces the same gate from the engine side, so relay any
refusal and stop.

## 4. Move the spec into development

**Do this before you report anything**, so no path can end with a provisioned
worktree and a spec still reading `Ready` in `specs/backlog/`. In `worktree` mode
run it against the worktree with `git -C <worktreePath>`; in `checkout` mode the
branch is already here.

- `git mv "specs/backlog/<name>" "specs/in-progress/<name>"` if it isn't there
  already (`mkdir -p specs/in-progress` first). Use `git mv` to keep history.
- Set the **Status** header: `> **Status:** In Progress — Phase 1 (started <YYYY-MM-DD>)`.
- Set **Developer** if it is still `—` (`git config user.name`).



- Append a **State log** row: `| <YYYY-MM-DD> | In Progress | in-progress | <git user.name> |`.



- **Commit it.** One commit, the spec's own — it records the in-progress state on
  the branch, and sweeps up everything above so the worktree is clean when you
  hand it over.

**Publishing that branch is yours to do, and nothing here does it for you.**
Whenever you want the work somewhere other than this machine:

```
git -C <worktreePath> push -u origin <branch>
```

Print it if it is useful; never run it. This skill once pushed here, justified as
recording the state "for everyone" and firing the tracker's automation — and
neither half survives reading. The automation needs `{identifier}` in
`branch.pattern` (see `env.config.md`) to put an issue id in the branch name, and
the shipped default carries none, so the tracker has nothing to match. Nor was it
an invariant: `/spec-bug` provisions a worktree the same way and has never
pushed, and `/spec-hotfix` forbids it outright. This was the odd one out.

**It also kept a guard from ever firing.** `refuseTeardownIfUnpushed` blocks
teardown on commits that are unpushed and unlanded — which described no branch at
all while this skill published every one of them at provisioning. It can fire now,
and the place it does is `/spec-cancel`, where the work really is about to be
destroyed: that skill relays the refusal and offers both ways out. Nothing to do
here beyond knowing it is no longer dead code.

A spec ideally arrives `Ready` from `/spec`; a `Draft` works too — sanity-check
it is well-formed first.

- **Report anything left waiting, and claim none of it.** Ask the engine once:

  ```
  skitterspec spec-env review waiting
  ```

  A pass listed here arrived when nothing was watching — a wait that never ran,
  a session cleared, a terminal closed overnight — and no watcher can recover
  those, however good. Relay what it prints: the spec, the code, the verdict and
  the age, with `/spec-reviewed <code>` to pick one up and `--drop <code>` to
  disown it.

  **It is information, not a gate.** It never refuses, nothing here is
  conditional on it, and **you never claim one** — `/spec-diff` §0 stands
  unchanged, and a pass sitting there when you arrived was not sent to you.
  Silent when nothing is waiting, which is the usual case: say nothing rather
  than reporting that there was nothing to report.


## 4b. Note a missing gating decision (only if configured)

**Only when `specs/.core/gating.config.json` exists.** Run
`skitterspec gating check <name>` and, if it names this spec, mention it **once**
before phase 1 starts — the cheapest moment to decide is before any code exists.

**This check is advisory.** It reports; it never refuses, and nothing below is
conditional on it. A spec written before the project adopted gating has no header
and is not broken — turning this into a gate would accuse the very specs the
feature was designed not to disturb.

## 5. Bring the spec's dev servers up — confirm before heavy steps

**Only when the project configures host dev servers** (`env.config.json` → a
non-empty `dev` array). Show what will start — the commands, the ports, any
Docker stack — and get a yes; on **`--plan`**, print it and stop. On
confirmation run `skitterspec spec-env dev up <name>`. With none configured this
is a clean no-op.

To reach the spec at your normal `localhost` URL afterwards, the **user** types
**`/spec-connect <name>`** (`/spec-connect main` hands the ports back). Never
invoke it yourself.

## 6. Build phase 1

**`checkout` mode — carry straight on into `/spec-next`** in this session: it
marks phase 1 started, refreshes the mirror again, builds it with tests and
reports. Do not stop and ask the operator to run it: the branch is here and they
asked to start the spec.

**`worktree` mode — offer it, then do what they say.** Step 3 left this session
standing in the worktree, so both endings happen right here and neither needs a
second session opened anywhere. In prose: say the worktree is ready and name its
path, then ask **"build phase 1 now?"** — recommending that they do, and naming
both endings so the decline is a real answer rather than a formality.

**Never fence that question.** A grey box is read as an artefact to skim rather
than as something someone is being asked, which is the whole reason
`.claude/rules/spec-reports.md` bans fencing a message to the reader. This step
prescribed a fenced block for a long time and an operator read straight past it,
which is the evidence, not a preference.

- **Build it here** — carry on into a bare **`/spec-next`**. Bare is right: the
  session is in the worktree, so its rule 2 resolves this spec with nothing
  passed and nothing guessed.
- **Stop here** — the operator is left standing in the worktree on a provisioned
  branch, which is a perfectly good place to leave things. Nothing has to be
  reopened or handed anywhere, and `/spec-next` typed an hour later — from this
  session or a fresh one — does exactly what it would have done now.

**Ask rather than deciding for them, and mean it.** Provisioning is cheap and
reversible; a phase build is neither, and one yes should not cover both. A large
phase is often better started in a session of its own with a whole context budget
to spend, and only the operator knows which this is. On **`--plan`** this step
does not run at all — nothing was provisioned to build in.

**`--worktree <path>` is still there, and is still not a way around the refusal.**
It builds a spec the session is *not* standing in, which after step 3 is the
exception rather than the normal path. Reach for it in exactly two cases: the
confirm in step 3 reported the `cd` did not take, or you deliberately mean to
build some other spec's phase from here. A path someone typed is not a path
anything guessed, which is why it was never a loosening of the refusal and still
is not.

## 7. Report

**When step 6 carried on into `/spec-next`, emit no block here.** That skill ends
with its own, and its `Branch` and `Spec` fields already carry everything this
one would say. Two blocks for one run is the noise the contract exists to
remove — this section is for the run that stops at step 6.

End with the block defined in `.claude/rules/spec-reports.md`. That file carries
the shape; this section carries only what is specific here.

**Verdicts**

- `✅` — the branch is provisioned, the spec is `in-progress`, the session is
  standing in the worktree.
- `⚠️` — provisioned, with something worth knowing (dev servers that did not
  come up, a mirror that did not refresh, a missing gating decision).
- `❌` — provisioning failed part-way and left something behind. Say what, and
  where.
- `⏸` — the gate refused: in `checkout` mode a dirty tree or someone else's
  unfinished work, in either mode a spec whose own files are not in the commit
  the worktree would fork from. Nothing changed. Another spec's uncommitted work
  is **not** on this list in `worktree` mode — it is an `Untouched` row on a
  `✅`.

**Fields:** `Tracker` · `Branch` · `Spec` · `Worktree` · `Untouched` · `Follow-ups` · `Next`

`Worktree` carries the path, because the session is now standing in it and the
operator's next command depends on knowing that. `Next` is `/spec-next`.

`Untouched` appears only when `spec-env up` reported uncommitted work that was
not this spec's — say how much and whose, and **keep the verdict `✅`**. Nothing
went wrong: a worktree carries nothing, so that work was never in play.

On **`--plan`** nothing was provisioned, so the verdict is `⏸` and `Built`
carries the plan rather than a claim about the repo.

## Opt-outs

- **`--plan`** — print the provisioning and dev-server plan, change nothing.
- **`--no-worktree`** — skip provisioning and build on the current branch. Warn
  that the work lands wherever you are (usually the base branch); reserve it for
  a trivial change or an explicit request.

There is no `--here`. It existed to ask for the branch in the checkout you are
standing in — and in `checkout` mode that is already what happens, while in
`worktree` mode `--no-worktree` is the way to say it.

## Why this skill links nothing, but does mirror what it changes

This skill creates no spec and mints no issue, so it has **nothing to link** —
the intake and picker steps belong to `/spec`, `/spec-bug` and `/spec-hotfix`.

It does push, though, and that is step 4's seam. The state change it makes — the
spec moving to `in-progress` with a developer stamped on it — is mirrored by the
skill that makes it, exactly as `/spec-complete`, `/spec-cancel` and
`/spec-review` mirror theirs. It was once reasoned that the refresh `/spec-next`
runs would cover it, so a push here would send the same thing twice one commit
apart. That only ever held in `checkout` mode, where `/spec-next` follows
immediately; in `worktree` mode it can be hours away or never come, and the
issue sits in its old state with nobody assigned meanwhile.

The **assignment** seam just above it is still not a push, and does not need to
be. This is the one moment in the lifecycle where "who is building this" is
actually decided — the branch is being provisioned for someone, and that someone
is at the keyboard. It stamps the spec file and stops there, so it costs no
tracker call and rides out on the push below like every other field. Deferring
the stamp to `/spec-next` would be worse than untidy: in `worktree` mode the two
can be separated by hours, and a spec in flight with nobody named on it is
exactly the gap assignment exists to close.

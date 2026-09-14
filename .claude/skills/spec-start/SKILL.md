---
name: spec-start
description: Put a spec in flight — provision its branch, move it to in-progress, refresh the tracker, then build phase 1. Commits the spec itself when that is all that is uncommitted, and refuses to touch anyone else's unfinished work. Use when the user says "/spec-start", "start this spec", or "begin implementing <spec>".
---

# /spec-start — put a spec in flight

One checkout, one spec in flight. This skill is how a spec gets there:
provision, move it to `in-progress`, refresh the tracker, then hand straight on
to `/spec-next` for phase 1. Continuing a spec afterwards is `/spec-next`;
finishing it is `/spec-complete`.

## 1. The gate — refuse unless the workbench is free

**Check this first, before resolving anything or touching a file.** What the
gate demands depends on the mode, because the two modes hold work in different
places — read `mode` from `specs/.core/env.config.json` (default `worktree`).

**`worktree` mode — the tree must be clean, and that is all.** The spec is built
in its own worktree, so another spec being in flight is not a conflict; it is the
parallelism the mode exists for. The only requirement is that this checkout has
no uncommitted work — *except* the spec you are starting, which `spec-env up`
commits for you (see below). Nothing is switched here and nothing is parked.

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

**The one exception is the spec you are starting.** `spec-env up` classifies the
uncommitted tree against the target spec and answers one of three ways — relay
what it says rather than deciding for yourself:

| What it found | What it does |
|---------------|--------------|
| clean | provisions, as always |
| every path belongs to this spec | plans `git add` + `git commit` **first**, then the fork |
| any path does not | refuses, naming the paths that disqualified it |

That is membership in an exactly-known set — the spec's own folder plus the
project's `spec.companionPaths` — and **not** a judgement about whether the
changes look important. The gate still never decides that. When it plans the
commit, the paths are printed above the commands, so run them as printed; when it
refuses, relay the reason and stop.

It also refuses a **clean** tree whose spec is not in the commit the worktree
would fork from — otherwise you get a branch missing the very spec it is for.

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

## 3. Build its branch

### `worktree` mode

1. **Provision.** Run `skitterspec spec-env up <name>` — a planner, so run the
   `to provision, run:` commands it prints and confirm they succeeded, **except**
   the `open.command` line, which belongs to the hand-off in 3 below.

2. **Enter the worktree — this session, no new window.** The spec is built in its
   worktree; that is what the mode is for, and it is why `main` stays free and
   several specs run at once. So put *this* session there rather than opening
   another one: call **`EnterWorktree`** with the worktree path.

   **Do it immediately after `git worktree add`, before bootstrap and before the step 4 housekeeping.**
   Once the session is the worktree, `setup` runs in place and the housekeeping
   is plain `git` — the `cd` and the `git -C <worktreePath>` prefix both
   disappear. **Never `cd` into the worktree first:** `EnterWorktree` refuses a
   path that is already the working directory
   (`is the current working directory`), so a bootstrap `cd` does not merely
   make the call redundant, it makes it fail.

   Then run the planner's **`then, in the worktree, run:`** steps in order (file
   seeding, then `setup`) — a fresh worktree has no dependencies and none of the
   repo's gitignored files, so hooks, typechecks and tests fail until they are
   there. Do the step 4 housekeeping, then say to run **`/spec-next`**, here.

   **Do not move the branch into this checkout**, and do not ask the operator to.
   Entering the worktree is the opposite of moving the branch out of it — the
   branch never leaves. `/spec-live` is for testing a finished-enough spec on the
   already-running dev server; it is not the way work gets started, and reaching
   for it here is what used to split a start across two invocations.

3. **When you cannot enter, hand off as before.** Two cases, and
   **decide from cwd before calling**, not by calling and catching — an error
   surfaced mid-skill reads as a bug, and both conditions are knowable in
   advance:

   - **This session's cwd is already inside a worktree.** `EnterWorktree` only
     allows a worktree→worktree switch when the target lives under
     `.claude/worktrees/`, and a project's worktree root usually does not
     (`../{repo}-wt` is the shipped shape). Do not "fix" this by relocating the
     root: starting a spec from the base branch is the documented path anyway.
   - **`EnterWorktree` is unavailable** — a harness without it. There is no CLI
     counterpart to fall back on, so the skill degrades rather than fails.

   On either, do exactly what this skill did before: bootstrap with
   `cd "<worktreePath>"`, housekeep with `git -C <worktreePath>`, run
   `open.command` if one is configured, print the worktree path, and say to run
   **`/spec-next`** from a session in it.
   **Trust the worktree first** on this path: `spec-env up` wrote the printed
   `trusted:` root into `.claude/settings.local.json`, but that file will not
   hot-reload in this session — run `/add-dir <trusted root>` before editing into
   the worktree, or the first write prompts. (Entering the worktree makes both
   moot: the writes are then in-cwd.)

   `EnterWorktree` is gated on being told to work in a worktree by the user or by
   project instructions. A lifecycle skill directing it **is** project
   instruction, so the call is in contract here.

**`/spec-next` is unchanged by this.** Its rule 2 — "the worktree you are
standing in" — is what answers once the session has actually moved; nothing about
its resolution is loosened, and it must not be. The refusal exists so the wrong
branch is never built.

### `checkout` mode

Run `skitterspec spec-env up <name>` and the single `git switch` it prints.
There is no worktree, no bootstrap and no hand-off — the checkout is already the
workbench. Its planner enforces the same gate from the engine side, so relay any
refusal and stop.

## 4. Move the spec into development

**Do this before you report anything**, so no path can end with a provisioned
worktree and a spec still reading `Ready` in `specs/backlog/`. Having entered the
worktree (step 3.2) this is plain `git` — you are standing in it. On the hand-off
path (step 3.3) run it against the worktree with `git -C <worktreePath>` instead;
in `checkout` mode the branch is already here.

- `git mv "specs/backlog/<name>" "specs/in-progress/<name>"` if it isn't there
  already (`mkdir -p specs/in-progress` first). Use `git mv` to keep history.
- Set the **Status** header: `> **Status:** In Progress — Phase 1 (started <YYYY-MM-DD>)`.
- Set **Developer** if it is still `—` (`git config user.name`).
- Append a **State log** row: `| <YYYY-MM-DD> | In Progress | in-progress | <git user.name> |`.
- **Commit it, and push the branch.** One commit, the spec's own — it records the
  in-progress state for everyone and fires the tracker's automation. Do this
  *before* the tracker refresh below, so the snapshot that refresh writes is
  swept up by the phase's own commit rather than left dirty.

A spec ideally arrives `Ready` from `/spec`; a `Draft` works too — sanity-check
it is well-formed first.

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

**`worktree` mode — the spec is built in its worktree**, and step 3.2 put this
session there, so end by saying the worktree path is now the session's and to run
**`/spec-next`** here. On the hand-off path (step 3.3) the session did not move:
say so plainly, print the path, and tell them to run `/spec-next` from a session
in it.

`/spec-next` resolves the spec it is *standing in* — the live spec of the
checkout, the worktree its cwd is inside, or the branch in `checkout` mode — and
a name argument narrows a re-run rather than selecting a spec elsewhere. That
refusal is deliberate: building the wrong spec's phase writes commits on a branch
nobody asked for. **Do not work around it**, and do not offer to build the phase
from here.

## Opt-outs

- **`--plan`** — print the provisioning and dev-server plan, change nothing.
- **`--no-worktree`** — skip provisioning and build on the current branch. Warn
  that the work lands wherever you are (usually the base branch); reserve it for
  a trivial change or an explicit request.

There is no `--here`: `/spec-start` **is** here. It puts the branch in the
checkout you are in, which is what the old opt-out was reaching for.

## Why there is no tracker seam here

This skill creates no spec and mints no issue, so it has nothing to link — the
intake and picker steps belong to `/spec`, `/spec-bug` and `/spec-hotfix`. The
state change it *does* make (the spec moving to `in-progress`) is mirrored by
the refresh `/spec-next` runs the moment it starts, which pushes the issue state
and the phase states together. Adding a push here would send the same thing
twice, one commit apart.

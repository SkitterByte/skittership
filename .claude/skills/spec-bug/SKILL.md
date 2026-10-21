---
name: spec-bug
description: Investigate a bug, capture it as a Bug-type spec, and drive it red→green. ALWAYS starts by reproducing the bug with a failing test, then writes the spec and works the test to green — on the bug's own branch, never on main. Use when the user reports a bug, says "/spec-bug", "investigate this bug", "this is broken — find and fix it", or pastes an error/stack trace.
---

# /spec-bug — investigate a bug, prove it with a failing test, fix it

> Stay silent while this runs — speak only to ask something you cannot answer
> yourself, or to report a failure at the moment it happens. Read
> `.claude/rules/spec-reports.md` before reporting; it defines the block this
> skill ends with.

This is the **bug** counterpart to `/spec` (which is for **features**, plan-only).
Unlike `/spec`, this skill is hands-on and test-first: it reproduces the bug as a
**failing test (RED)**, captures a lean Bug spec, then works the test to **GREEN**.

Spec type convention (see `.claude/rules/spec-planning.md`):
- Bug specs are named `bug-<kebab-name>`; feature specs `feat-<kebab-name>`.
- Every spec header carries `> **Type:** Bug` (or `Feature`).



## 1. Reproduce & isolate (light investigation)

Bugs are concrete — confirm, don't over-grill. Establish:

- **Repro:** exact steps / input that triggers it. Ask only if you can't derive it.
- **Expected vs actual:** what *should* happen vs what does.
- **Scope & blast radius:** which module(s)/endpoint(s)/package; one tenant or all.
- **Root cause:** read the code, trace it to `file:line`. Compare a working path
  against the broken one (the bug usually lives in the differential). Do NOT
  patch a symptom before you understand the cause.

## 2. Isolate the fix in a worktree — when isolation is enabled

**Only when per-spec isolation is enabled** (`specs/.core/env.config.json`
exists). Skip this whole section otherwise — the fix happens in place, on the
current branch.

**Opt-out:** if the user passes `--no-worktree` (or explicitly asks to work in
place), skip this whole section and fix on the current branch — same as when
isolation is off. Warn that the fix will land wherever you currently are (usually
`main`); reserve it for a trivial one-liner or an explicit request.

A bug fix changes real source, so — exactly like `/spec-start` — it belongs on the
bug's **own branch**, never directly on `main`. Provision the worktree **now**,
before the failing test, so the test, the fix, and the spec all land together and
arrive as one reviewable PR.

**Provision before you write, not after.** §1 put nothing on disk and the bug's
name is settled by the end of it, so this is the one moment where a worktree
costs nothing to obtain and everything — the red test, the fix, the spec — is
still ahead of it:

```
skitterspec spec-env up bug-<name> --docs
```

**The spec does not exist yet, and that is the lane.** `up` opens its authoring
branch on exactly three signals — a spec it could not find, `--docs`, and a name
shaped `bug-<something>` — records the branch so the name resolves from here on,
and prints a `git worktree add … -b bug/<name>` forked from `main`. Run it, and
the `skitterspec spec-env bootstrap bug-<name> --docs` under `then, run:` where
there is one, then move this session into the worktree with a plain `cd`; the Bash
working directory persists between calls, so from here on the test, the fix and
the spec are all written on the bug's own branch. Confirm the move landed rather
than reading silence as success (`.claude/rules/negative-checks.md` rule 1):
`skitterspec spec-env resolve` with no argument must name this spec. If it does
not, say so and stop rather than writing into a tree you cannot name.

**Then run `up` again, without the flag:**

```
skitterspec spec-env up bug-<name>
```

`--docs` skips the `setup` commands — everything whose only purpose is making a
tree *runnable* — because provisioning somewhere to write markdown should cost a
`git worktree add` and nothing else. `/spec` leaves them to `/spec-start`, but
**there is no `/spec-start` in a bug's life**: §3 runs the project's suite three
steps from here, in this same tree, and
**a tree that cannot run the suite cannot go red**.
The flagless re-run re-attaches the worktree that now exists
(no second `-b` fork) and prints `skitterspec spec-env bootstrap bug-<name>` —
run it, and it runs the steps the flag deferred.

**The worktree steps are the engine's to run, never yours.** Seeding the
gitignored files, the env file, `setup` and the stack all happen inside
`skitterspec spec-env bootstrap <name>` — one call that names no file. Do not
reconstruct them as shell: they used to be printed that way, an agent's copy was
never faithful, and a project's secrets hook refused every rewrite that named a
`.env` path. `bootstrap --plan` says what it would do, for reading only.

**Why the stub is no longer seeded on the base branch.** This step used to open
by writing `specs/in-progress/bug-<name>/00-overview.md` in the primary checkout
for the engine to resolve, and `main` is where work **lands**, not where it
happens: where the project installs `.claude/hooks/main-guard.cjs` that write is
refused, and the skill's documented first instruction becomes the one thing the
repo will not do. Nothing is seeded and nothing is moved now — the spec is
written in the worktree, at §4, on the branch it belongs to.

- **Bootstrap the worktree.** A fresh worktree has no installed dependencies and
  none of the repo's gitignored files (`.env`, local overrides). Run the printed
  `in the worktree, run:` steps (file seeding, then `setup`) in order, before
  anything else.
- **Trust the worktree for this session.** The engine wrote the printed
  `trusted:` root into `.claude/settings.local.json`, but it won't hot-reload now
  — run `/add-dir <trusted root>` before editing into the worktree, or the first
  edits will prompt.
- **Do everything below in the worktree**, on the branch — the red test, the fix,
  and the rest of the spec. The `cd` above is what makes that the default rather
  than something to remember; where a step has to reach out of the tree, use an
  absolute path or `git -C <worktreePath>`. `main` changes only when the branch
  merges (at `/spec-complete`).

## 3. Write the failing test FIRST (RED) — mandatory

Encode the **correct** (expected) behaviour as a test, then run it and confirm it
**fails for the right reason**:

- Put it where the suite already covers that area. Reuse existing test helpers /
  factories; follow the project's test rules (see `.claude/rules/`). Never
  hardcode dates — compute them relative to now.
- Run it with the project's test command. Quote the red output. A test that
  passes before the fix proves nothing — keep refining the assertion until it
  genuinely captures the bug.

## 4. Write the Bug spec

Write the spec's entry point `00-overview.md`. **When isolated**, you are already
standing in this spec's own worktree — §2 provisioned it and moved you there, so
create the folder and write it here, on the bug's branch. Nothing was seeded
ahead of it and nothing is moved across.
**When not isolated**, create the spec **folder**
`specs/in-progress/bug-<kebab-name>/` with its entry point `00-overview.md` now
(every spec is a folder — never a bare file). A bug is
usually a single-pass fix, so the `## Fix` block can live directly in
`00-overview.md`. **If the fix needs phasing** (large/uncertain root cause),
split it into phase files (`01-<slug>.md`, `02-…`) with a phase index in
`00-overview.md`, exactly like a feature spec. It starts in `in-progress`
because work is already underway. Keep it lean:

```markdown
# Bug: <short title>

> **Type:** Bug
> **Name:** bug-<kebab-name> (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — fixing (red test added)
> **Author:** <git user.name — who reported/captured it>
> **Developer:** <git user.name — you, since you're fixing it now>
> **Raised:** <YYYY-MM-DD (today)>
> **Area:** <files/modules>
> **Gating:** <flag name — or "none: <one-line reason>". Only when release gating
> is configured; omit the line entirely otherwise>

## Symptom

<observed wrong behaviour + repro steps; paste the error/stack if any>

## Root cause

<the actual cause, at `file:line`. One paragraph — be specific.>

## Failing test (red)

<test name + path; what it asserts. How to run it. Paste the red failure line.>

## Fix

- [ ] <the minimal change that addresses the root cause, not the symptom>
- [ ] Failing test now passes (GREEN); run the project's typecheck and test
      commands — confirm no regressions.
- [ ] <any follow-up hardening, or "None">

## Impact

<The concrete surfaces this spec touches — the scannable blast radius, so a
reader can eyeball where the spec got something wrong without reading prose.
`Change` is `add` · `update` · `remove`. `Surface` is guided-but-open: use
values like Endpoint, Route/UI, Schema/model, DB table/migration, Domain object,
Service, CLI command, Config key, Skill/rule, Business rule — or whatever fits
this project (skitterspec itself is a CLI with no HTTP surface). Keep `Detail`
terse — names/signatures, not sentences. List **only** surfaces that actually
change; the heading is always present, but if nothing external changes write the
single line below instead of an empty table.>

<A bug fix often changes no external surface — that's fine, use the
one-liner.>

| Surface | Change | Detail |
|---------|--------|--------|
| <e.g. Endpoint> | update | <e.g. GET /orders (fix null total)> |

<_No external surface changes — internal refactor only._ — use this line in
place of the table when the spec touches no external surface.>

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| <YYYY-MM-DD> | In Progress | in-progress | <developer> |

## Changelog

- <YYYY-MM-DD> — Bug reproduced; failing test added (red).
```

The **State log** is the folder/status audit trail; later transitions
(`/spec-complete`, `/spec-cancel`) append a row. The **Changelog** is for the
fix narrative and decisions — keep them separate.







### Release gating (only when configured)

**Only when `specs/.core/gating.config.json` exists.** Before writing the spec,
ask: should this fix ship behind a feature flag, or land live?
**Offer, don't impose** — cite the project's own `guidance` path when the config
names one, and
record the answer either way, as a flag name or `none: <one-line reason>`.

A bug fix ships in the next release exactly like a feature, so it gets the same
question rather than an assumption. A risky rewrite of a broken path is precisely
where a kill-switch earns its keep; a one-line null check is precisely where
`none:` is the honest answer. Skip entirely when the config is absent.

## 5. Drive to GREEN

- Implement the **minimal, root-cause** fix. Match surrounding code; honour all
  project rules (see `.claude/rules/`).
- Re-run the failing test → it must pass. Then run the project's typecheck and
  test commands to confirm no regressions. Quote results.
- Tick the Fix tasks, add a Changelog line (`- <date> — Fixed: <one line>; test green`).

If the root cause is large/uncertain and can't be fixed in one pass: keep the red
test, split the fix into phase files (`01-<slug>.md` …) with a phase index in
`00-overview.md`, and leave the spec in `in-progress` for `/spec-next` to continue.
Say so explicitly — don't fake green.

**Then refresh the mirror (only if a provider is installed).** The Fix tasks are
ticked, so the repo is now the truth about this fix — and this skill can take a
bug all the way to green without `/spec-next` ever running. Without a provider this
is a no-op.



## 5b. Render the page, arm the gate, then wait for the verdict

**Only when the project has per-spec isolation** (`specs/.core/env.config.json`
present). Without it there is no worktree to read and this step does not exist —
skip it in silence rather than explaining an absence.

The fix is green and nothing is committed yet. That is the moment the page is
about, so render it now — **after** the tests pass and **before** the commit:

```
skitterspec spec-env review <spec> --buttons fix
```

**This is free.** The engine reads git and splices the patches into a template;
the diff never passes through you, so a 266KB patch costs nothing.

**`--buttons fix` drops `Commit & Continue`**, because a fix that took one pass
has no next phase and that verb names work which does not exist. The page has a
guard for this and cannot see these specs: it dims the button on
`data.phases.hasNextPhase === false`, and `readPhases` returns `null` for a
folder with no phase files — deliberately, since that is also a legacy layout
whose phases live inline in the overview. The set is the caller's declaration
about the work, so the declaration is here.

**Where §5 split the fix into phase files, drop the flag.** Then a next phase
genuinely exists, `/spec-next` will build it, and the committing set is right —
so take the default by passing no `--buttons` at all, exactly as `/spec-next`
does.

**Then arm the gate**, so the fix now owes a verdict:

```
skitterspec spec-env review arm <spec>
```

**Then wait**, and `/spec-next` §5 owns the sequence — follow it there rather
than reading a second copy here: note the moment, run
`skitterspec spec-env review wait <spec> --since <that moment>` under the
harness's persistent watch primitive where one exists (else in the
background), end your turn, and let `--claim-since` pick the one pass that
arrived inside the window. **Do not compose a watcher**, and do not give the
wait a timeout — the reasoning is in `/spec-next` §5 and is not repeated here.
The banner it describes is what this skill emits in place of a `Review` row,
and the routing on the verdict is `/spec-diff` §2 and §4, as it is everywhere.

**A watch that dies is re-armed on the same window**, silently and bounded by
the age of that window — `.claude/rules/spec-reports.md` carries the contract,
including when to stop and what the banner says instead. Do not restate it
here.

**Why this skill arms as well as waits.** Waiting is what any offer does;
**arming** asserts an obligation that outlives the turn, and belongs only to
work that is finished. A bug fix is a completed unit — red→green, suite
passing — so it qualifies, and a wait with nothing owed behind it is a
suggestion rather than a gate. A mid-run render waits without arming, and
walking away from that costs nothing.

**This is the gap this step existed inside.** It used to render the page, emit a
row asking *"want a written review before you commit?"*, and finish — with
nothing watching. A verdict pressed on that page landed in the holding area and
stayed there, because the run had said the page was **ready** rather than that
it was **waiting**. Two were pressed on one spec and both were stranded; the
second existed only because the first appeared to do nothing.

**It is user-visible, and that is deliberate.** Once armed, a `git commit` in
this worktree is refused until a verdict is sent or
`skitterspec spec-env review skip "<reason>"` records the decision to move on.
The exit is always one command, and one of them is *"I am moving on"*.

Relay the engine's **stack** — the `local:`, `network:` and `remote:` lines, all
three — rather than the bare `page:` path: a path is not clickable in any
terminal, and a page nobody can open is a page nobody reads. Relay the `live:`
line with it where the engine printed one, and nothing where it did not.
`.claude/rules/spec-reports.md` carries the shape, including why a rigid
contract took that line.

- **Never write the review unasked**, and **never publish**. Publishing leaves
  something behind that this tooling cannot remove, so it is always an ask. A
  `file://` link is no use on a phone, and saying so **is** the ask —
  `/spec-diff` §6 owns how.
**The `reader:` line no longer decides anything here, and that is the point.**
It is still printed, and it is still the only place that question is answered —
but the offer does not change with it, because the stack lists every tier
whatever it says. Three reader states used to mean three different offers, and
that branching is exactly what produced a `file://` page on a session detected
`unknown`, a LAN URL for a phone off the network, and an address that changed
underneath a reader when detection flipped mid-session.

So: **relay all three tier lines, every time.** Any `also:` lines sit under
`network` — the other addresses this machine has, offered because the
best-guess one can be wrong — so pass them on rather than editing them out.

**Never read an environment variable to decide anything about the offer** — not
`SSH_CONNECTION`, not `CLAUDE_CODE_*`, not a tty check. There is nothing left
here for a detection to decide, and a second implementation of one could not be
tested and would drift.

**Serving is the engine's to do; publishing is never.** A `remote` reader
authorises a local server — one process, ended by one flag, leaving nothing
behind — and authorises nothing else. Publishing leaves a page this tooling
cannot remove, so it stays an ask in every case, always. If the engine could not
serve (a busy port, a machine with no network address) it falls back to the
`file://` URL with its marker, and that is when publishing is worth naming.

- **Never fatal.** A failed render — no worktree, a git error — is one line, and
  the fix is still done. The page is a convenience; the repo is the record.

## 6. Report

Do **not** `git commit` unless the user asks. The spec stays in `in-progress`;
`Next` names the commit and then `/spec-complete`, as
`/commit, then /spec-complete` — this skill leaves the fix uncommitted, and
`/spec-complete` §2 refuses on pre-existing uncommitted changes, so naming only
the second half sends the reader into a refusal. `/spec-complete` then verifies
and archives it (**when isolated**, the fix lives on the bug's branch, and it
merges that back to `main`).

End with the block defined in `.claude/rules/spec-reports.md`. That file carries
the shape; this section carries only what is specific here.

**Verdicts**

- `✅` — red→green, the fix is in and the suite passes.
- `⚠️` — green, with something worth knowing (a narrowed repro, a mirror that
  did not refresh).
- `❌` — the test is still red, or a later test broke. Quote the failure.
- `⏸` — the bug could not be reproduced, so nothing was written. Say what was
  tried; an unreproduced bug is a finding, not a failed run.

**Fields:** `Tracker` · `Branch` · `Spec` · `Cause` · `Built` · `Tests` ·
`Review` · `Follow-ups` · `Next`

**`Review` is emitted only where step 5b did not run** — a project with no
isolation, or a render that failed. Where the run is waiting, the banner carries
the whole subject and the row is dropped, per `.claude/rules/spec-reports.md`.

`Cause` is the root cause in one clause and `Built` is the fix — the
failing→passing test belongs in `Tests`, named, so the evidence is a test name
rather than an adjective.

Step 5b ends in the **banner**, not a paragraph and not a row — the run is
waiting on a verdict, and the banner is the shape that says so. Nothing follows
it. Where the run is not waiting it asks nothing at all: a `Review` row carries
the counts and the link, and no question (*asking implies waiting*).

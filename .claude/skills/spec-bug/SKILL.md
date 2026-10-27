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

## Phase 0 — start from a GitHub issue (only when asked)

**Only when `specs/.core/github.config.json` exists** *and* the invocation names an
issue. Otherwise skip this phase entirely and grill from the user's own words.

Two ways in:

- **`<ISSUE-REF>`** (`#123`, an issue URL, or a bare `#N` anywhere in the
  arguments) — adopt that issue.
- **`--from-issue [query]`** — browse the intake inbox:
  `skitterspec spec-sync intake [query] --json` lists the open issues carrying
  `intake.label` that no spec has adopted and that are not spec or phase issues
  themselves, each with the skill its labels route it to. `query` filters titles
  case-insensitively. Show the shortlist and let the user pick one. Without a
  token it says so and exits 0 — fall back to `list_issues` over MCP.

Then:

1. **Exclude what's already adopted.** Run `skitterspec spec-sync linked --json`
   and drop any issue whose identifier is already stamped on a spec. If the user
   named such an issue directly, **stop** and point them at that spec — one issue
   never becomes two specs.
2. **Read the issue** with the discovered issue-read tool (`issue_read`):
   title, description, labels, reporter, URL. If GitHub isn't connected, say so
   and offer to carry on without it — a spec written from the user's own
   description is still a spec.
3. **Route the issue to the right skill.** Match the issue's labels
   (case-insensitively) against two lists, **checking `hotfixLabels` first**:

   - **`intake.hotfixLabels`** → this is broken in **production**, so it needs a
     fix against the released version, not `main`. Say so, name the matching
     label, and tell the user to run **`/spec-hotfix <ISSUE-REF>`** — then stop.
   - **`intake.bugLabels`** → a bug report, not a feature request. Say so, name
     the label, and tell the user to run **`/spec-bug <ISSUE-REF>`** — then stop,
     without authoring a Feature spec.

   **Hotfix wins when an issue carries both**, and deliberately: production is the
   more specific destination, and the two mistakes are not equally costly. Routing
   a prod issue to `/spec-bug` produces a fix that lands on `main` and never
   reaches the running version — discovered only when someone asks why it hasn't
   shipped. The reverse is a hotfix branch for something that could have waited,
   which is merely wasteful.

   With a list unset, nothing routes through it; with both unset every issue is
   treated as a feature request, exactly as before.

   **Which checks run depends on where you are**, because a skip is about not
   bouncing someone to the skill they are already in — not about ignoring an
   escalation:

   - **In `/spec`** — both checks run.
   - **In `/spec-bug`** — the bug check is skipped (it would route you to
     yourself), but the **hotfix check still runs**. A bug report labelled for
     production is not "already handled" by being in the bug path: `/spec-bug`
     fixes on `main`, and prod would stay broken. Say so and hand off.
   - **In `/spec-hotfix`** — both are skipped. It is already the most specific
     destination; there is nowhere left to route.

   Then adopt the issue and reproduce it as usual: the issue body is your repro
   material, and the failing test comes before the spec exactly as normal.
4. **Seed, don't skip, the grill.** The issue's title becomes the working spec
   title and its description the starting material for **Problem** — or
   **Symptom** in a bug or hotfix spec, which is where a report belongs. Quote the
   reporter's words rather than paraphrasing them away. Note the reporter and the
   issue URL for context. Everything after this runs exactly as normal: an issue
   is a *request*, not a groomed spec, so grill it as hard as anything else.

   **In `/spec-hotfix`, also mine the issue for a version.** Any release-shaped
   string in the report is a *suggestion* for the base tag, offered when the skill
   asks which version prod is running — never used as a default. The reporter's
   version is the one they saw the bug on, which is often not what is deployed.

### Adopting the issue

The issue **becomes** the spec's issue — it is not copied and no second issue is
minted. This is identical in `/spec`, `/spec-bug` and `/spec-hotfix`; only *when*
it happens differs (`/spec` writes the spec in Phase B, `/spec-bug` in its step 4,
`/spec-hotfix` in its step 5). Once the spec file exists:

- **Stamp `github_identifier` and `github_url`** in `00-overview.md` frontmatter
  from the adopted issue. That is the whole link: every later skill
  (`/spec-push`, `/spec-status`, `/spec-start`) keys off it being present.
- **Adoption is not a mint.** The issue was filed somewhere deliberately — it
  stays where it is, and nothing moves it to another repo or board.
- **Do not write a base sidecar.** Leaving `sync.baseDir` empty for this spec is
  what makes the **linking push** send the spec over the reporter's original
  description (an **update** to the existing issue, plus a sub-issue per phase).
  Recording a snapshot here would declare the mirror already in sync and strand
  the issue showing the raw report forever.
- **Preserve the original, before anything replaces it.** Run this the moment
  the spec file exists and **before the linking push**:

  ```
  skitterspec spec-sync preserve <spec>
  ```

  It posts the issue's current description onto the issue as a comment — the one
  surface one-way sync never touches, so no push can clobber it. On the API path
  it reads the description itself; without credentials it prints the body and
  the marker, and you post it with the discovered GitHub comment tool after
  checking the comments for that marker.

  **The ordering is the whole correctness condition.** Run before the push, this
  keeps what the reporter filed. Run after it, it would keep the generated spec
  and report success — which is why it is a step of its own here rather than a
  line in the push sequence. The engine warns when it can tell it is late, but it
  cannot always tell.

  **It never fails the adoption.** A project that set
  `intake.preserveOriginal: false`, an unreachable GitHub, an issue with no
  description, a comment GitHub refused — every one of them exits 0 and says so.
  Relay what it printed and carry on.
- **Say what will happen** in the finish-up message. The linking step runs right
  after the spec is written, so the issue's description is replaced by the spec
  **then** — not on some later manual push. Say both halves: the description
  becomes the spec, **and** the original is preserved as a comment on the same
  issue, so the reporter can still read what they wrote.

  **Do not send anyone to the issue's history for it.** This used to say the
  tracker keeps the original there, and that is true and useless: history is a
  diff viewer nobody opens, it is not quotable, and it degrades to "it is in
  there somewhere". The comment is the answer, and the other half is the spec's
  own **Problem** (or **Symptom**) section quoting the reporter.

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

**Only when `specs/.core/github.config.json` exists** (GitHub sync is opted in).
If it's absent, skip this entirely — the spec stays local-only and the skill
behaves exactly as above. When present, link the spec you just wrote so status
and discussion live in GitHub while the repo stays the source of truth. A spec is
a GitHub **issue**; each phase is a **sub-issue**, carrying that phase's tasks in
its description as a read-only checklist.

**Linking is just the first push**, so it runs the same engine path `/spec-push`
does — you never create the issue by hand:

1. **Pick the transport.** `skitterspec spec-sync states --json`. With a GitHub
   token set it answers `api` and prints the board's Status options; without
   one it answers `mcp` and you do the MCP work `/spec-push` describes. Write
   the option names to a file for step 2.
2. **Get the plan.**
   `skitterspec spec-sync plan <spec> --workspace-states <file> --json > plan.json`
   — the spec is unlinked, so this plan is all-creates: the issue and one
   sub-issue per phase.
3. **Apply it.**
   `skitterspec spec-sync apply <spec> --plan plan.json`. There is no project
   to pick: the issue lands in the configured repo, on the configured board.
   That creates the issue and its sub-issues, adds each to the board with its
   Status, and checks what GitHub stored. It then
   **stamps the numbers into the spec** — `github_identifier`/`github_url` on the
   overview, `github_issue_id` on each phase — and **records the base snapshot**,
   so `/spec-status` reports in-sync immediately. There is no hand-editing of
   frontmatter and no separate `stamp` or `record` call.

   If it prints `transport = mcp`, it wrote nothing: apply the plan over MCP as
   `/spec-push` steps 4a–5 describe, ending with `spec-sync stamp` and
   `spec-sync record`. That path is fully supported — it is what anyone without
   credentials uses.
4. **Echo the branch name** from `branch.pattern` so the user knows what
   `/spec-start` will fork.

**If GitHub can't be reached**, say so in one line and leave the spec written and
local — it is still a perfectly good spec, and `/spec-push` links it later. Do
nothing destructive.

**A spec that adopted an existing issue** (see the intake step) is already
stamped, so its plan is an **update**, not a create: applying it replaces the
reporter's description with the spec. That is the one-way rule working as
intended — the repo is canonical, and the original was preserved as a comment
on the issue by the intake step. Nothing re-homes an adopted issue: where it
lives stays GitHub's.

Leave committing to the existing convention (the user commits the spec as usual)
and **never auto-push git** — GitHub's own automation reacts to real branch/PR
events later. Report the GitHub issue URL as part of the skill's finish-up
message.

**Only when all three hold**: `specs/.core/github.config.json` exists, the repo
**owns** `assignee` in its `sync.fieldOwnership`, and the spec carries a
`github_identifier`. Any one missing → skip this step silently and carry on; a
project that declined must see no trace of assignment.

Ownership is the **value**, not the key: `assignee` is owned by default, and
`"none"` is how a project declines it. Testing whether the key is *present* would
read as opted-in everywhere, since the default puts it in every config.

**Never blocks, never fails the skill.** Everything below is best-effort: the
branch is provisioned and the spec is moving either way, and an unassigned issue
is a cosmetic gap that `/spec-claim` closes later.

1. **Work out who you are.** Run `skitterspec spec-sync whoami --json`.
   - `ok: true` → use `id` and `name`. Nothing to ask.
   - `source: "mcp"` or the command reports no token → call the discovered
     `get_me` tool, then cache its login:
     `skitterspec spec-sync whoami --set <id> --name "<name>"`.
   - `ok: false` → identity is **unknown**, which is an ordinary state (a shared
     or bot key, an offline machine). Go to step 2.
2. **Unknown identity — three states, not two.** Decide by what is actually
   reachable, and route the third to inaction:
   - **GitHub reachable *and* this is an interactive session** → offer a short
     user search (`skitterspec spec-sync users <name-or-email>`, or the
     user-list tool on MCP), let the operator pick, and offer to cache it with
     `whoami --set` so this is asked once per machine rather than once per spec.
   - **Not reachable, or not interactive** → say so in one line
     (`assignment skipped — no GitHub identity`) and **carry on**. Do not prompt
     for something you could not act on, and never stall a `/spec-start` on it.
3. **Record it on the spec** — through the engine, never by hand-editing
   frontmatter:

   ```
   skitterspec spec-sync assign <spec> --to <login> --name "<display name>"
   ```

4. **Leave `> **Developer:**` as `git config user.name`** — the step above this
   seam already set it, and this seam must not overwrite it with the tracker's
   display name.

   Those two names are the same person and often not the same string, and the
   git one is the one everything else in the spec already uses: `Author:`, every
   **State log** `By` row, and every commit. Writing the tracker's name into this
   one field would leave a spec whose own audit trail contradicts its header —
   a worse problem than the one it would solve. Anyone wanting a different name
   on their specs sets `git config user.name`, and it stays consistent
   everywhere.

   The header names **who is building this**; the stamp in step 3 names
   **which tracker account it is assigned to**. They answer different questions,
   so they need not be the same string. The one place that reasoning does not hold
   is handing a spec to *someone else* — there is no local git name for them —
   and that case belongs to `/spec-claim --to`, which sets the header from the
   tracker deliberately.

**Nothing is pushed here.** `assign` writes the repo only, and the refresh these
skills already run sends it. Assignment is an ordinary field of the projection,
not a side errand with its own network call.

**There is no unassign step anywhere.** The projection derives the assignee from
the spec's lifecycle bucket, so `/spec-complete` and `/spec-cancel` release the
issue through the push they already make. The stamp deliberately stays in the
file: who actioned the work outlives who is currently holding it.

GitHub has no project picker: a minted issue lands in the configured
`github.owner`/`github.repo`, on the one board `github.project` names — both
decided once in `specs/.core/github.config.json`. There is nothing to ask.

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

**Only when `specs/.core/github.config.json` exists** and the spec carries a
`github_identifier`. Either missing → **skip**, in one line
(`not linked to GitHub — /spec-push to mirror it`), and carry on.

**Refresh the mirror now, without asking.** Run `/spec-push`. The repo has just
become the truth about this phase's progress, and progress is what the mirror
exists to show. Deferring it to `/spec-complete` is what makes every phase
sub-issue jump from To Do straight to Done, with nothing visible in between.

- **Never mint.** An unlinked spec is skipped, not created.
- **Never fatal.** If the push fails — offline, no credentials, a GitHub error —
  say so and **finish the operation anyway**. The phase is done in the repo
  regardless; the mirror is disposable and the next push repairs it.
- **Expect a dirty `specs/.core/` afterwards.** The push writes a base snapshot
  and stamps any new keys, and these skills do not commit. The next `/commit`
  sweeps it up with the phase's own work.
- **Say what happened** in the skill's report: mirror updated, skipped as
  unlinked, or failed with the reason.

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

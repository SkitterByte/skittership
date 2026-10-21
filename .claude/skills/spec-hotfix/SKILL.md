---
name: spec-hotfix
description: Fix a production bug on the exact released version — fork a worktree from a release tag, drive it red→green, then land it by tagging a new patch for CI/CD and cherry-picking the fix onto main. ALWAYS starts from a base tag and works on the hotfix's own branch, never on main. Use when the user says "/spec-hotfix", "hotfix <tag>", "prod is broken on <version>", "patch the released version", or needs a fix shipped against a tagged release rather than main.
---

# /spec-hotfix — fix a released version, tag it, cherry-pick back to main

> Stay silent while this runs — speak only to ask something you cannot answer
> yourself, or to report a failure at the moment it happens. Read
> `.claude/rules/spec-reports.md` before reporting; it defines the block this
> skill ends with.

This is the **hotfix** counterpart to `/spec-bug`. Same test-first discipline
(reproduce as a **failing test (RED)**, then drive to **GREEN**), but the base is
a **release tag**, not `main`: prod is running a tagged version, so the fix must
be built on **that** commit line, shipped as a **new patch tag** (your CI/CD
deploys tags), and only then cherry-picked onto `main` for the next release.

Spec type convention (see `.claude/rules/spec-planning.md`):
- Hotfix specs are named `hotfix-<kebab-name>`; every header carries
  `> **Type:** Hotfix` and `> **Base version:** <tag>`.
- Branch is `hotfix/<slug>`, forked from the base tag.

**Isolation is required.** A hotfix forks a worktree from a tag and lands by
tag + cherry-pick — it needs the isolation engine (`specs/.core/env.config.json`).
If isolation is absent, say so and stop; there is no in-place path.



## 1. Establish the base version (the tag)

- **Read the arguments.** `/spec-hotfix <tag> <name>` (e.g.
  `/spec-hotfix v33.16.4 login-crash`). An argument shaped like an issue
  reference — letters, a hyphen, digits (`SKI-123`) —
  is **always a reference, never a name**, so `/spec-hotfix v33.16.4 SKI-123` and
  `/spec-hotfix SKI-123`
  both mean "adopt that issue". Release tags don't take that shape, so the two
  can't be confused. With no name and no reference, ask what to call it.
- Take the release tag from the argument. If it's missing,
  **ask which version prod is running** — don't guess. When an issue was adopted
  above, **offer any versions it mentions** as suggestions — clearly labelled as
  the reporter's words, not a default — and still wait for the answer. A reporter
  usually names
  the version they *saw* the bug on, which is not necessarily what is deployed,
  and a hotfix forked from the wrong tag fails late.
- **Verify the tag exists** before anything else:
  `git rev-parse --verify <tag>^{commit}`. If it doesn't resolve, stop and ask.

## 2. Reproduce & isolate (light investigation)

Hotfixes are concrete — confirm, don't over-grill. Establish:

- **Repro:** exact steps / input that triggers it on the released version.
- **Expected vs actual:** what *should* happen vs what does.
- **Root cause:** read the code **at the base tag** and trace it to `file:line`.
  The fix belongs on the tag's line, so reason about that code, not `main`'s.

## 3. Provision the worktree from the tag, then write in it

**Provision before you write, not after.** §1 settled the tag and the name and
§2 put nothing on disk, so this is the one moment where a worktree costs nothing
to obtain and everything — the red test, the fix, the spec — is still ahead of
it:

```
skitterspec spec-env up hotfix-<name> --docs --from <tag>
```

**`--from` is how the tag reaches the engine, and it is not the header twice.**
Everywhere else `up` forks a hotfix from the spec's own
`> **Base version:**` line — but here the spec that would carry it does not
exist yet, which is the whole of what this lane is for. Without the flag the
branch would fork from `main`: the fix gets written against code prod is not
running, while the tag and the cherry-pick downstream go on believing it is on
the release line, and nothing says otherwise until someone asks why the patch
did not take. The engine refuses a ref git does not know rather than forking
from somewhere else quietly; where git cannot answer at all it passes the ref
through to `git worktree add`, which refuses far more loudly than a planner
guessing from an absence.

Run what it prints — the `git worktree add … -b hotfix/<slug> <tag>` is checked
out **at the tag**, not at `main`, and the
`skitterspec spec-env bootstrap hotfix-<name> --docs` under `then, run:` where
there is one — then move this session into the worktree
with a plain `cd`; the Bash working directory persists between calls, so from
here on the test, the fix and the spec are all written on the hotfix's own
branch. Confirm the move landed rather than reading silence as success
(`.claude/rules/negative-checks.md` rule 1): `skitterspec spec-env resolve` with
no argument must name this spec. If it does not, say so and stop rather than
writing into a tree you cannot name.

**Then run `up` again, without the flags:**

```
skitterspec spec-env up hotfix-<name>
```

`--docs` skips the `setup` commands — everything whose only purpose is making a
tree *runnable* — because provisioning somewhere to write markdown should cost a
`git worktree add` and nothing else. A hotfix has no `/spec-start` to leave them
to: §4 runs the project's suite in this same tree, and
**a tree that cannot run the suite cannot go red**.
The flagless re-run re-attaches the worktree that now exists (no second `-b`
fork, and no fork point — the branch is already on the tag's line) and prints
`skitterspec spec-env bootstrap hotfix-<name>` — run it, and it runs the steps
the flag deferred.

**The worktree steps are the engine's to run, never yours.** Seeding the
gitignored files, the env file, `setup` and the stack all happen inside
`skitterspec spec-env bootstrap <name>` — one call that names no file. Do not
reconstruct them as shell: they used to be printed that way, an agent's copy was
never faithful, and a project's secrets hook refused every rewrite that named a
`.env` path. `bootstrap --plan` says what it would do, for reading only.

**Why nothing is seeded on the base branch, and nothing is moved.** This step
used to write `specs/in-progress/hotfix-<name>/00-overview.md` in the primary
checkout for the engine to resolve, and then `mv` the folder across into a
worktree checked out at a tag — a move with a hazard paragraph of its own, since
`specs/in-progress/` is usually absent at an old release tag. Both halves are
gone. `main` is where work **lands**, not where it happens: where the project
installs `.claude/hooks/main-guard.cjs` that first write is refused outright,
and a step whose documented opening the repo will not perform is not a step. The
spec is written in the worktree at §5, on the branch it belongs to.

**§5 records the same tag you passed to `--from`**, on the spec's
`> **Base version:**` header. That is not bookkeeping: `/spec-complete` tags the
new patch and cherry-picks off the header, so a worktree forked from one ref and
a header naming another is this whole bug again with the halves swapped.

- **Bootstrap the worktree.** A fresh worktree has no installed dependencies and
  none of the repo's gitignored files (`.env`, local overrides). Run the printed
  `in the worktree, run:` steps (file seeding, then `setup`) in order, before
  anything else.
- **Trust the worktree for this session.** The engine wrote the printed
  `trusted:` root into `.claude/settings.local.json`, but it won't hot-reload now
  — run `/add-dir <trusted root>` before editing into the worktree, or the first
  edits will prompt.
- **Do everything below in the worktree**, on the `hotfix/<slug>` branch — the red
  test, the fix, and the rest of the spec. The `cd` above is what makes that the
  default rather than something to remember; where a step has to reach out of
  the tree, use an absolute path or `git -C <worktreePath>`. `main` changes
  only at `/spec-complete` (via cherry-pick, not merge).

## 4. Write the failing test FIRST (RED) — mandatory

Encode the **correct** (expected) behaviour as a test, then run it and confirm it
**fails for the right reason**, on the hotfix branch:

- Put it where the suite already covers that area. Reuse existing test helpers /
  factories; follow the project's test rules (see `.claude/rules/`). Never
  hardcode dates — compute them relative to now.
- Run it with the project's test command. Quote the red output. A test that
  passes before the fix proves nothing — keep refining until it genuinely
  captures the bug on this version.

## 5. Write the Hotfix spec

Write `00-overview.md` in the worktree — §3 provisioned it at the tag and moved
you there, so create the folder and write it here. A hotfix
is usually a single-pass fix, so the `## Fix` block can live directly in
`00-overview.md`. Keep it lean:

```markdown
# Hotfix: <short title>

> **Type:** Hotfix
> **Name:** hotfix-<kebab-name> (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — fixing (red test added)
> **Author:** <git user.name — who reported/captured it>
> **Developer:** <git user.name — you, since you're fixing it now>
> **Base version:** <tag prod is running, e.g. v33.16.4>
> **Raised:** <YYYY-MM-DD (today)>
> **Area:** <files/modules>
> **Gating:** <pre-filled "none: hotfix — restoring released behaviour"; only
> when release gating is configured, and overridable — see below>

## Symptom

<observed wrong behaviour on the released version + repro steps; paste any error>

## Root cause

<the actual cause, at `file:line` on the base tag. One paragraph — be specific.>

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

<A hotfix should be minimal — often no external surface changes; that's
fine, use the one-liner.>

| Surface | Change | Detail |
|---------|--------|--------|
| <e.g. Endpoint> | update | <e.g. GET /orders (fix null total)> |

<_No external surface changes — internal refactor only._ — use this line in
place of the table when the spec touches no external surface.>

## Landing

- [ ] Deploy tag (patch bump of the base version) created at `/spec-complete`
      and pushed **by you** to trigger CI/CD.
- [ ] Fix cherry-picked onto `main` (and any `--also` release lines).

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| <YYYY-MM-DD> | In Progress | in-progress | <developer> |

## Changelog

- <YYYY-MM-DD> — Hotfix reproduced on <tag>; failing test added (red).
```

Keep the **State log** (state transitions) separate from the **Changelog** (fix
narrative and decisions).







### Release gating (only when configured)

**Only when `specs/.core/gating.config.json` exists.** A hotfix is the one spec
type that does **not** ask the question cold: it writes
`none: hotfix — restoring released behaviour` and asks only for confirmation.

The default differs on purpose. A hotfix restores behaviour a release already
had, under time pressure, and the fix is captured by a deploy tag rather than
riding the next release — so a flag has nothing to gate and nothing to roll back
to. Making someone answer a design question mid-incident buys nothing.

It is a **default, not a rule**: say what you are writing and let the user
override it. If they name a flag, record that instead. Skip entirely when the
config is absent.

## 6. Drive to GREEN

- Implement the **minimal, root-cause** fix on the branch. Match surrounding code;
  honour all project rules (see `.claude/rules/`).
- Re-run the failing test → it must pass. Then run the project's typecheck and
  test commands to confirm no regressions. Quote results.
- Commit the fix to the `hotfix/<slug>` branch (this commit is what gets tagged
  and cherry-picked). Tick the Fix tasks; add a Changelog line.

**Then refresh the mirror (only if a provider is installed).** The Fix tasks are
ticked, so the repo is now the truth about this fix — and this skill can take a
bug all the way to green without `/spec-next` ever running. Without a provider this
is a no-op.



## 6b. Render the page, arm the gate, then wait for the verdict

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

**`--buttons fix` drops `Commit & Continue`**, because a hotfix has no next
phase for `/spec-next` to build and that verb would name work which does not
exist. There is no exception to this the way there is in `/spec-bug`: a hotfix
is a single pass against a released tag by construction, so it never has phase
files and the flag is unconditional here.

**Then arm the gate**, so the fix now owes a verdict:

```
skitterspec spec-env review arm <spec>
```

**Then wait**, and `/spec-next` §5 owns the sequence — follow it there rather
than reading a second copy here: note the moment you start waiting, watch the
pending store, end your turn, and let `--claim-since` pick the one pass that
arrived inside the window. The banner it describes is what this skill emits in
place of a `Review` row, and the routing on the verdict is `/spec-diff` §2 and
§4, as it is everywhere.

**Why this skill arms as well as waits.** Waiting is what any offer does;
**arming** asserts an obligation that outlives the turn, and belongs only to
work that is finished. A hotfix is a completed unit — red→green against a
released tag — so it qualifies, and a wait with nothing owed behind it is a
suggestion rather than a gate.

**A hotfix is the case where reading it matters most.** This change is about to
be tagged and shipped to production from a release line, not merged into a
branch someone else will read first. The verdict is the only review it gets.

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

**The range is measured from the base tag, not from `main`.** A hotfix forks its
worktree from its `> **Base version:**` tag, and the engine reads that header, so
the header line says `since <tag>` — do not relay it as `since main`, and do not
reach for a branch view expecting the base branch.

## 7. Report

Do **not** `git push` or `git tag`-and-push unless the user asks — deploying to
prod is theirs to trigger. The spec stays in `in-progress`.

- **`/spec-live` is refused for a hotfix** — its branch is built on an old tag, so
  hot-reloading it onto the running dev server could break the shared instance.
  To test it, the user runs `/spec-connect` (its own isolated stack).
- `Next` points at **`/spec-complete`** to land it: it patch-bumps the base tag,
  tags the hotfix branch **locally** (you push it to deploy), and cherry-picks the
  fix onto `main`. Add `--also <tag>` at completion to also patch other release
  lines (test/demo on their own versions).

End with the block defined in `.claude/rules/spec-reports.md`. That file carries
the shape; this section carries only what is specific here.

**Verdicts**

- `✅` — red→green on the base tag, fix in, suite passing.
- `⚠️` — green, with something worth knowing.
- `❌` — still red, or a later test broke. Quote the failure.
- `⏸` — no reproduction on that tag, or the tag could not be established.

**Fields:** `Tracker` · `Branch` · `Spec` · `Cause` · `Built` · `Tests` ·
`Review` · `Follow-ups` · `Next`

**`Review` is emitted only where step 6b did not run** — a project with no
isolation, or a render that failed. Where the run is waiting, the banner carries
the whole subject and the row is dropped, per `.claude/rules/spec-reports.md`.

**The base tag goes in the verdict clause** — `✅ /spec-hotfix · hotfix-foo ·
green on v2.3.1`. Which released version this was fixed against is the first
thing anyone needs, and it is not a field: the clause is where the run says
where it got to.

Step 6b ends in the **banner**, not a paragraph and not a row — the run is
waiting on a verdict, and the banner is the shape that says so. Nothing follows
it. Where the run is not waiting it asks nothing at all: a `Review` row carries
the counts and the link, and no question (*asking implies waiting*).

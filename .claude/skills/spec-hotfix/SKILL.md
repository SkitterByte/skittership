---
name: spec-hotfix
description: Fix a production bug on the exact released version — fork a worktree from a release tag, drive it red→green, then land it by tagging a new patch for CI/CD and cherry-picking the fix onto main. ALWAYS starts from a base tag and works on the hotfix's own branch, never on main. Use when the user says "/spec-hotfix", "hotfix <tag>", "prod is broken on <version>", "patch the released version", or needs a fix shipped against a tagged release rather than main.
---

# /spec-hotfix — fix a released version, tag it, cherry-pick back to main

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

## 3. Seed the stub, then provision the worktree from the tag

The engine forks the worktree from the spec's `Base version`, so the stub — with
that header — must exist **before** `spec-env up`:

- From the base branch (`main`), create
  `specs/in-progress/hotfix-<name>/00-overview.md` with the header block
  (including `> **Type:** Hotfix` and `> **Base version:** <tag>`) and the
  `## Symptom` you established. It starts in `in-progress` — work begins now.
- Run `skitterspec spec-env up hotfix-<name>`. It prints a `git worktree add …
  -b hotfix/<slug> <tag>` command (the branch forks from **the tag**, not
  `main`), the worktree path, the opener, and any `in the worktree, run:`
  bootstrap steps.
- Run the printed `git worktree add`, then **move the stub across yourself.**
  This is where a hotfix differs from `/spec-bug`, which no longer needs the move:
  that skill's worktree forks from `main`, so committing the stub puts it there,
  while **this worktree is checked out at the tag** — a commit on `main` is not in
  it and never will be. The move is not redundant here; keep it.
  **Create the destination bucket first:**

  ```
  mkdir -p <worktreePath>/specs/in-progress
  mv specs/in-progress/hotfix-<name> <worktreePath>/specs/in-progress/
  ```

  The `mkdir -p` is not belt-and-braces. Git does not store empty directories, so
  `specs/in-progress/` is **absent** from the worktree whenever nothing was in
  progress at that point in history — and here that point is an
  **old release tag**, where it is absent more often than not. `mv` into a
  missing destination renames your spec folder **to** `specs/in-progress`,
  silently: the spec's files end up one level too high, `00-overview.md` sits
  where the bucket should be, and every later step still appears to work until
  something cannot find the spec. Confirm the result before carrying on — you
  want `<worktreePath>/specs/in-progress/hotfix-<name>/00-overview.md`. - **Bootstrap the worktree.** A fresh worktree has no installed dependencies and
  none of the repo's gitignored files (`.env`, local overrides). Run the printed
  `in the worktree, run:` steps (file seeding, then `setup`) in order, before
  anything else.
- **Trust the worktree for this session.** The engine wrote the printed
  `trusted:` root into `.claude/settings.local.json`, but it won't hot-reload now
  — run `/add-dir <trusted root>` before editing into the worktree, or the first
  edits will prompt.
- **Do everything below in the worktree**, on the `hotfix/<slug>` branch — the red
  test, the fix, and the rest of the spec. Act with absolute paths /
  `git -C <worktreePath>`, or open a fresh session rooted there. `main` changes
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

Flesh out `00-overview.md` in the worktree (you seeded the stub in §3). A hotfix
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



## 7. Report

Summarise: the base tag, root cause, the failing→passing test, the fix, and the
full test result. The spec stays in `in-progress`.

- **`/spec-live` is refused for a hotfix** — its branch is built on an old tag, so
  hot-reloading it onto the running dev server could break the shared instance.
  To test it, the user runs `/spec-connect` (its own isolated stack).
- Suggest **`/spec-complete`** to land it: it patch-bumps the base tag, tags the
  hotfix branch **locally** (you push it to deploy), and cherry-picks the fix onto
  `main`. Add `--also <tag>` at completion to also patch other release lines
  (test/demo on their own versions).

Do **not** `git push` or `git tag`-and-push unless the user asks — deploying to
prod is theirs to trigger.

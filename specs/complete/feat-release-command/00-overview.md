---
github_identifier: "#5"
github_url: "https://github.com/SkitterByte/skittership/issues/5"
github_assignee_id: "SkitterByte"
github_assignee_name: "Reuben Greaves"
---

# A shipped release command: plan, cut, never push

> **Type:** Feature
> **Name:** feat-release-command (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** Complete (2026-11-09)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-11-09
> **Area:** assets/scripts/release.cjs (new), assets/scripts/approve-release.cjs (new), assets/scripts/lib/config.cjs, src/init.js, scripts/ (dogfood copies), package.json, README.md, assets/claude-md-section.md
> **Stack:** worktree

## Problem

skitterspec carries its own `scripts/release.js` (plan by default, `--yes`
bumps + notes + tests + commit + annotated tag, never pushes) and a forked
`scripts/approve-release.cjs` (npm stage list → stage-id → approve). skittership
has the same approve script, repo-local and unshipped. Both are generic apart
from a hardcoded package table and two skitterspec-only steps (a Linux docker
run, a "nothing shipped" check). Two more hazards have no home: pushing more
than three tags at once makes GitHub create no push events, so CI silently
never runs; and a rebase rewrites commit hashes recorded in the repo
(`verified: <sha>` in skitterspec's `docs/*.html`), which nothing notices.

## Decisions

1. **Shipped scripts, not a CLI subcommand.** `scripts/release.cjs` and
   `scripts/approve-release.cjs`, manifest-managed and zero-dep like
   `release-hotfix.cjs`, so a release runs the code `update` last synced.
   Rejected: `skittership release` — it would follow the installed package
   version rather than the synced scripts.
2. **Opt-in by config.** `release.cjs` and its `release` npm helper install only
   when a `release` key exists; `approve-release.cjs` and `approve`/`staged`
   helpers only when `release.staged` is true. Unset, `init`/`update` write
   exactly what they do today (test).
3. **Driven by feat-release-packages' `packages` map**, adding `dir` and `npm`.
   With packages: one package per run, tag `<tagPrefix><version>`. Without:
   the root package, delegating to `<pm> version` so the existing `version`
   hook runs — refusing a `postversion` script unless `--allow-postversion`,
   exactly as `release-hotfix.cjs` does.
4. **Escalation: plan → `--yes` → `--push`.** Bare prints the ordered plan and
   touches nothing. `--yes` (packages mode): refuse a dirty tree or an existing
   tag; bump `<dir>/package.json` by string replace; write notes
   (`generate-releases.cjs --package`); run tests; run `preTag` hooks; stage and
   commit **by pathspec**; `git tag -a`. A failure before the commit names the
   files to restore. `--push` is the only thing that pushes.
5. **One tag per push, always.** `--push` pushes the branch, then each tag in
   its own `git push origin <tag>`; the printed follow-up does the same and
   never suggests `--tags`/`--follow-tags`.
6. **Project-specific steps are hooks, not built-ins.** `release.preTag` is a
   list of commands run after tests, with `RELEASE_PACKAGE`,
   `RELEASE_VERSION`, `RELEASE_TAG`, `RELEASE_BASE_TAG` in the env. A non-zero
   hook stops the release (the project's own check, its own positive signal).
   skitterspec's Linux run and "nothing shipped" check move there.
   `--skip-tests` / `--skip-hooks` are printed in the plan.
7. **Recorded-hash ancestry check warns, never blocks.** `release.recordedHashes`
   names files + a regex capturing a hash. Before tagging, a hash that resolves
   but is not an ancestor of the commit being tagged → warning; a hash absent
   from the clone → `cannot tell`, not a warning. Always exit 0. Unset = no
   output at all. Also runnable alone as `release.cjs check-hashes`.
8. **approve-release generalised:** `approve [<package>] [<version>|<stage-id>]
   [--reject]`; npm name from `packages.<name>.npm`, else `<dir>/package.json`,
   else the root. skittership's repo-local copy is replaced by the managed one.

Non-goals: publishing from a laptop (CI stages; a human approves); hotfixes
(`release-hotfix.cjs` unchanged); multi-package releases in one run.

## Solution overview

```json
"release": {
  "staged": true,
  "test": "pnpm test",
  "preTag": ["docker run --rm --init -v \"$PWD\":/app -w /app node:22 node --test"],
  "recordedHashes": [{ "files": ["docs/*.html"], "pattern": "^verified: ([0-9a-f]{7,40})" }]
}
```

```
pnpm release skitterspec-linear minor          # plan only
pnpm release skitterspec-linear minor --yes    # bump, notes, test, hooks, commit, tag
pnpm release skitterspec-linear minor --yes --push
pnpm approve skitterspec-linear 17.1.0
node scripts/release.cjs check-hashes
```

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | add | `scripts/release.cjs [<pkg>] <patch\|minor\|major\|x.y.z> [--yes] [--push] [--skip-tests] [--skip-hooks] [--allow-postversion] [--json]` |
| CLI command | add | `scripts/release.cjs check-hashes` |
| CLI command | add | `scripts/approve-release.cjs [<pkg>] [<version>\|<stage-id>] [--reject]` (shipped) |
| Config key | add | `release.{staged,test,preTag,recordedHashes}`; `packages.<name>.npm` |
| Service | update | `src/init.js` installs the two scripts + `release`/`approve`/`staged` helpers when opted in |
| Business rule | add | one tag per `git push`; ancestry warning (exit 0) |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Ship a generalised approve-release, opt-in | ✅ | [01-approve.md](01-approve.md) |
| 2 | `release.cjs`: plan, `--yes`, `--push`, hooks | ✅ | [02-release.md](02-release.md) |
| 3 | Recorded-hash ancestry check and docs | ✅ | [03-hash-check-and-docs.md](03-hash-check-and-docs.md) |

Depends on feat-release-packages (the `packages` map and `--package`). Phase 1
does not, and can start first.

## Open questions

- None

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-11-09 | Ready | backlog | Reuben Greaves |
| 2026-11-09 | In Progress | in-progress | Reuben Greaves |
| 2026-11-09 | Complete | complete | Reuben Greaves |

## Changelog

- 2026-11-09 — Spec created, split from the same brief as
  feat-release-packages. Chose shipped scripts over a `skittership release`
  CLI, and preTag hooks over built-in Linux/"nothing shipped" steps.
- 2026-11-09 — Phase 1: the approver's first argument is a package only when
  it names a configured one, so single-package calls parse as before. The
  `approve`/`staged` helpers are wired independently of `versionHook`
  (skitterspec's root has it off), and only when a generator is enabled,
  since the approver needs the shared lib. `release` is validated and kept
  as written, like `packages`; `packages.<name>.npm` joined the entry fields.
  Dogfood: this repo set `release.staged` and `update` adopted the managed
  copy (manifest refreshed, which also records the generators' new hashes).
- 2026-11-09 — Phase 2: in package mode the bump and notes are written
  first, so tests and hooks run against exactly the tree being committed; in
  root mode they run before `<pm> version`, whose own hook writes the notes.
  `--push` without `--yes` refuses. A failure before the commit names the
  `git checkout` and, for a notes file that did not exist, the `rm` that
  restore the tree. The plan says up front when a root `postversion` script
  will make `--yes` refuse. Dogfood: this repo's `release` key added a
  `release` helper to its package.json; its own releases still go through
  `pnpm version`, which the plan reflects.
- 2026-11-09 — Phase 3: the check reads tracked files only, line by line, and
  runs in `--yes` after the commit (package mode) or before `<pm> version`
  (root), against HEAD. `check-hashes` with nothing configured says so in one
  line (only the release path stays fully silent), and a `<ref>` that is not a
  commit is reported as `cannot tell`, exit 0. `recordedHashes` patterns are
  validated to compile and to have a capture group.
- 2026-11-09 — Completed; all phases done, tests green.

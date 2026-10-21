# Cut hotfix versions as `v<base>-hotfix.<N>`

> **Type:** Feature
> **Name:** feat-hotfix-suffix-release (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** Ready — not started
> **Author:** Reuben Greaves
> **Developer:** —
> **Raised:** 2026-10-21
> **Area:** assets/scripts/lib/git-commits.cjs, assets/scripts/lib/config.cjs, assets/scripts/generate-changelog.cjs, assets/scripts/generate-releases.cjs, assets/scripts/check-release-index.cjs, assets/scripts/release-hotfix.cjs (new), src/init.js, README.md
> **Stack:** worktree

## Problem

A prod hotfix has to be exactly the prod tag plus the fix. Taking the next
patch number breaks that once test or demo have used it. In ereqs, prod was on
`v36.2.3` while `v36.2.4..10` had already gone to test/demo. ereqs now cuts
`v36.2.3-hotfix.N` tags by hand with local scripts, and keeps test/demo on
minor bumps only. skittership can't produce these versions. Its generators
also mis-order them: `CHANGELOG.md`/`RELEASES.md` at ereqs `v36.4.0-hotfix.2`
list `hotfix.1` above `hotfix.2`, because the insertion regexes capture only
`\d[\d.]*`. This is handoff 1 of 2. Handoff 2 (skitterspec) makes
`/spec-hotfix` call the command built here, so this ships first. Source:
`handoff-skittership-hotfix-suffix.md` (from an ereqs session).

## Decisions

1. **Version scheme:** a hotfix is `<root>-hotfix.<N+1>`. `<root>` is the base
   tag with any `-hotfix.M` removed. `N` is the highest existing
   `v<root>-hotfix.*` tag in the repo on any branch; only the tag's existence
   counts. A later `v<root+patch>` is irrelevant: it neither blocks nor is
   used.
2. **Ordering:** `X.Y.Z < X.Y.Z-hotfix.1 < X.Y.Z-hotfix.2 < X.Y.(Z+1)`. This is
   deliberately the opposite of semver, because a hotfix is cut after its
   base. Any other suffix (`-rc.1`, `-beta.2`) follows semver and sorts
   **before** its base. Comment this beside the comparator.
3. **Changelog base everywhere = the nearest ancestor tag** (`git describe
   --tags --abbrev=0`, matching suffixed tags too). This applies to hotfixes,
   to mainline with HEAD untagged, to HEAD-at-tag, and to `--retro` pairing.
   It replaces "newest tag by sort". Consequence, accepted on purpose: a fix
   cherry-picked to main **reappears** in the next mainline section, because
   test/demo first get it there. That reverses the default-path effect of
   bug-hotfix-duplicate-changelog. `rangeSince`'s three-dot cherry-pick form
   stays: it is identical when the base is an ancestor, and still protects an
   override that is not.
4. **`RELEASE_BASE_TAG`** env var overrides the base. ereqs's
   `release-hotfix.sh` keeps working until it switches, and the new command
   passes it too.
5. **No ancestor tag while tags exist:** unshallow first, because shallow CI
   clones hide ancestors. If there is still none, exit non-zero, write
   nothing, and name `RELEASE_BASE_TAG`. Never fall back to all history: being
   unable to tell must not rewrite the changelog. With no tags at all, keep
   today's behaviour (all history).
6. **Shape: a managed script**, `scripts/release-hotfix.cjs`, wired as
   `release:hotfix`. There is no CLI subcommand, because consumers (ereqs)
   don't depend on the skittership package at runtime, like the other
   generators. The installer adds the helper only when absent, unless
   `--force` is passed.
7. **Refusals** (each exits non-zero with a one-line reason): not on a branch
   matching `hotfix.branchPrefix` (config, default `hotfix/`); a dirty tree;
   no ancestor release tag; a consumer `postversion` script, unless
   `--allow-postversion` is passed, since that script may push and nothing
   here can tell.
8. **Never pushes by default.** It prints the exact next commands. `--push`
   pushes the branch, then the tag (the tag starts the deploy). Carrying the
   fix to main is left to the caller (skitterspec).
9. **Runs the project's package manager** (`packageManager` field → lockfile →
   npm): `<pm> version <v>` with `RELEASE_BASE_TAG=<base>`, so the existing
   `preversion`/`version` hooks run unchanged.
10. **`--json`** prints `{tag, version, baseTag, versionCommit, branch}` on
    stdout. All child output goes to stderr, so stdout stays parseable.
    `--dry-run` prints the version and base, and changes nothing.
11. **ereqs's installed copies are customized.** Their hashes for
    `git-commits.cjs`, `generate-releases.cjs` and `check-release-index.cjs`
    don't match its manifest, contrary to the handoff. They will be
    `customized — kept`, so the release note must point those users at
    `update --force` plus re-applying their edits.

## Solution overview

- `git-commits.cjs` gets a suffix-aware `compareVersions`, a shared
  `VERSION_PATTERN`, and `nearestAncestorTag(ref)`. `getCommitsSinceLastTag`
  and the retro pairing take their base from `RELEASE_BASE_TAG` or the nearest
  ancestor.
- Both generators capture the full version in their insertion regexes.
  `nextFreePatch` handles a suffixed version safely.
- New `release-hotfix.cjs` exports pure helpers (`nextHotfixVersion`,
  `rootOf`, `detectPackageManager`) for unit tests. Its `main()` runs the git
  and package-manager steps.

```
$ node scripts/release-hotfix.cjs --json
{"tag":"v1.0.0-hotfix.1","version":"1.0.0-hotfix.1","baseTag":"v1.0.0",
 "versionCommit":"3f2a…","branch":"hotfix/x"}
```

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | add | `release:hotfix` → `scripts/release-hotfix.cjs [--json] [--dry-run] [--push] [--allow-postversion]` |
| Release script | add | `scripts/release-hotfix.cjs` (managed, in manifest) |
| Config key | add | `hotfix.branchPrefix` (default `hotfix/`) |
| Env var | add | `RELEASE_BASE_TAG` — overrides the changelog base |
| Business rule | update | changelog base = nearest ancestor tag (was newest by sort) |
| Business rule | update | `compareVersions`: `-hotfix.N` after base, other suffixes before |
| Release script | update | generator insertion regexes capture suffixed versions |
| Release script | update | `check-release-index.cjs`: `nextFreePatch` suffix-safe |
| Installer | update | `src/init.js`: ships + wires the new script |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Suffix-aware ordering in generators | ⬜ | [01-suffix-ordering.md](01-suffix-ordering.md) |
| 2 | Nearest-ancestor changelog base | ⬜ | [02-ancestor-base.md](02-ancestor-base.md) |
| 3 | `release:hotfix` command | ⬜ | [03-release-hotfix-command.md](03-release-hotfix-command.md) |
| 4 | Install, upgrade path and docs | ⬜ | [04-install-and-docs.md](04-install-and-docs.md) |

## Open questions

- None

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-10-21 | Ready | backlog | Reuben Greaves |

## Changelog

- 2026-10-21 — Spec created from the ereqs handoff. Three of the handoff's
  claims were corrected against the code: ereqs's managed copies are
  customized; `RELEASE_BASE_TAG` exists only in ereqs's local patch; the
  generators' idempotence regexes already match suffixed versions, and only
  the insertion regexes are broken.
- 2026-10-21 — Chose option (a), the nearest-ancestor base, over keeping
  sort + cherry-pick. This knowingly reverses the default-path dedupe from
  bug-hotfix-duplicate-changelog.

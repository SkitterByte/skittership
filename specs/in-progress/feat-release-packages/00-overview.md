---
github_identifier: "#1"
github_url: "https://github.com/SkitterByte/skittership/issues/1"
github_assignee_id: "SkitterByte"
github_assignee_name: "Reuben Greaves"
---

# Per-package release notes for monorepo tag series

> **Type:** Feature
> **Name:** feat-release-packages (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — Phase 1 (started 2026-11-09)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-11-09
> **Area:** assets/scripts/lib/git-commits.cjs, assets/scripts/lib/config.cjs, assets/scripts/generate-releases.cjs, assets/scripts/generate-changelog.cjs, src/init.js, scripts/ (dogfood copies), README.md, assets/claude-md-section.md
> **Stack:** worktree

## Problem

The generators cannot find the previous release in a repo that tags
`<pkg>@x.y.z`. `nearestAncestorTag` asks `git describe` with
`--match "v[0-9]*…" --match "[0-9]*…"`, so a `skitterspec@16.3.0` tag is
invisible and the base falls through to a legacy `v1.0.1` — years of history.
`v` is also hardcoded in the version fallback, `getTagDate`, the
already-tagged check and `getAllVersionTags`. So skitterspec wrote
`scripts/release-notes.js`, which supplies the base **and** path→package
attribution (`FEEDS`: `packages/common/**` ships in all five distributions)
**and** an orphan-footer report, while reusing `generate-releases.cjs`'s pure
render functions. That seam belongs in skittership, so a monorepo is config, not
a fork.

## Decisions

1. **A `packages` map in `skittership.config.json`, opt-in.** Unset, every
   generator's output and stdout are byte-identical to today, proved by a test.
   Rejected: a separate config file — one config is the existing contract.
2. **A tag *prefix*, not a tag pattern.** `tagPrefix` (default `<name>@`) maps
   both ways — `version → tag` for dating and the already-tagged check,
   `tag → version` for listing — which a free-form glob or regex cannot. The
   single-package default stays `v` plus bare digits, exactly as now.
3. **Base = nearest ancestor tag with that prefix**, per
   feat-hotfix-suffix-release Decision 3 — not skitterspec's "highest semver
   below the version". Identical on skitterspec's linear history, and one rule
   for the whole tool.
4. **First release of a package is a positive fact.** No tag with the prefix
   exists *anywhere* → all history through the range end. Prefix tags exist but
   none is an ancestor → refuse with `NO_BASE_TAG`, as today.
5. **Attribution by changed paths** (`paths` globs; absent = every commit). A
   commit belongs to every package one of its files matches, so a shared
   `packages/common/**` change appears in each. Zero-dep glob matcher
   (`**`, `*`, `?`).
6. **Orphans are reported, never refused.** Footer-carrying commits in the range
   that match no package are listed on every `--package` run; exit 0.
7. **`emptyRelease` applies per package**, like the single file: a release with
   no notes for that package still gets its heading and placeholder
   (feat-empty-release-notes). This differs from skitterspec's script, which
   writes nothing; `emptyRelease: false` restores that.
8. **`--range <from>..<to>`** on both generators names the base explicitly and
   wins over `RELEASE_BASE_TAG` and the computed base. It runs through
   `rangeSince` (same cherry-pick semantics) and refuses non-zero when either
   end does not resolve to a commit.
9. **CHANGELOG stays one file.** `--package` is releases-only; `--range` works
   on both.
10. **`init`/`update` carry `packages` through the config rewrite** —
    `serializeConfig` today writes only known keys and would drop it.

Non-goals: merge-aware walking, rc versions, env reporting (rc-flow is out of
scope — see Changelog); the release command (feat-release-command).

## Solution overview

```json
"packages": {
  "skitterspec-linear": {
    "tagPrefix": "skitterspec-linear@",
    "paths": ["packages/common/**", "packages/sync-core/**", "packages/linear/**"],
    "releasesFile": "RELEASES-skitterspec-linear.md",
    "productName": "skitterspec-linear",
    "dir": "packages/skitterspec-linear"
  }
}
```

All fields optional except the key. `dir` lets `--package` read the version from
`<dir>/package.json` when none is passed. Then:

```
node scripts/generate-releases.cjs --package skitterspec-linear [17.1.0]
node scripts/generate-releases.cjs --package skitterspec-linear --retro
node scripts/generate-releases.cjs --range skitterspec@16.3.0..HEAD 16.4.0
```

`lib/git-commits.cjs` gains a tag-scheme object (`{ prefix, tagFor, versionOf,
describeMatch }`) threaded through `nearestAncestorTag`,
`getCommitsSinceLastTag`, `getAllVersionTags` and `getTagDate`; the default
scheme reproduces today's `v`/bare behaviour.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Config key | add | `packages.<name>.{tagPrefix,paths,releasesFile,productName,dir}` |
| CLI command | add | `generate-releases.cjs --package <name> [version] [--retro]` |
| CLI command | add | `generate-releases.cjs` / `generate-changelog.cjs --range <from>..<to>` |
| Service | update | `lib/git-commits.cjs` tag scheme (prefix-aware base, date, listing) |
| Business rule | add | path attribution; orphan-footer report (exit 0) |
| Business rule | add | first release of a prefix = all history; no ancestor among existing prefix tags = refuse |
| Service | update | `src/init.js` `serializeConfig` keeps `packages` |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Tag scheme replaces the hardcoded `v`, output unchanged | ⬜ | [01-tag-scheme.md](01-tag-scheme.md) |
| 2 | `packages` config, `--package`, path attribution, orphans | ⬜ | [02-packages.md](02-packages.md) |
| 3 | `--range`, docs, skitterspec-shaped fixture | ⬜ | [03-range-and-docs.md](03-range-and-docs.md) |

## Open questions

- None

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-11-09 | Ready | backlog | Reuben Greaves |
| 2026-11-09 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-11-09 — Spec created. Split from a wider brief into this and
  feat-release-command. Corrected against the code: the base is not
  "ambiguous" — `describe`'s match glob cannot see `<pkg>@` tags at all; and
  skitterspec's `release-notes.js` supplies path attribution and an orphan
  report, not only commit selection.
- 2026-11-09 — Dropped from the brief: LSC's rc-flow (rc version state, env
  branch reporting, the hotfix line kept out of the next rc) and merge-aware
  walking. LSC releases by branch, manually; skitterspec lands `--ff-only`, so
  neither has a user here. feat-hotfix-suffix-release Decision 3 (a carried
  hotfix reappears in main's next section) stands.

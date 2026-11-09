---
github_issue_id: "#2"
---

# Phase 1 — Tag scheme replaces the hardcoded `v`, output unchanged ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** every `v`-assumption in `lib/git-commits.cjs` goes through one tag
scheme whose default reproduces today exactly; proven by golden output.

## Tasks

- [x] Add `tagScheme(prefix)` to `lib/git-commits.cjs`: `tagFor(version)`,
      `versionOf(tag)` (null when not this scheme), `describeMatch` args. The
      default scheme is `v` plus bare `X.Y.Z`, matching `DESCRIBE_MATCH` today.
- [x] Thread an optional scheme through `nearestAncestorTag`,
      `getCommitsSinceLastTag` (version fallback, `BUILD_SOURCEBRANCH` check),
      `getAllVersionTags`, `getTagDate` and `tagExists` callers in both
      generators; default argument = default scheme.
- [x] Note the blind spot beside `describeMatch`: a prefix that is itself a
      prefix of another package's (`a@` vs `ab@`) is safe only because the
      glob includes the `@`; say so (`.claude/rules/negative-checks.md` rule 2).
- [x] Golden test: on a fixture repo with no `packages` config, both
      generators' file output **and stdout** are byte-identical to the pre-change
      scripts (single release, retro, hotfix suffix, first release).
- [x] Unit tests for `tagFor`/`versionOf` with `v`, bare, `pkg@`, and a
      suffixed version (`pkg@1.0.0-hotfix.1`).
- [x] Mirror into `scripts/` (dogfood copies); `pnpm test` green.

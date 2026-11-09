---
github_issue_id: "#3"
---

# Phase 2 — `packages` config, `--package`, path attribution, orphans ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `generate-releases.cjs --package <name>` writes that package's notes
from its own tag series, attributed by path, with orphans reported.

## Tasks

- [x] `lib/config.cjs`: normalise `packages` (defaults: `tagPrefix` `<name>@`,
      `releasesFile` `RELEASES-<name>.md`, `productName` `<name>`, `paths`
      absent = all). Absent key → `packages: null`; malformed entry → clear
      error naming the package.
- [x] `src/init.js` `serializeConfig`: write `packages` back when present; test
      that `init` and `update` round-trip it and that a config without it is
      rewritten byte-identically.
- [x] Zero-dep glob matcher (`**`, `*`, `?`, literal otherwise) in
      `lib/git-commits.cjs`, with unit tests.
- [x] Commit selection with changed paths (`--name-only`, NUL/RS-delimited) used
      **only** on the `--package` path, so the default walk is untouched.
- [x] `--package <name> [version]`: version from the arg, else
      `<dir>/package.json`, else refuse naming both. Base = nearest ancestor
      with the package's prefix; no prefix tag anywhere = first release (all
      history); prefix tags exist, none an ancestor = `NO_BASE_TAG` refusal.
- [x] `--package <name> --retro [count]`: pairs that package's tags only.
- [x] Orphan report on every `--package` run: footer commits in the range that
      match no configured package, one subject per line; exit 0.
- [x] Unknown `--package` name refuses non-zero, listing the configured names.
- [x] Tests, including stays-silent ones: a package with no tags yet (first
      release, no refusal); a range with no footers (placeholder, no orphan
      lines); a shared-path commit appearing in two packages exactly once each;
      `emptyRelease: false` writes nothing for a package with no notes.
- [x] Mirror into `scripts/`; `pnpm test` green.

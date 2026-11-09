---
github_issue_id: "#6"
---

# Phase 1 — Ship a generalised approve-release, opt-in ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `approve-release.cjs` ships to projects with `release.staged: true`,
resolves a package/version to a stage-id, and replaces skittership's repo-local
copy.

## Tasks

- [ ] Move `scripts/approve-release.cjs` to `assets/scripts/`; take
      `[<package>] [<version>|<stage-id>] [--reject]`; resolve the npm name from
      `packages.<name>.npm`, else `<dir>/package.json`, else the root.
- [ ] Keep the `MIN_NPM` check, the bare-UUID passthrough, and "not staged →
      print what is"; carry over `test/approve-release.test.js` and extend it
      for the package argument and an unknown package.
- [ ] `lib/config.cjs`: normalise `release` (absent → `null`) and
      `release.staged`; `src/init.js` `serializeConfig` keeps `release`.
- [ ] `src/init.js`: install the script and `approve`/`staged` helpers only when
      `release.staged` is true; never overwrite a differing helper without
      `--force` (existing rule).
- [ ] Stays-silent test: `init`/`update` on a project with no `release` key
      writes the same files and `package.json` as today.
- [ ] Dogfood: set `release.staged` here, let the managed copy replace the
      repo-local one; `pnpm test` green.

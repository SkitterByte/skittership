# Phase 3 — `release:hotfix` command ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `node scripts/release-hotfix.cjs` on a hotfix branch cuts
`v<root>-hotfix.<N+1>` through the project's own version hooks and pushes
nothing. Proven end to end in a temp repo.

## Tasks

- [ ] Add `hotfix.branchPrefix` (default `hotfix/`) to
      `assets/scripts/lib/config.cjs` defaults, merge and doc comment.
- [ ] Create `assets/scripts/release-hotfix.cjs` with pure, exported helpers:
      `rootOf(tag)`, `nextHotfixVersion(baseTag, tags)` and
      `detectPackageManager(dir)` (`packageManager` field → lockfile → npm).
- [ ] `main()`: parse `--json --dry-run --push --allow-postversion`. Run the
      refusals from Decision 7. Fetch tags (best-effort; comment the
      remote-only blind spot). Pick the version, then run
      `<pm> version <v>` with `RELEASE_BASE_TAG=<base>` and child stdio sent
      to stderr. Read back `versionCommit` (`git rev-parse HEAD`) and confirm
      the tag points at it.
- [ ] Default output: the next commands (`git push origin <branch>`, then
      `git push origin <tag>`, then carrying to main). `--push` runs the two
      pushes in that order.
- [ ] Confirm `pnpm version <explicit-prerelease>` runs `preversion`/`version`
      and commits and tags like `npm version`. The CLAUDE.md claim was
      verified only for `patch`.
- [ ] Tests:
  - [ ] unit: `v37.2.0` → `v37.2.0-hotfix.1`; `.1`+`.2` present → `.3`;
        base `v36.4.0-hotfix.2` → `v36.4.0-hotfix.3` (not `v36.4.1`); an
        existing `v37.2.1` is ignored; a hotfix tag on another branch still
        takes its number
  - [ ] integration (temp repo): `v1.0.0`, main commits + `v1.1.0`,
        `hotfix/x` off `v1.0.0`, one fix, then run the command → tag
        `v1.0.0-hotfix.1` on the version commit; the changelog section lists
        only the fix; `--json` matches; no push (use a bare remote and
        assert it is untouched)
  - [ ] refusals: off-prefix branch, dirty tree, no ancestor tag, and a
        `postversion` script; each exits non-zero with one line.
        `--allow-postversion` proceeds
  - [ ] `--dry-run` changes nothing (refs and tree unchanged)
  - [ ] `--push` against a bare remote: the branch arrives before the tag
- [ ] Run `pnpm test` — green before the phase is done.

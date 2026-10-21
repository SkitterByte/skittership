# Phase 1 — Suffix-aware ordering in generators ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** generating `36.4.0-hotfix.2` puts its section above `36.4.0-hotfix.1`
in both CHANGELOG and RELEASES, while output for plain versions stays
byte-identical.

## Tasks

- [ ] Rewrite `compareVersions` (`assets/scripts/lib/git-commits.cjs`) for
      Decision 2. Put the ordering comment beside it.
- [ ] Export a shared version pattern
      (`\d+(?:\.\d+)*(?:-[0-9A-Za-z.-]+)?`). Use it in the insertion regexes
      at `generate-changelog.cjs:151` and `generate-releases.cjs:207`.
- [ ] Make `nextFreePatch` (`check-release-index.cjs`) work on the root of a
      suffixed version instead of `parseInt('0-hotfix')`.
- [ ] Mirror every change into `scripts/` (this repo dogfoods its own copies).
- [ ] Tests:
  - [ ] the comparator orders `1.0.0-rc.1 < 1.0.0 < 1.0.0-hotfix.1 <
        1.0.0-hotfix.2 < 1.0.0-hotfix.10 < 1.0.1 < 1.1.0`
  - [ ] the handoff repro: inserting `36.4.0-hotfix.2` lands above
        `[36.4.0-hotfix.1]` in CHANGELOG, and above `## 36.4.0-hotfix.1` in
        RELEASES
  - [ ] re-running a suffixed version replaces its own section only
        (idempotence)
  - [ ] `getAllVersionTags` keeps `v1.0.0-hotfix.1`
  - [ ] stays-silent: a fixture with only plain versions gives byte-identical
        CHANGELOG/RELEASES before and after
  - [ ] a mainline `npm version minor|patch` with a `-hotfix.N` tag present
        never trips the tag-collision abort, and the patch-hotfix collision
        case still aborts
- [ ] Run `pnpm test` — green before the phase is done.

## Notes

The idempotence and remove regexes (`upsertSection`, `removeSection`, and
their RELEASES twins) already escape the full version, so they need no change.
The test above pins that.

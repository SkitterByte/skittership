# Phase 1 — Suffix-aware ordering in generators ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** generating `36.4.0-hotfix.2` puts its section above `36.4.0-hotfix.1`
in both CHANGELOG and RELEASES, while output for plain versions stays
byte-identical.

## Tasks

- [x] Rewrite `compareVersions` (`assets/scripts/lib/git-commits.cjs`) for
      Decision 2. Put the ordering comment beside it.
- [x] Export a shared version pattern
      (`\d+(?:\.\d+)*(?:-[0-9A-Za-z.-]+)?`). Use it in the insertion regexes
      at `generate-changelog.cjs:151` and `generate-releases.cjs:207`.
- [x] Make `nextFreePatch` (`check-release-index.cjs`) work on the root of a
      suffixed version instead of `parseInt('0-hotfix')`.
- [x] Mirror every change into `scripts/` (this repo dogfoods its own copies).
- [x] Tests (`test/hotfix-suffix.test.js`):
  - [x] the comparator orders `1.0.0-rc.1 < 1.0.0 < 1.0.0-hotfix.1 <
        1.0.0-hotfix.2 < 1.0.0-hotfix.10 < 1.0.1 < 1.1.0`
  - [x] the handoff repro: inserting `36.4.0-hotfix.2` lands above
        `[36.4.0-hotfix.1]` in CHANGELOG, and above `## 36.4.0-hotfix.1` in
        RELEASES
  - [x] re-running a suffixed version replaces its own section only
        (idempotence)
  - [x] `getAllVersionTags` keeps `v1.0.0-hotfix.1`
  - [x] stays-silent: a fixture with only plain versions gives byte-identical
        CHANGELOG/RELEASES before and after
  - [x] a mainline `npm version minor|patch` with a `-hotfix.N` tag present
        never trips the tag-collision abort, and the patch-hotfix collision
        case still aborts
- [x] Run `pnpm test` — green before the phase is done (193/193).

## Notes

The idempotence and remove regexes (`upsertSection`, `removeSection`, and
their RELEASES twins) already escape the full version, so they need no change.
The test above pins that.

The stays-silent check compares the old comparator and old heading regexes
with the new ones over plain versions. They agree on every pair and every
insertion point, and those are the only two inputs that changed, so the
output is byte-identical by construction. This is cheaper than diffing two
script versions.

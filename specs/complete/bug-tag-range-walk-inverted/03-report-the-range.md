# Phase 3 — Make the resolved range visible

**Goal:** a generator run says which commit range it used, so a wrong range is
visible at the moment it happens rather than N lines into a diff.

The bug's real cost was its silence: a whole-history section and a correct
section both printed `✅ Updated CHANGELOG.md with version 36.1.1`. The commit
count was in the release-notes line (`433 note(s)`) and still read as success.

## Tasks

- [ ] Have `getCommitsSinceLastTag` expose the range it resolved (e.g. return
      `{ commits, range }`, or accept an `onRange` callback). Keep the existing
      array return working for current callers, or update all of them in this
      phase — do not leave two shapes in play.
- [ ] `assets/scripts/generate-changelog.cjs`: include the range in the success
      line, e.g. `✅ Updated CHANGELOG.md with version 2.0.0 (v1.1.0..v2.0.0)`.
- [ ] `assets/scripts/generate-releases.cjs`: same, alongside the existing note
      count.
- [ ] When the whole-history fallback is taken, say so explicitly rather than
      printing an empty range — `(all history — no earlier tag)`. That branch is
      legitimate for the oldest tag and alarming anywhere else, and naming it is
      what makes the difference legible.
- [ ] Extend the phase 1 tests to assert the reported range for cases A, B, C
      and E.
- [ ] Run `pnpm test`.

## Notes

This phase is small and self-contained; if it is deferred, the bug is still
fixed. It is included because the same class of silence is what let an inverted
index live in a released package through several versions.

# Phase 2 — Nearest-ancestor changelog base ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** every generator path takes its base from `RELEASE_BASE_TAG` or the
nearest ancestor tag, proven by a second-hotfix fixture that no longer
re-lists hotfix.1.

## Tasks

- [x] Add `nearestAncestorTag(ref)` to `git-commits.cjs`:
      `git describe --tags --abbrev=0 --match 'v[0-9]*' <ref>`. On a shallow
      repo, unshallow first. Name the blind spot (shallow clones) in a
      comment.
- [x] `getCommitsSinceLastTag`: base = `RELEASE_BASE_TAG` (trimmed) → nearest
      ancestor of `HEAD` (untagged) or of `<currentTag>^` (HEAD at tag). Drop
      the `allTags[0]` / `allTags[currentIndex+1]` selection. Keep the
      no-tags-at-all and oldest-tag paths.
- [x] Apply Decision 5: tags exist but there is no ancestor even after
      unshallow → throw a clear error naming `RELEASE_BASE_TAG`. The
      generators exit non-zero without writing. Check that the outer
      `catch` → all-history fallback does **not** swallow it.
- [x] Retro (`--retro` in both generators): pair each tag with its nearest
      ancestor tag instead of its sort-order neighbour.
- [x] Report the range via `onRange` as today, adding `(RELEASE_BASE_TAG)`
      when overridden.
- [x] Mirror into `scripts/`.
- [x] Tests (`test/ancestor-base.test.js`, `test/hotfix-range.test.js`):
  - [x] update `test/hotfix-range.test.js`: the next mainline release
        after a hotfix now **lists** F′ (Decision 3). Rewrite the header
        comment to say why
  - [x] second hotfix: `v1.0.0 → fix1 → v1.0.0-hotfix.1 → fix2`, with
        `v1.1.0` on main, gives a range containing only fix2
  - [x] mainline after a suffix hotfix (the ereqs `v37.0.0` case) uses the
        mainline ancestor, not the hotfix tag
  - [x] `RELEASE_BASE_TAG` wins over the ancestor
  - [x] no ancestor with tags present → non-zero exit, files untouched
  - [x] stays-silent: the existing linear-history range tests pass unchanged
        (ancestor = sort neighbour there)
  - [x] *(added)* a `RELEASE_BASE_TAG` that is not a tag refuses, and
        writes nothing
  - [x] *(added)* `--retro` gives each tag a section built from its ancestor
  - [x] *(added)* a shallow clone deepens itself and finds the ancestor.
        The fixture asserts that `git describe` fails before deepening
- [x] Run `pnpm test` — green before the phase is done (200/200).

## Notes

`rangeSince` keeps its three-dot cherry-pick form. With an ancestor base it is
the same set as `A..B`. It still matters when `RELEASE_BASE_TAG` points at a
non-ancestor, and a test pins that.

The old code already gave the second-hotfix case the right commit set. Its
three-dot range from `v1.1.0` dropped F1 because F1′ sat on main. But it got
there by matching patch content, so a pick with resolved conflicts was listed
twice, and it reported a misleading range. The ancestor base gets the same
answer from history alone.

Of the "no ancestor" cases, only one refuses: an untagged HEAD. A tagged HEAD
with no earlier ancestor is the first release in its history. It keeps
today's "all history through the tag" path, which existing tests pin.

# Phase 2 — Nearest-ancestor changelog base ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** every generator path takes its base from `RELEASE_BASE_TAG` or the
nearest ancestor tag, proven by a second-hotfix fixture that no longer
re-lists hotfix.1.

## Tasks

- [ ] Add `nearestAncestorTag(ref)` to `git-commits.cjs`:
      `git describe --tags --abbrev=0 --match 'v[0-9]*' <ref>`. On a shallow
      repo, unshallow first. Name the blind spot (shallow clones) in a
      comment.
- [ ] `getCommitsSinceLastTag`: base = `RELEASE_BASE_TAG` (trimmed) → nearest
      ancestor of `HEAD` (untagged) or of `<currentTag>^` (HEAD at tag). Drop
      the `allTags[0]` / `allTags[currentIndex+1]` selection. Keep the
      no-tags-at-all and oldest-tag paths.
- [ ] Apply Decision 5: tags exist but there is no ancestor even after
      unshallow → throw a clear error naming `RELEASE_BASE_TAG`. The
      generators exit non-zero without writing. Check that the outer
      `catch` → all-history fallback does **not** swallow it.
- [ ] Retro (`--retro` in both generators): pair each tag with its nearest
      ancestor tag instead of its sort-order neighbour.
- [ ] Report the range via `onRange` as today, adding `(RELEASE_BASE_TAG)`
      when overridden.
- [ ] Mirror into `scripts/`.
- [ ] Tests:
  - [ ] update `test/hotfix-range.test.js`: the next mainline release
        after a hotfix now **lists** F′ (Decision 3). Rewrite the header
        comment to say why
  - [ ] second hotfix: `v1.0.0 → fix1 → v1.0.0-hotfix.1 → fix2`, with
        `v1.1.0` on main, gives a range containing only fix2
  - [ ] mainline after a suffix hotfix (the ereqs `v37.0.0` case) uses the
        mainline ancestor, not the hotfix tag
  - [ ] `RELEASE_BASE_TAG` wins over the ancestor
  - [ ] no ancestor with tags present → non-zero exit, files untouched
  - [ ] stays-silent: the existing linear-history range tests pass unchanged
        (ancestor = sort neighbour there)
- [ ] Run `pnpm test` — green before the phase is done.

## Notes

`rangeSince` keeps its three-dot cherry-pick form. With an ancestor base it is
the same set as `A..B`. It still matters when `RELEASE_BASE_TAG` points at a
non-ancestor.

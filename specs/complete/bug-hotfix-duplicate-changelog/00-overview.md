# Bug: Cherry-picked hotfix commits listed twice in release notes

> **Type:** Bug
> **Name:** bug-hotfix-duplicate-changelog
> **Status:** Complete (2026-10-13)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-10-12
> **Area:** assets/scripts/lib/git-commits.cjs, assets/scripts/check-release-index.cjs

## Symptom

After a hotfix (tag `vX.Y.Z+1` cut on a branch from `vX.Y.Z`, fix commits
cherry-picked onto `main`), the next release from `main` lists the
cherry-picked copies again in `CHANGELOG.md` and `RELEASES.md`. Separately,
`npm version patch` on `main` computes the hotfix's version, regenerates and
commits, and only then fails on the existing tag.

Reported from a consumer (ereqs, 2026-10-12): `v36.2.9` was a hotfix, so
`git log v36.2.9..main` gave 50 commits, 6 of them cherry-picked copies; the
`--cherry-pick --right-only v36.2.9...main` form gives 44.

## Root cause

`getCommitsSinceLastTag` (`assets/scripts/lib/git-commits.cjs`) took
`<prevTag>..<rangeEnd>`, which excludes only commits *reachable* from the
previous tag. A hotfix tag is not an ancestor of main, and its fixes reached
main under new SHAs, so they were counted again. `getCommitsBetween` (`--retro`)
and `countCommitsSince` had the same form. Separately,
`check-release-index.cjs` never looked at tags, so a version that was already
tagged got all the way to npm's tag step.

## Failing test (red)

`test/hotfix-range.test.js`: a fixture with `v1.0.0`, fix F tagged `v1.0.1`
on a branch, and M then F′ (cherry-picked) on main. Red:

    actual: [ 'count hops', 'unrelated' ],
    expected: [ 'unrelated' ],

`test/check-release-index.test.js`: the guard with `v1.0.1` already tagged
exited 0 (`actual: 0, expected: 1`).

## Fix

- [x] Build every since-tag range as `--cherry-pick --right-only A...B`
      (`rangeSince`), for the main path, the shallow-clone retry, `--retro`
      and the pending count; the oldest-tag `git log <tag>` stays as it was
- [x] Report the range as `A..B` when A is an ancestor (it is the same set),
      and as `A...B (cherry-picks already in A dropped)` when it is not
- [x] Guard: inside the `version` lifecycle, refuse when
      `<tag-version-prefix><version>` is already a tag, naming it and the next
      free patch; no auto-bump
- [x] Failing tests now pass; `pnpm test` 183/183; old and new ranges are
      byte-identical over every tag pair in this repo
- [ ] *(Deferred — follows the landing)* Patch release, with a changelog note that consumers who edited their
      copy of `git-commits.cjs` have to merge rather than overwrite

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Release script | update | `lib/git-commits.cjs`: since-tag ranges drop cherry-picks |
| Release script | update | `check-release-index.cjs`: refuses an already-tagged version |

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-10-12 | In Progress | in-progress | Reuben Greaves |
| 2026-10-13 | Complete | complete | Reuben Greaves |

## Changelog

- 2026-10-12 — Bug reproduced; failing tests added (red). The first fixture
  picked F straight onto `v1.0.0` in the same second, which made F′ the same
  SHA as F (the linear case), so M now lands first.
- 2026-10-12 — Fixed: three-dot cherry-pick ranges and the existing-tag
  guard; tests green. Not covered: a cherry-pick that needed conflict
  resolution has a different patch-id, so it is still listed (fails toward a
  duplicate, never a drop). The consumer's `baseTag` override is not
  upstreamed here.
- 2026-10-13 — Completed; fix done, tests green. Deferred: the patch
  release, which can only be cut from main after this lands; the
  consumer note is already in the commit's Release-Note footer.

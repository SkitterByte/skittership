# Phase 1 — Failing tests for range resolution

**Goal:** pin every branch of `getCommitsSinceLastTag`'s tag-range resolution
with real git fixtures, and watch the two defective cases fail. No production
change in this phase.

`test/git-commits.test.js` covers `parseCommit` and `reconstructCommits` only —
the range resolution, where the bug lives, has no test at all. That absence is
why an inverted index shipped.

## Tasks

- [ ] Add a fixture helper that builds a throwaway repo in a temp dir: `git init`,
      a local `user.email` / `user.name`, `commit.gpgsign false`, then N commits
      with tags at chosen points. Model it on `scripts/lib/git-commits.test.cjs`
      in `~/code/ereqs` (real temp repos, `node --test`, no stubs).
- [ ] Make the helper `process.chdir()` into the fixture and restore the previous
      cwd afterwards — `getCommitsSinceLastTag` reads `process.cwd()` and
      shells out to `git`, so the test's own repo must never be the subject.
- [ ] Assert `git` is available and fail the suite loudly if not, rather than
      letting a missing binary look like a passing range.
- [ ] **Case A — between releases (currently returns the whole history).**
      Tags `v1.0.0`, `v1.1.0`, `v2.0.0`; HEAD one commit past `v2.0.0`;
      package.json at `2.0.0`. Expect exactly the `v1.1.0..v2.0.0` commit.
- [ ] **Case B — HEAD checked out at a middle tag (currently returns nothing).**
      Expect exactly the `v1.0.0..v1.1.0` commit.
- [ ] **Case C — HEAD at the OLDEST tag.** Expect the whole history — this is the
      only input for which that fallback is correct.
- [ ] **Case D — a repo with exactly one tag.** Expect the whole history.
- [ ] **Case E — the stays-silent case: the `npm version` path.** New version not
      yet tagged (package.json at `2.1.0`, no `v2.1.0` tag), HEAD past the newest
      tag. Expect `v2.0.0..HEAD`. This path is correct today and must still be
      correct after phase 2 — it is the only thing standing between the fix and
      every real release.
- [ ] **Case F — `BUILD_SOURCEBRANCHNAME` set to a tag.** Same expectation as
      case B. Save and restore the env var around the test.
- [ ] Run `pnpm test`. Cases A, B (and F) MUST fail; C, D, E MUST pass. Record
      the failure output in the spec changelog — it is the red half of red→green.

## Notes

The phase is deliberately test-only. The fix is one line and already verified
(see `02-fix-the-walk.md`); the value here is the harness and the stays-silent
case, without which the same class of bug returns the next time this function is
touched.

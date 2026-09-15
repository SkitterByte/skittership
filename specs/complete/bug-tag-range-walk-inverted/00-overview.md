# Tag-range walk is inverted, so on-demand generation rewrites all history

> **Name:** bug-tag-range-walk-inverted
> **Type:** Bug
> **Status:** Complete
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-15
> **Area:** `assets/scripts/lib/git-commits.cjs`, `test/git-commits.test.js`
> **Stack:** worktree

## Problem

`getCommitsSinceLastTag` resolves the commit range for a release section. It
reads the tag list **newest-first** (`git tag --sort=-version:refname`, and the
comment above the line says so) and then indexes it as though it were
oldest-first:

```js
const currentIndex = allTags.indexOf(currentTag)
if (currentIndex > 0) {
  previousTag = allTags[currentIndex - 1]   // the NEWER neighbour
} else {
  // "This is the first tag" — returns the entire history
}
```

One inverted index, two failure modes:

| `currentTag` resolves to | Result | Why |
|---|---|---|
| the **newest** tag (index 0) | the **entire history** | `currentIndex > 0` is false, so it takes the "first tag" branch — but index 0 is the newest tag |
| any **older** tag | **nothing** | the range is backwards (`v2.0.0..v1.1.0`), so git yields no commits |

Reproduced against the published `@skitterbyte/skittership@2.0.2` with a
throwaway repo tagged `v1.0.0`, `v1.1.0`, `v2.0.0` plus one unreleased commit:

```
case 1  between releases : 4 -> [feat: four, feat: three, feat: two, feat: one]   want 1 -> [feat: three]
case 2  HEAD at v1.1.0   : 0 -> []                                               want 1 -> [feat: two]
```

The repro script is in
`docs/handoffs/skittership-tag-range-and-update-safety.md` in the `ereqs` repo
(appendix), and is to be adopted as the basis for the tests in phase 1.

**Why it has survived since the generators were written.** `npm version` never
reaches the broken branch: package.json already holds the *new* version, which
has no tag yet, so `currentTag` stays null and control falls to an `else` that
is correct (`previousTag = allTags[0]`). Every real release takes that path.

**What is actually broken is the documented manual path.** The CLAUDE.md section
skittership installs into consumers tells them notes can be regenerated "on
demand via `npm run changelog` / `npm run releases`". Between releases,
package.json names the newest tag — case 1 — so the documented command silently
rewrites the section with the project's whole history. Measured in `ereqs` on
2026-09-15: a **1,658-line** CHANGELOG section and **433** release notes under
one heading, from 2,977 commits. Exit code 0, `✅ Updated CHANGELOG.md`.

The `BUILD_SOURCEBRANCHNAME` fallback sets `currentTag` to a tag deliberately,
so a tag-triggered CI job regenerating notes hits case 1 or case 2 as well.

## Decisions

1. **Fix the index, do not re-sort the list.** The `else` branch
   (`previousTag = allTags[0]`) depends on newest-first ordering and is correct
   today; re-sorting would silently break the one path every release takes.
   Rejected: normalising to oldest-first — it moves the risk onto the working
   path for no gain.
2. **The "whole history" fallback belongs at the END of the list.** It is
   reachable only for the *oldest* tag (or a repo with one tag). Today the
   newest tag reaches it, which is the bug's loud half.
3. **Tests use real git fixtures, not stubs.** The defect is in how the code
   reads `git tag` output and hands ranges to `git log`; a stubbed tag list
   would have been written with the same inverted assumption and would have
   passed. `ereqs` has a working harness of this shape
   (`scripts/lib/git-commits.test.cjs`, 5 tests, temp repos, `node --test`).
4. **A generator run must state the range it used.** The failure was invisible —
   a wrong range and a right range both print `✅ Updated`. Printing
   `v1.1.0..v2.0.0` costs one line and makes the next such bug self-reporting.

## Solution overview

Invert the neighbour lookup and move the whole-history fallback to the end of
the list, behind real-git-fixture tests that pin every branch of the range
resolution — including the `npm version` path that is correct today and must
stay correct. Then make both generators print the range they resolved.

## Impact map

| Surface | Change | Detail |
|---|---|---|
| `assets/scripts/lib/git-commits.cjs` | Fix | `getCommitsSinceLastTag`: neighbour at `+1`; fallback guard becomes `currentIndex < allTags.length - 1` |
| `assets/scripts/generate-changelog.cjs` | Add | log the resolved range alongside the `✅ Updated` line |
| `assets/scripts/generate-releases.cjs` | Add | same |
| `test/git-commits.test.js` | Add | real-git-fixture tests for range resolution (none exist today) |
| Consumers | Behaviour | `npm run changelog` / `npm run releases` outside `npm version` start producing correct sections. Anyone who ran them and committed the result has a polluted file to regenerate — call this out in the release note |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Failing tests for range resolution](01-failing-tests.md) | ✅ |
| 2 | [Fix the walk](02-fix-the-walk.md) | ✅ |
| 3 | [Make the resolved range visible](03-report-the-range.md) | ✅ |

## Open questions

- Does any consumer rely on the current whole-history behaviour as a way of
  seeding a changelog from scratch? `--retro` is the supported route for that
  and is unaffected (it computes its own neighbour, correctly, at `idx + 1`), so
  this is expected to be a no.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-15 | Ready | backlog | Reuben Greaves |
| 2026-09-15 | Complete | backlog | Reuben Greaves |

## Changelog

- **2026-09-15** — Raised from `~/code/ereqs` while upgrading it to
  skittership 2.0.2. Bug found by running the generators during the upgrade and
  noticing a 1,658-line section for a patch release. Confirmed pre-existing
  (identical output from the pre-upgrade files), reproduced against the
  published 2.0.2 tarball, and a one-line fix verified against the repro before
  this spec was written. Authored in a consumer repo, so it is `Ready` in
  `backlog` rather than `In Progress` — pick it up with `/spec-start`, not
  `/spec-bug`.

- **2026-09-15** — Phases 1–3 delivered. Sequence differs from the spec: the
  fix (phase 2) and a first set of range tests landed in `b4e2c17` from the
  same findings *before* this spec was installed, so phase 1 was completed
  after the fix rather than red-first. To keep the red half honest, every test
  was re-run against the pre-fix file restored from `b4e2c17^` — 5 of 13 fail
  there, including case A and case F; cases D and E pass on both, which is
  correct, since those branches were never broken.

  Deviations from the written phases, all deliberate:

  - Tests live in a new `test/git-commits-range.test.js` rather than being
    added to `test/git-commits.test.js`. That file is unit tests over pure
    functions; these spawn child processes against real git fixtures and are
    ~200ms each. Splitting keeps the fast file fast.
  - The fixture does not `process.chdir()`. `getCommitsSinceLastTag` reads
    `process.cwd()`, and chdir-ing the test runner is a shared mutation across
    concurrent tests; the probe runs in a child process with `cwd` set instead,
    which achieves the isolation the task was asking for without the hazard.
  - Phase 3 keeps the array return and reports the range through an optional
    `onRange` callback, honouring "do not leave two shapes in play".
  - A fourth all-history exit was found that the phase did not list — the
    `catch` fallback when git itself errors. It reports
    `all history — git failed, fell back`, so that case is not mistaken for a
    legitimate oldest-tag fallback.

  Not yet done: the release note calling out that consumers who ran the
  generators and committed the result have a polluted file to regenerate. The
  shipped note covers the fix but not the remediation — worth adding before
  2.0.3 goes out.

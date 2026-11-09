---
github_issue_id: "#8"
---

# Phase 3 — Recorded-hash ancestry check and docs ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** a release warns when a hash recorded in the repo is not in the history
being tagged, and the whole command is documented well enough for skitterspec
to delete its own scripts.

## Tasks

- [ ] `release.recordedHashes`: `[{ files: [globs], pattern: "<regex, group 1 = hash>" }]`
      (reuse feat-release-packages' glob matcher over `git ls-files`).
- [ ] Classify each hash: resolves and is an ancestor → silent; resolves and is
      not → warn with file:line; does not resolve → `cannot tell — <sha> not in
      this clone`. Name the shallow-clone blind spot beside the check.
- [ ] Run it in `--yes` right before `git tag -a`, against the release commit;
      expose `release.cjs check-hashes [<ref>]`. Always exit 0.
- [ ] Stays-silent tests: `recordedHashes` unset prints nothing; a hash on a
      healthy history prints nothing; a hash missing from the clone says
      `cannot tell` and does not warn. Positive test: rebased branch warns.
- [ ] Document `release`, `preTag` (with skitterspec's Linux run and "nothing
      shipped" check as worked examples), one-tag-per-push and why, `approve`,
      and `check-hashes` in `README.md` and `assets/claude-md-section.md`.
- [ ] Mirror into `scripts/`; `pnpm test` green.

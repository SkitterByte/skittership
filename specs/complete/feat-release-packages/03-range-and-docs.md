---
github_issue_id: "#4"
---

# Phase 3 — `--range`, docs, skitterspec-shaped fixture ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** an explicit range overrides the computed base on both generators, and
a repo shaped like skitterspec can drop its own `release-notes.js` on the docs
alone.

## Tasks

- [x] `--range <from>..<to>` on `generate-releases.cjs` and
      `generate-changelog.cjs`: wins over `RELEASE_BASE_TAG` and the computed
      base; runs through `rangeSince`; the reported range says `(--range)`.
- [x] Refuse non-zero, writing nothing, when `from` or `to` does not resolve to
      a commit, or the argument has no `..`. A range that resolves but holds no
      commits is **not** an error (placeholder, exit 0) — stays-silent test.
- [x] Fixture test reproducing skitterspec's layout: five interleaved
      `<pkg>@` series, legacy `v*` tags, `packages/common/**` feeding all;
      assert each package's base, notes and orphans.
- [x] Document `packages`, `--package`, `--range`, attribution, orphans and the
      first-release rule in `README.md` and `assets/claude-md-section.md`;
      include a "migrating from a hand-written release-notes script" note.
- [x] Mirror into `scripts/`; `pnpm test` green.

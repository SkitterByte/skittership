# Phase 1 — Live releases write a placeholder section ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `npm version` on a release with no user-facing notes adds a
`## <version>` section with the placeholder text, configurable via
`releases.emptyRelease`; proven by tests.

## Tasks

- [x] Add `releases.emptyRelease` to `assets/scripts/lib/config.cjs`: string →
      text (trimmed), `false` → disabled (`null`), absent/`true`/invalid →
      default `No user-facing changes in this release.`; update its doc comment
- [x] Extend `renderReleasesSection` to render the heading + empty text when
      `notes` is empty
- [x] Change `updateReleases` to render and upsert the placeholder when notes
      are empty and the text is enabled; keep the current skip + log when disabled
- [x] Mirror the changed files into the dogfood copies under `scripts/`
- [x] Tests (`test/empty-release.test.js`, `test/config.test.js`):
      no-notes release writes the placeholder; `Release-Note: none`-only range
      counts as empty; custom text is used; `false` skips and leaves the file
      unchanged (stays-silent case); a later run with notes replaces the
      placeholder; re-run over a tagged placeholder version reports unchanged
- [x] Run `pnpm test` (no typecheck — see `.claude/rules/spec-planning.md`) —
      green before the phase is done

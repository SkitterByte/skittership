# Phase 2 — `--retro` writes placeholders; docs updated ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** retro-fill gives every version tag a section, and the docs describe
the new rule and config key; proven by tests.

## Tasks

- [x] Change `retroFillReleases`: a tag with no notes is upserted with the
      placeholder (replacing any stale section); keep remove-stale/skip only
      when `emptyRelease` is `false`
- [x] Keep descending version order when placeholders are interleaved with
      real sections (including hotfix-suffixed versions)
- [x] Mirror into `scripts/`
- [x] Document `releases.emptyRelease` and the always-a-section rule in
      `README.md` (config block + Release-Note section) and the "Opt-in" bullet
      of `assets/rules/commit-messages.md`
- [x] Tests (`test/retro-ordering.test.js`):
      note-less tag gets a placeholder; stale section is replaced, not removed;
      `false` keeps the old prune behaviour; ordering holds with a mix
- [x] Run `pnpm test` — green before the phase is done

## Notes

The existing retro "removed stale section" test asserts the old behaviour;
update it to the new default and add a `false` variant rather than deleting it.

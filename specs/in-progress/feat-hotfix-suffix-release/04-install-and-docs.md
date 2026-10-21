# Phase 4 — Install, upgrade path and docs ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `init`/`update` ship and wire `release-hotfix.cjs`, customized
copies are kept safely, and the scheme is documented.

## Tasks

- [ ] `src/init.js`: install `scripts/release-hotfix.cjs` whenever the
      generators install, and record it in the manifest. Add the
      `release:hotfix` helper (skipped when a different one exists, unless
      `--force`).
- [ ] Dogfood: copy the script into this repo's `scripts/`, matching how the
      other generators are mirrored.
- [ ] Carry the `hotfix` block through `releaseFromConfig`/`serializeConfig`
      (`src/init.js`), so `init` never drops a user's `branchPrefix`. Write
      it only when it differs from the default, so existing configs stay
      byte-identical. Test both cases.
- [ ] README: document the command, flags, the `v<base>-hotfix.<N>` scheme,
      the ordering, the nearest-ancestor base, `RELEASE_BASE_TAG`, and the
      `postversion` refusal. `assets/rules/commit-messages.md` does not
      mention hotfixes, so it needs no change.
- [ ] Commit with a `Release-Note!:`. It also says that edited copies of
      `git-commits.cjs` / `generate-releases.cjs` / `check-release-index.cjs`
      are kept by `update`, and need `update --force` plus re-applying the
      edits (Decision 11).
- [ ] Tests:
  - [ ] `init` on a fresh project installs the script, the manifest entry
        and the `release:hotfix` helper
  - [ ] `update` over unedited 2.0.7 copies updates them and adds the new
        script; edited copies are `customized — kept`
  - [ ] stays-silent: an existing different `release:hotfix` script (ereqs's
        `sh scripts/release-hotfix.sh`) is kept without `--force`
- [ ] Run `pnpm test` — green before the phase is done.

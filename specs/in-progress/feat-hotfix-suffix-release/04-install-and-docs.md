# Phase 4 — Install, upgrade path and docs ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `init`/`update` ship and wire `release-hotfix.cjs`, customized
copies are kept safely, and the scheme is documented.

## Tasks

- [x] `src/init.js`: install `scripts/release-hotfix.cjs` whenever the
      generators install, and record it in the manifest. Add the
      `release:hotfix` helper (skipped when a different one exists, unless
      `--force`).
- [x] Dogfood: copy the script into this repo's `scripts/`, matching how the
      other generators are mirrored. *(Done by running
      `node bin/skittership.js update` here, which also refreshed the
      manifest and added the helper to `package.json`.)*
- [x] Carry the `hotfix` block through `releaseFromConfig`/`serializeConfig`
      (`src/init.js`), so `init` never drops a user's `branchPrefix`. Write
      it only when it differs from the default, so existing configs stay
      byte-identical. Test both cases. *(It also had to be carried through
      `resolveRelease` (`src/cli.js`) and `promptSetup` (`src/prompts.js`).)*
- [x] README: document the command, flags, the `v<base>-hotfix.<N>` scheme,
      the ordering, the nearest-ancestor base, `RELEASE_BASE_TAG`, and the
      `postversion` refusal. `assets/rules/commit-messages.md` does not
      mention hotfixes, so it needs no change.
- [x] Commit with a `Release-Note!:`. It also says that edited copies of
      `git-commits.cjs` / `generate-releases.cjs` / `check-release-index.cjs`
      are kept by `update`, and need `update --force` plus re-applying the
      edits (Decision 11).
- [x] Tests (`test/install-hotfix.test.js`, `test/dogfood-install.test.js`):
  - [x] `init` on a fresh project installs the script, the manifest entry
        and the `release:hotfix` helper
  - [x] `update` over unedited 2.0.7 copies updates them and adds the new
        script; edited copies are `customized — kept`
  - [x] stays-silent: an existing different `release:hotfix` script (ereqs's
        `sh scripts/release-hotfix.sh`) is kept without `--force`
  - [x] *(added)* with release generation disabled, no hotfix script is
        installed
  - [x] *(added)* `init` keeps a custom `hotfix.branchPrefix` and writes no
        block for the default (output byte-identical to a plain init)
- [x] Run `pnpm test` — green before the phase is done (228/228).

## Notes

`update --force` also remaps `release:hotfix` to the shipped script, like
every helper. ereqs's mapping does `--finish` teardown too, so the release
note says so. Otherwise ereqs's forced update would quietly drop that path.

This repo's own `package.json` has a `postversion` that pushes. So
`pnpm run release:hotfix` here refuses unless given `--allow-postversion`,
which is the behaviour Decision 7 asks for.

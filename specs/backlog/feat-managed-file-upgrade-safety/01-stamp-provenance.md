# Phase 1 — Stamp provenance

**Goal:** every install and update records what it wrote — the installing
version, and a hash per managed file. Behaviour is otherwise unchanged: this
phase only starts producing the evidence phase 2 consumes.

## Tasks

- [ ] Define the managed-file set in one place. `src/init.js` already lists the
      pieces (`SHARED_LIB`, `CHANGELOG_SCRIPT`, `RELEASES_SCRIPT`,
      `INDEX_GUARD_SCRIPT`, `SKILLS`, `RULES`); derive the manifest from that
      list so a file added later cannot be forgotten.
- [ ] Write `.skittership-manifest.json` in the consumer root on `init` and
      `update`:

      ```json
      {
        "installedVersion": "2.0.3",
        "files": { "scripts/generate-changelog.cjs": "sha256-…" }
      }
      ```

      Hash the **content written**, not the file re-read from disk, so a
      checkout that normalises line endings cannot make a fresh install look
      customized.
- [ ] Take `installedVersion` from the running package's own
      `package.json` — never from the consumer's config.
- [ ] Have `writeFile()` record its hash as it writes, rather than a second pass
      over the tree afterwards; a separate pass can hash a file another process
      touched in between.
- [ ] Do not write manifest entries for files the run **skipped** — the manifest
      must mean "this is what we put there", and an entry for a file we did not
      write is exactly the lie phase 2 would act on.
- [ ] Gitignore question: the manifest should be **committed**, not ignored — it
      is how a teammate's `update` knows what the last one wrote. State that in
      the README so nobody adds it to `.gitignore` on sight.
- [ ] Report the version transition in `printReport`: `skittership update →
      2.0.0 → 2.0.3` when a prior manifest exists, plain `2.0.3` when it does
      not.
- [ ] Tests in `test/init.test.js`: a fresh `init` writes a manifest naming
      every managed file; an `update` refreshes both the hashes and
      `installedVersion`; a skipped file gets no entry; the manifest is valid
      JSON with a trailing newline.
- [ ] Run `pnpm test`.

## The absence that must not become an accusation

Consumers installed before this phase have **no manifest**, and one installed
tomorrow has no entry for a file added next year. Neither is evidence that the
consumer edited anything — it is evidence that nobody was recording.

Phase 2 must treat *manifest absent* and *entry missing* as "cannot tell", never
as "customized" or as "ours to overwrite". Write the comment naming that blind
spot here, in the manifest reader, while the reason is fresh —
`.claude/rules/negative-checks.md` rule 2.

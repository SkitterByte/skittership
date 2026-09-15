# Upgrading must not silently discard a consumer's edits

> **Name:** feat-managed-file-upgrade-safety
> **Type:** Feature
> **Status:** In Progress — Phase 2 next (started 2026-09-15)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-15
> **Area:** `src/init.js`, `src/config.js`, `src/cli.js`, `test/init.test.js`
> **Stack:** worktree

## Problem

`skittership update` is `init({ force: true })` for every managed file.
`writeFile()` does compare contents, but only to choose between reporting
`skipped` and `updated` — it never asks the question an upgrade turns on:

> is this file different because the consumer edited it, or because it is an old
> copy of ours?

Those two cases are indistinguishable today and are treated identically:
overwrite, and report it as `updated`.

**Measured against `~/code/ereqs` on 2026-09-15.** Upgrading it 2.0.0 → 2.0.2
with a plain `skittership update --force` would have silently deleted all four
of these:

| File | Local extension that would have been lost |
|---|---|
| `scripts/lib/git-commits.cjs` | a `RELEASE_BASE_TAG` hotfix range override — losing it means **silently wrong commit ranges on every hotfix release** |
| `scripts/generate-releases.cjs` | a feature-flag section (`flag-report.cjs` integration, live and retro paths) |
| `.claude/skills/commit/SKILL.md` | the `Refs:` ticket trailer step |
| `.claude/rules/commit-messages.md` | the `Refs:` exception to the no-trailers rule |

The upgrade was instead done by hand — take the 2.0.2 asset, re-apply each local
extension, diff against upstream to confirm only intended deltas remain. That is
the work a manifest makes unnecessary, and it does not scale past one consumer
who happens to be the package author.

Two smaller gaps compound it:

**The `version` npm script is replaced wholesale.** `wireVersionHook` composes
one canonical string and, under `force`, assigns it. `ereqs` interposes a step:

```
node scripts/generate-changelog.cjs && node scripts/generate-releases.cjs
  && prettier --write CHANGELOG.md RELEASES.md      <- not in the canonical string
  && git add CHANGELOG.md RELEASES.md
```

An `update` drops the `prettier --write`, and the next release fails that
project's `format:check` gate with generated files as the cause — discovered on
the release commit, the worst place for it. This matters more from 2.0.2 on,
because 2.0.2 is the release that **adds** a step consumers want
(`check-release-index.cjs`). Today the only ways to get it are "let update
replace your whole hook" or "know to append it by hand".

**Nothing records which version installed the files.**
`skittership.config.json` carries `"version": 1`, but that is `SCHEMA_VERSION`
from `src/config.js` — the config schema, not the package. Working out what
`ereqs` was on required diffing its files against the assets of a known release
and inferring from which fixes were present.

## Decisions

1. **Classify, then keep.** Hash every managed file as it is written; on update,
   compare the file on disk to the hash last written. Equal → ours, safe to
   overwrite. Different → the consumer edited it: **keep it** and report it.
   This is `.claude/rules/negative-checks.md` rule 4 applied directly — three
   states, not two, and the unknown case routes to the harmless branch. Being
   wrong toward *keep* costs a stale file; being wrong toward *overwrite* costs
   the user their work.
2. **`--force` keeps today's behaviour**, so the escape hatch is explicit rather
   than the default.
3. **Follow the sibling package.** `skitterspec`'s `managedState`
   (`packages/common/src/init.js`) already does exactly this —
   `unchanged` / `customized` / `stale`, manifest at
   `specs/.core/.skitterspec-manifest.json`. Port the model rather than inventing
   a second one; a consumer with both installed should not meet two different
   answers to the same question.
4. **The manifest is a sibling file, not a section of the config.**
   `skittership.config.json` is hand-edited (scope→area map, product name); a
   block of hashes in it invites merge conflicts and accidental edits. Write
   `.skittership-manifest.json` beside it.
5. **The version hook is migrated, not replaced.** Parse the existing script; if
   the guard step is missing, append it as the last `&&` step. If the shape is
   unrecognisable, warn with the exact command to add and change nothing.

## Solution overview

Give the install provenance — a manifest recording the installing version and a
hash per managed file — then use it to make `update` a three-way decision
instead of an overwrite, and turn the version-hook rewrite into a targeted
migration that adds what is missing and preserves what is there.

## Impact map

| Surface | Change | Detail |
|---|---|---|
| `.skittership-manifest.json` (new, in consumer) | Add | `installedVersion` + `{ path: sha256 }` for every managed file |
| `src/init.js` — `writeFile` | Change | record a hash on every write; consult the manifest before overwriting |
| `src/init.js` — `wireVersionHook` | Change | append a missing step instead of replacing the script |
| `src/init.js` — `printReport` | Change | new `customized — kept` section; report `2.0.0 → 2.0.2` |
| `src/cli.js` | Change | `update` no longer implies `force: true` |
| `assets/**` | None | asset contents unchanged by this spec |
| Consumers | Behaviour | first `update` after this ships has no manifest — see the phase 1 note on that absence |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Stamp provenance](01-stamp-provenance.md) | ✅ |
| 2 | [Classify on update](02-classify-on-update.md) | ⬜ |
| 3 | [Migrate the version hook](03-migrate-version-hook.md) | ⬜ |

## Open questions

- **Manifest filename** — `.skittership-manifest.json` at the project root, or
  tucked beside the config in a `.skittership/` directory? skitterspec puts its
  manifest under `specs/.core/`, but skittership has no equivalent home of its
  own. Root is assumed below; change it in phase 1 if the maintainer prefers.
- **Should `update` gain a `--dry-run`?** It falls out of the classification for
  almost nothing and would make the first post-manifest upgrade inspectable.
  Not scheduled here; raise as its own spec if wanted.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-15 | Ready | backlog | Reuben Greaves |
| 2026-09-15 | In Progress | in-progress | Reuben Greaves |

## Changelog

- **2026-09-15** — Raised from `~/code/ereqs` while upgrading it to
  skittership 2.0.2. The four at-risk files are not hypothetical: they are what
  `ereqs` carried at the time, and the hotfix override in the first row would
  have failed silently on the next production hotfix. Full evidence in
  `docs/handoffs/skittership-tag-range-and-update-safety.md` in that repo.

- **2026-09-15** — Phase 1 done. The manifest lands at
  `.skittership-manifest.json` in the consumer root, resolving the first open
  question in favour of root.

  Three deviations from the written tasks, all deliberate:

  - **The managed-file set is derived from the `copyAsset` funnel, not from a
    re-declared list.** Every managed asset — skills, rules, generators, the
    shared lib, the index guard — already passes through that one function, so
    recording there is strictly stronger than deriving from `SHARED_LIB` +
    `SKILLS` + `RULES`: a managed file added later cannot be omitted from the
    manifest without also bypassing the installer. A parallel list could drift;
    a choke point cannot.
  - **`writeFile` now distinguishes `skipped` from `unchanged`, and records
    both writes and `unchanged`.** The task said not to record skipped files,
    and the reason given — "an entry for a file we did not write is exactly the
    lie phase 2 would act on" — is about *claiming* something the run did not
    establish. But `skipped` covered two different situations: a file that
    exists and was never opened (`force: false`), and one compared byte-for-byte
    and found identical to ours (`force: true`). Recording the second is not a
    claim, it is an observation this run actually made, and dropping it would
    lose provenance for every already-current file on an update. Only the
    never-opened case goes unrecorded.
  - **Tests live in `test/manifest.test.js`, not `test/init.test.js`.** They
    cover the manifest module as well as init's use of it, and `init.test.js` is
    already 14k.

  The "absence is not evidence" comment the phase asked for is on `readManifest`,
  covering both an absent manifest and a missing entry. `recordedHash` returns
  null for a non-string entry too, so a hand-mangled manifest degrades to
  "cannot tell" rather than throwing.

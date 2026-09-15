# ✅ Phase 2 — Classify on update

> **Status:** Done

**Goal:** `update` stops overwriting files the consumer edited. Each managed
file is classified against the manifest and routed accordingly, with the
unknown case routed to inaction.

## The classification

| On disk vs manifest hash | Meaning | Action |
|---|---|---|
| equal | our copy, untouched | overwrite with the new asset (`updated`) |
| differs | the consumer edited it | **keep**, report as `customized` |
| no manifest entry / no manifest | cannot tell | **keep**, report as `unknown — kept` |
| file absent | never installed, or deleted | write it (`created`) |

`--force` overwrites in every row — that is what it is for.

## Tasks

- [x] Stop `update` implying `force: true` in `src/cli.js`; pass the flag
      through so `update` and `update --force` differ.
- [x] Implement the table above in `writeFile()` (or a `managedState()` helper
      beside it, mirroring skitterspec's naming so the two packages read alike).
- [x] Keep the existing "content identical to the new asset" short-circuit — a
      consumer whose edit happens to match the new version is `skipped`, not
      `customized`.
- [x] Report kept files as a distinct section, with the remedy on the line:

      ```
      customized — kept (re-run with --force to overwrite):
        scripts/generate-releases.cjs
        .claude/skills/commit/SKILL.md
      ```

- [x] Exit 0 when files are kept. This is a normal, expected outcome — not a
      failure — and a non-zero exit here would break anyone running `update` in
      a scripted setup step.
- [x] Update the README: what `customized` means, why the file was kept, and how
      to take the new version (diff it, re-apply your change, or `--force` and
      re-apply after).

## Tests

- [x] An edited managed file survives `update` and is reported as customized.
- [x] The same file IS overwritten under `update --force`.
- [x] An untouched managed file is overwritten by `update` (the ordinary
      upgrade still works — this is the test that stops the feature from
      freezing every consumer at their installed version).
- [x] **Stays-silent:** a consumer with **no manifest** (the pre-2.x install, and
      the common case on first upgrade) has nothing overwritten and nothing
      reported as customized — everything lands in `unknown — kept`, and the run
      exits 0 with instructions.
- [x] **Stays-silent:** a file the consumer deleted is re-created, not reported
      as an edit.
- [x] A file whose content already equals the new asset reports `skipped`.
- [x] Run `pnpm test`.

## Release note

```
Release-Note: Upgrading skittership no longer overwrites managed files you
have edited. `skittership update` now tells the difference between its own
older copy and your changes, keeps yours, and lists what it left alone —
re-run with --force to take the new version anyway.
```

## Note on the first upgrade

The release that ships this cannot protect the upgrade that installs it: a
consumer on an older version has no manifest, so everything is `unknown — kept`
and effectively nothing updates until they re-run with `--force` or the manifest
is seeded. Say so plainly in the release note, and consider seeding the manifest
from the shipped assets of known past versions if that proves too blunt — the
hashes of every released asset are recoverable from the published tarballs.

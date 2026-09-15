# Phase 3 — Migrate the version hook instead of replacing it

**Goal:** an `update` that needs to add a step to the `version` npm script adds
it, leaving every other step the consumer put there intact.

`wireVersionHook` builds one canonical command and assigns it whole under
`force`. A consumer whose hook does anything extra — `ereqs` runs
`prettier --write CHANGELOG.md RELEASES.md` between generating and staging —
loses that step on upgrade, and finds out at the next release when a formatting
gate fails on generated files.

## Tasks

- [ ] Split the hook into its `&&` steps and compare **as a set of steps**, not
      as one string.
- [ ] If every canonical step is present, in an order that still works
      (generators before `git add`, guard last), leave the script alone and
      report `skipped`.
- [ ] If the guard step is missing, append it as the last step. It must be last:
      it exists to inspect the index immediately before npm commits, so a step
      running after it can stage the very thing it was checking for.
- [ ] If a canonical step is missing from the middle (say a consumer removed the
      releases generator deliberately), do **not** silently reinstate it — warn,
      print the full command they would need, and change nothing. A hook is a
      release-critical path and a surprise edit there is worse than a stale one.
- [ ] Keep `--force` as the "just write the canonical string" escape hatch.
- [ ] Apply the same care to the helper scripts (`changelog`, `releases`,
      `changelog:retro`, `releases:retro`): today they are skipped when
      customized unless `force`, which is already the right shape — confirm the
      new code path preserves it.

## Tests

- [ ] A hook with an extra step (`prettier --write …` between generate and
      `git add`) keeps that step and gains the missing guard, in the right
      position.
- [ ] A hook already carrying every canonical step is left byte-identical and
      reported as skipped.
- [ ] A hook missing a generator step is warned about, not rewritten.
- [ ] A project with no `version` script gets the canonical one, as today.
- [ ] `--force` still replaces whatever is there.
- [ ] **Stays-silent:** a project with release generation disabled in its config
      gets no hook and no warning.
- [ ] Run `pnpm test`.

## Release note

```
Release-Note: Upgrading now adds any missing step to your `version` script
rather than replacing the whole thing, so a release hook you have customised
keeps working across upgrades.
```

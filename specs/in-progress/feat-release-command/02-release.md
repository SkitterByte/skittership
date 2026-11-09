---
github_issue_id: "#7"
---

# Phase 2 — `release.cjs`: plan, `--yes`, `--push`, hooks ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** one shipped command plans, cuts and (only when asked) pushes a release
for a configured package or the root package.

## Tasks

- [ ] Pure `buildPlan` (steps with `argv` + display `cmd`) and `formatPlan`;
      bare run prints the plan and exits 0 having touched nothing (test asserts
      a clean tree and no new tags/commits).
- [ ] Packages mode `--yes`: refuse dirty tree / existing tag / downgrade;
      string-replace bump; `generate-releases.cjs --package`; `release.test`
      (default `<pm> test`); `preTag` hooks with the `RELEASE_*` env;
      `git add -- <paths>` and `git commit -m "chore(release): <tag>" -- <paths>`;
      `git tag -a <tag> -m "<pkg> <version>"`.
- [ ] Failure before the commit: nothing staged or tagged; print the
      `git checkout -- <files>` that restores the bump and notes.
- [ ] Root mode `--yes`: delegate to `<pm> version <v>` (reuse
      `detectPackageManager`); refuse a `postversion` script without
      `--allow-postversion`; verify the tag points at HEAD afterwards.
- [ ] `--push`: branch, then each tag in its own `git push origin <tag>`.
      Without it, print those commands one per line plus `approve` when
      `release.staged`. Never `--tags` / `--follow-tags`.
- [ ] `--skip-tests` / `--skip-hooks` appear as notes in the plan; `--json`
      emits `{package, version, tag, baseTag, commit, pushed}` on stdout only.
- [ ] `src/init.js`: install `release.cjs` and the `release` helper only when a
      `release` key exists; stays-silent test without it.
- [ ] Tests on fixture repos: plan-only, `--yes` happy path, red tests,
      failing hook, existing tag, root-mode postversion refusal, a package with
      no prior tag (first release, no refusal), push sequencing against a bare
      remote (one push per tag). Mirror into `scripts/`; `pnpm test` green.

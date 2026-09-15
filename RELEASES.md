# Release Notes

What's new for users of skittership. For the full technical log see
[CHANGELOG.md](./CHANGELOG.md).

Generated from `Release-Note:` commit footers.

## 2.0.4 — 15 Sep 2026

### Installer
- **New** — Upgrading now explains itself. When skittership keeps every managed file because it has no record of what it last wrote — which is what happens the first time you upgrade to a version that keeps one — it now says so and tells you how to take the new files safely, instead of leaving a run that looks like it did nothing. The guidance is also in the notes installed into your project.

## 2.0.3 — 15 Sep 2026

### General
- **Fixed** — Generating a changelog or release notes between releases now covers the right commits. Standing on a release tag previously rewrote that section with your entire history, and standing on an older tag produced nothing at all. Running skittership update also now respects --no-version-hook instead of wiring the hook regardless.

### Installer
- **New** — Upgrading now adds any missing step to your version script rather than replacing the whole thing, so a release hook you have customised keeps working across upgrades. If a step is missing from the middle, or the safety check is out of position, skittership tells you and leaves the script alone rather than rewriting it.
- **New** — Upgrading skittership no longer overwrites managed files you have edited. Running skittership update now tells the difference between its own older copy and your changes, keeps yours, and lists what it left alone — re-run with --force to take the new version anyway. On your first upgrade nothing is recorded yet, so run it once with --force to take the new files and start the record.
- **New** — You can now tell which version of skittership installed your files. Every install and update records the installing version and a fingerprint of each file it wrote, and the run reports the version it upgraded you from. Commit the new .skittership-manifest.json — a later update uses it to tell your edits from an old copy of ours.

### Release tooling
- **New** — Changelog and release-notes generation now prints the commit range it used, so a run that covers the wrong span is obvious at a glance instead of only showing up in the diff.
- **Fixed** — Regenerating a changelog or release notes no longer damages an already-released section. It previously re-dated a shipped release to today and could fold in work done after that release; both are fixed, and the commit-message rule now accepts a Refs: trailer from your ticketing provider rather than forbidding it.

## 2.0.2 — 15 Sep 2026

### Release tooling
- **Fixed** — Releasing from a pnpm, yarn or bun project now works. The release guard treated your lockfile as an unexpected staged file and stopped the release every time; it now recognises the lockfiles of every package manager, while still catching files another session left staged.

## 2.0.1 — 14 Sep 2026

### Release tooling
- **Fixed** — Backfilling past releases now keeps them in version order and clears out entries left behind by an earlier run, so a regenerated changelog or release-notes file no longer lists releases out of order or files a note under a version it did not ship in.

## 2.0.0 — 14 Sep 2026

### Commit skill
- **Fixed** — The /commit skill now names every file it stages and commits with that exact pathspec, so a commit can no longer sweep in a directory's unrelated files or pick up work another session left staged in the same checkout.

### Release tooling
- **Fixed** — Backfilling past releases now works — `npm run changelog:retro` and `npm run releases:retro` run as installed instead of failing with a usage error. Releases are also safer: if anything unexpected gets staged while the release files are generated, the release stops before committing or tagging rather than sweeping those files in.

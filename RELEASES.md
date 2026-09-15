# Release Notes

What's new for users of skittership. For the full technical log see
[CHANGELOG.md](./CHANGELOG.md).

Generated from `Release-Note:` commit footers.

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

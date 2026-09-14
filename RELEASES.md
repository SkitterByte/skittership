# Release Notes

What's new for users of skittership. For the full technical log see
[CHANGELOG.md](./CHANGELOG.md).

Generated from `Release-Note:` commit footers.

## 2.0.0 — 14 Sep 2026

### Commit skill
- **Fixed** — The /commit skill now names every file it stages and commits with that exact pathspec, so a commit can no longer sweep in a directory's unrelated files or pick up work another session left staged in the same checkout.

### Release tooling
- **Fixed** — Backfilling past releases now works — `npm run changelog:retro` and `npm run releases:retro` run as installed instead of failing with a usage error. Releases are also safer: if anything unexpected gets staged while the release files are generated, the release stops before committing or tagging rather than sweeping those files in.

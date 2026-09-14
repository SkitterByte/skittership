# Release Notes

What's new for users of skittership. For the full technical log see
[CHANGELOG.md](./CHANGELOG.md).

Generated from `Release-Note:` commit footers.

## 1.1.0 — 14 Sep 2026

### Commit skill
- **Fixed** — The /commit skill now names every file it stages and commits with that exact pathspec, so a commit can no longer sweep in a directory's unrelated files or pick up work another session left staged in the same checkout.

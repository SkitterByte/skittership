## Release tooling

This project uses **skittership** for commits, changelog, and user-facing release
notes. See `.claude/rules/commit-messages.md` for the full commit grammar.

- **Commit with `/commit`** — stages each file by name (`git add -- <path>`,
  never a directory), runs typecheck + the relevant tests, then writes a
  Conventional Commit (`type(scope): subject`) and commits it with that same
  pathspec. Concurrent sessions share one `.git/index`, so the pathspec is what
  bounds the commit.
- **`Release-Note:` footer** — add it to any user-visible commit (a plain-English,
  benefit-framed sentence). `Release-Note!:` promotes the note into the release
  Highlights; `Release-Area:` overrides the scope→area mapping; `Release-Note:
  none` marks a commit explicitly not user-facing.
- **Generation** — the dev-facing changelog (`CHANGELOG.md`) and the user-facing
  release notes (`RELEASES.md`) are regenerated from commits at `npm version`
  (when the hook is wired), or on demand via `npm run changelog` / `npm run
  releases`. Filenames, product name, and the scope→area map live in
  `skittership.config.json`.
- **Upgrading** — `skittership update` re-syncs the managed files but keeps any
  you have edited, listing them as `customized — kept`; `--force` overwrites
  them. It tells the two apart using `.skittership-manifest.json`, a record of
  what it last wrote — **commit that file**, and do not add it to `.gitignore`.
  The tailoring this section invites is therefore safe to keep across upgrades.
  On the **first** upgrade to a version that records one there is no manifest
  yet, so everything is kept and little changes: save copies of any files you
  have edited, run `update --force` once to take the new files and seed the
  record, then re-apply your edits on top of the new files — never by restoring
  the old ones, which would discard the update.

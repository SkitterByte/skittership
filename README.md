# skittership

Changelog + user-facing release-notes tooling for [Claude Code](https://claude.com/claude-code).

skittership installs a `/commit` skill, a commit-message rule, and two
zero-dependency release-artifact generators into any project. It's the release
half of [skitterspec](https://github.com/skitterbyte/skitterspec), split out so
you can adopt release tooling without the spec workflow (and vice versa).

## What it installs

| Into | What |
|------|------|
| `.claude/skills/commit/SKILL.md` | The `/commit` skill — stages task-related files, runs typecheck + tests, writes a Conventional Commit |
| `.claude/rules/commit-messages.md` | Commit grammar: `type(scope): subject`, and the `Release-Note:` footer rules |
| `scripts/generate-changelog.cjs` | Regenerates the dev-facing `CHANGELOG.md` from commit subjects |
| `scripts/generate-releases.cjs` | Regenerates the user-facing `RELEASES.md` from `Release-Note:` footers |
| `scripts/lib/` | Shared, zero-dependency git/config helpers |
| `skittership.config.json` | Filenames, product name, scope→area map, feature toggles |
| `package.json` `version` hook | Regenerates both artifacts at `npm version` (opt-in) |

## Install

```sh
npx @skitterbyte/skittership init          # interactive setup
npx @skitterbyte/skittership init --yes     # accept defaults, non-interactive
npx @skitterbyte/skittership update --force # re-sync skill/rule/scripts
```

Non-interactive flags (drive setup in CI): `--changelog/--no-changelog`,
`--releases/--no-releases`, `--changelog-file=NAME`, `--releases-file=NAME`,
`--product-name=NAME`, `--version-hook/--no-version-hook`. See
`skittership --help`.

## Migrating from skitterspec

Older skitterspec installs bundled this tooling and wrote a
`skitterspec.config.json`. On `skittership init`, that file is **renamed** to
`skittership.config.json` (all your settings carry over) — run
`skitterspec update` afterwards to let skitterspec clean up the files it used to
install.

## The commit → release flow

Commit with `/commit`. For a user-visible change, add a `Release-Note:` footer:

```
feat(tasks): explicit state/created dates + sort-by

- Add stateEnteredAt column, sortBy param

Release-Note: You can now sort your task inbox by when an item entered its
current state or when it was created.
```

`Release-Note!:` promotes the note into the release Highlights; `Release-Area:`
overrides the scope→area mapping; `Release-Note: none` marks a commit explicitly
not user-facing. The terse subject feeds `CHANGELOG.md`; the footer feeds
`RELEASES.md`. Both are regenerated at `npm version`, or on demand:

```sh
npm run changelog        # regenerate CHANGELOG.md for the current version
npm run releases         # regenerate RELEASES.md for the current version
npm run changelog:retro  # backfill from prior tags
```

## Configuration

`skittership.config.json` (repo root):

```json
{
  "version": 1,
  "changelog": { "enabled": true, "file": "CHANGELOG.md" },
  "releases": {
    "enabled": true,
    "file": "RELEASES.md",
    "productName": "My Product",
    "scopeAreas": { "api": "API", "cli": "Install" }
  },
  "versionHook": true
}
```

## License

MIT

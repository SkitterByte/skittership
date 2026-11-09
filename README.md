# skittership

Changelog + user-facing release-notes tooling for [Claude Code](https://claude.com/claude-code).

skittership installs a `/commit` skill, a commit-message rule, and two
zero-dependency release-artifact generators into any project. It's the release
half of [skitterspec](https://github.com/skitterbyte/skitterspec), split out so
you can adopt release tooling without the spec workflow (and vice versa).

## What it installs

| Into | What |
|------|------|
| `.claude/skills/commit/SKILL.md` | The `/commit` skill — stages each file by name, runs typecheck + tests, writes a Conventional Commit and commits it with that same pathspec |
| `.claude/rules/commit-messages.md` | Commit grammar: `type(scope): subject`, and the `Release-Note:` footer rules |
| `scripts/generate-changelog.cjs` | Regenerates the dev-facing `CHANGELOG.md` from commit subjects |
| `scripts/generate-releases.cjs` | Regenerates the user-facing `RELEASES.md` from `Release-Note:` footers |
| `scripts/check-release-index.cjs` | Aborts `npm version` if anything unexpected is staged (npm's own commit takes no pathspec) |
| `scripts/release-hotfix.cjs` | Cuts a `v<base>-hotfix.<N>` release on a hotfix branch, wired as `npm run release:hotfix` (see [Hotfix releases](#hotfix-releases)) |
| `scripts/lib/` | Shared, zero-dependency git/config helpers |
| `skittership.config.json` | Filenames, product name, scope→area map, feature toggles |
| `package.json` `version` hook | Regenerates both artifacts at `npm version` (opt-in) |
| `.skittership-manifest.json` | Records the installing version and a hash per managed file — **commit it** (see below) |

### Commit `.skittership-manifest.json`

It is not a lockfile or a cache, and it does not belong in `.gitignore`. It
records the version that installed your managed files and a hash of each one, so
a later `update` can tell a file you edited from an old copy of ours and keep
your edits instead of overwriting them.

That only works if the record travels with the repo. Ignore it and every
collaborator's `update` is back to guessing — including yours on another
machine.

## Install

```sh
npx @skitterbyte/skittership init          # interactive setup
npx @skitterbyte/skittership init --yes     # accept defaults, non-interactive
npx @skitterbyte/skittership update         # re-sync skill/rule/scripts, keeping your edits
```

Non-interactive flags (drive setup in CI): `--changelog/--no-changelog`,
`--releases/--no-releases`, `--changelog-file=NAME`, `--releases-file=NAME`,
`--product-name=NAME`, `--version-hook/--no-version-hook`. See
`skittership --help`.

## Upgrading: what `update` keeps

`update` re-copies the managed files, but it will not overwrite work you have
done. Each file is compared against the manifest — the record of what the last
install wrote — and routed by the answer:

| Your file | What `update` does |
|---|---|
| matches what we last wrote | takes the new version (`updated`) |
| differs from what we last wrote | **keeps yours**, lists it as `customized` |
| has no manifest entry | **keeps yours**, lists it as `not recorded` |
| is missing | writes it (`created`) |

So a run that leaves things alone looks like this, and exits 0 — keeping a file
is an expected outcome, not a failure:

```
customized — kept (re-run with --force to overwrite):
  scripts/generate-releases.cjs
  .claude/skills/commit/SKILL.md
```

To take the new version of a file it kept, either diff it against the shipped
asset and re-apply your change on top, or run `update --force` and re-apply
afterwards. `--force` overwrites everything, which is exactly what it is for.

**`not recorded` is not an accusation.** It means nobody was recording — a
project installed before the manifest existed, or a file added to skittership
after your last install. It is kept for the same reason a customized file is:
being wrong about it costs you a stale file, while the other mistake costs you
work you cannot get back.

**On your first upgrade to a version that has this**, there is no manifest yet,
so everything lands in `not recorded — kept` and little actually changes. Run
`update --force` once to take the new files and seed the manifest; from then on
`update` can tell your edits from ours.

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
`RELEASES.md`. A release with no footers at all — a CI or dependency bump —
still gets a `RELEASES.md` section reading "No user-facing changes in this
release.", so the newest entry always matches the version you shipped. Both
files are regenerated at `npm version`, or on demand:

```sh
npm run changelog        # regenerate CHANGELOG.md for the current version
npm run releases         # regenerate RELEASES.md for the current version
npm run changelog:retro  # backfill every prior tag
npm run releases:retro   # same, for RELEASES.md
node scripts/generate-changelog.cjs --retro 3   # or just the newest 3
```

**Which commits a section covers.** A release's section lists the commits
since the **nearest earlier release tag in its own history** (`git describe`),
not the newest tag in the repo. After a hotfix, main's next section therefore
lists the cherry-picked fix again: environments that deploy main get it only
in that release. To choose the base yourself, set `RELEASE_BASE_TAG=<tag>`.
If tags exist but none is in HEAD's history, even after a shallow clone is
deepened, the generators refuse and write nothing rather than guess. Set
`RELEASE_BASE_TAG` to go on.

**Naming the range yourself.** `--range <from>..<to>` on either generator
skips all of that and walks exactly the commits in `<to>` that `<from>` does
not carry. It wins over `RELEASE_BASE_TAG`, refuses (writing nothing) when
either end is not a commit, and does not combine with `--retro`:

```sh
node scripts/generate-releases.cjs --range v1.4.0..HEAD 1.5.0
```

## Monorepos: one notes file per package

A repo that tags each package separately (`api@2.1.0`, `web@7.0.3`) cannot use
"the nearest earlier tag": the nearest one usually belongs to another package.
List the packages in `skittership.config.json` and generate per package:

```json
"packages": {
  "api": { "paths": ["packages/shared/**", "packages/api/**"], "dir": "packages/api" },
  "web": { "paths": ["packages/shared/**", "packages/web/**"], "tagPrefix": "web-v" }
}
```

```sh
node scripts/generate-releases.cjs --package api          # version from packages/api/package.json
node scripts/generate-releases.cjs --package web 7.1.0
node scripts/generate-releases.cjs --package api --retro  # backfill api's own tags only
```

| Field | Default | Does |
|-------|---------|------|
| `tagPrefix` | `<name>@` | The package's tags are `<tagPrefix><version>`. Must end in `@ - _ / .`, so one package's tags can never match another's |
| `paths` | every commit | Globs (`**`, `*`, `?`) over changed files. A commit belongs to **every** package one of its files matches, so a shared library's change appears in each package that lists it. A path with no wildcard covers everything beneath it |
| `releasesFile` | `RELEASES-<name>.md` | Where that package's notes go |
| `productName` | `<name>` | The name in that file's header |
| `dir` | — | Where the package's `package.json` is, so the version can be left off |

Each package's base is its own nearest earlier tag. A package with **no** tags
yet is a first release and takes all history. One whose tags exist but none is
in HEAD's history refuses, as above.

**Every `--package` run lists the notes no package claims** — a commit with a
`Release-Note:` footer whose files match no package's `paths` (a docs page, a
build script). They are left out, and named, because a note dropped in
silence looks exactly like a note lost. Usually the fix is to remove the
footer: a change that ships in no package is not user-facing.

Without `--package`, a `packages` map changes nothing: `RELEASES.md`,
`CHANGELOG.md` and the version hook behave as before. `CHANGELOG.md` stays
one file; `--package` is for release notes only.

**Migrating from a hand-written release-notes script.** If yours chose the
commits and called `generate-releases.cjs`'s render functions, the
`packages` map is that script as config: its tag series become `tagPrefix`,
its path→package table becomes `paths`, and its orphan report is built in.
Compare one release's output from both before deleting yours. One difference
to expect: a package with nothing to say still gets its heading and the
`emptyRelease` placeholder; set `releases.emptyRelease: false` for the old
skip.

## Hotfix releases

A hotfix must be exactly the prod tag plus the fix. Taking the next patch
number breaks as soon as another environment uses patch numbers, because
`v1.2.4` may already be on test. So a hotfix is the base release with a
suffix:

```
v1.2.3 < v1.2.3-hotfix.1 < v1.2.3-hotfix.2 < v1.2.4 < v1.3.0
```

`-hotfix.N` sorts **after** its base. That is the opposite of semver
pre-release order, and deliberate, because a hotfix is cut after the release
it patches. Every other suffix (`-rc.1`) sorts before its base, as semver
says.

Branch from the prod tag, commit the fix, then cut it:

```sh
git switch -c hotfix/hop-count v1.2.3
# ...commit the fix...
npm run release:hotfix              # cuts v1.2.3-hotfix.1, pushes nothing
```

It works out the base from HEAD's history and picks one above the highest
existing `-hotfix.N` for that base, counting tags from any branch. Then it
runs your own `npm version <v>` (or `pnpm version` in a pnpm project), so your
`preversion`/`version` hooks regenerate CHANGELOG and RELEASES as usual. The
new section lists only the fix.

| Flag | Does |
|------|------|
| *(none)* | Cut the version, then print the next commands: push the branch, push the tag (which starts the deploy), and carry the fix to main without the version commit |
| `--push` | Also push the branch, then the tag, to `origin` |
| `--dry-run` | Print the version and base it would use; change nothing |
| `--json` | Print `{tag, version, baseTag, versionCommit, branch, pushed}` on stdout and everything else on stderr. For tools: skitterspec's `/spec-hotfix` uses `versionCommit` to leave the version commit out of the carry to main |
| `--allow-postversion` | Run even though `package.json` has a `postversion` script |

It refuses, with one line and a non-zero exit, when:
- HEAD is not on a `hotfix/*` branch (configurable, see below)
- the tree is dirty
- no release tag is an ancestor
- HEAD is already released
- `package.json` has a **`postversion`** script. That hook runs inside
  `npm version`, and if it pushes, "pushes nothing" stops being true. If
  yours is safe, pass `--allow-postversion`.

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
    "scopeAreas": { "api": "API", "cli": "Install" },
    "emptyRelease": true
  },
  "versionHook": true,
  "hotfix": { "branchPrefix": "hotfix/" },
  "packages": { "api": { "paths": ["packages/api/**"] } }
}
```

`releases.emptyRelease` is what a release with no user-facing notes says:
`true` (the default) for "No user-facing changes in this release.", a string
for your own wording, or `false` to write no section for it at all.

`hotfix.branchPrefix` sets the branches `release:hotfix` will run on. It
defaults to `hotfix/`, and `init` writes it only when you change it.

`packages` is optional, and read only by `--package` (see
[Monorepos](#monorepos-one-notes-file-per-package)). `init` and `update` keep
it exactly as you wrote it; a malformed entry stops the generators with the
package and field named.

## License

MIT

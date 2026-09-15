# skittership

<!-- skittership:start -->
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
<!-- skittership:end -->

<!-- skitterspec:start -->
## Spec workflow

Spec-driven development runs through the lifecycle **skills** — use them so
structure and lifecycle stay consistent. The everyday loop is
**`spec → start → next → commit → complete`**, with `/spec-connect` when you want to test
the spec in a browser.

**Skills vs commands.** The lifecycle skills are read by Claude, which exercises
judgment. `/spec-connect` and `/spec-live` are **slash commands** instead — each
pre-executes one `spec-env` verb and relays it, so only you can run them; a
skill that wants one will tell you to type it.

The skill table, the spec type/folder conventions and the per-spec isolation
model all live in **`.claude/rules/spec-planning.md`**, the canonical reference
every spec skill points at. Tailor its per-phase test commands to this stack.

**Release gating** *(only when `specs/.core/gating.config.json` exists)* — each
spec records whether it ships behind a feature flag, as
`> **Gating:** <flag name>` or `> **Gating:** none: <one-line reason>`. `/spec`,
`/spec-bug` and `/spec-hotfix` ask; `/spec-review`, `/spec-start` and
`/spec-complete` report a spec that has no answer, and never block over it.
`skitterspec gating check` lists them and always exits 0. The point is that the
question is **on the record**: a missing line is an oversight, a reason is a
decision. Skitterspec never reads your flag system — it asks and cites the doc
you point it at. Without that config, none of this appears.
<!-- skitterspec:end -->

## Releasing this package

This repo uses **pnpm** (`pnpm-lock.yaml`, pinned via `packageManager`). Install
with `pnpm install`; the release itself is cut locally and staged by CI:

```
pnpm version <patch|minor|major>
```

That runs, in order: the `version` hook (regenerates `CHANGELOG.md` +
`RELEASES.md` from `Release-Note:` footers, stages them, and aborts via
`scripts/check-release-index.cjs` if anything unexpected is staged), npm's own
version commit + `vX.Y.Z` tag, then `postversion` pushes both with
`git push --follow-tags`. (`pnpm version` runs the same lifecycle hooks as
`npm version` and commits what they stage — verified, not assumed.)

Pushing the tag triggers `.github/workflows/publish.yml`, which verifies the tag
matches `package.json`, runs the tests, and **stages** the release.

**A staged release is not live.** This package uses npm staged publishing: the
trusted publisher is stage-only, so CI can put a build in the staging area
without a 2FA prompt, but it stays there until a human approves it. A release
nobody approves simply never ships, silently — so the second step is not
optional:

```
pnpm approve                    # approve the version in package.json
pnpm approve 2.0.1              # approve a specific version
pnpm approve <stage-id>         # approve a specific staged build
pnpm approve -- --reject        # discard it instead
pnpm staged                     # just list what is waiting
```

You need to be logged in first (`npm login`), and on npm >= 11.15.0 — older
npm has no `stage` command at all.

`npm stage approve|reject|view|download` all take a **stage-id** (a UUID), not a
package spec; only `npm stage list` accepts a spec. `pnpm approve` exists to
bridge that: it looks the version up in the listing, resolves it to its
stage-id, and approves that. Pass a bare UUID and it is used directly. If the
version is not staged, it prints what is, rather than failing obscurely.

The prompt is interactive by design — it is the 2FA gate, so it cannot be
automated, and that is the point. Approval also works from the package page on
npmjs.com.

**Why the registry commands are npm, not pnpm.** Dependencies, scripts and CI
all use pnpm, but anything talking to the registry (`npm stage publish` in CI,
`npm stage …` under `pnpm approve`) stays on npm. That path is proven end to
end, npm ships with Node so it costs nothing, and pnpm's own `stage publish`
has not been verified against our trusted publisher. Worth revisiting once a
release has gone out this way.

Confirm it landed with `npm view @skitterbyte/skittership dist-tags`.

**Do not run `npm publish` by hand.** The npm account requires two-factor auth
on writes, so a local publish prompts for an OTP; CI instead authenticates by
OIDC (npm Trusted Publishing), which needs no token and no OTP. Publishing
locally would also skip the tag/version check and lose build provenance. Plain
`npm publish` from CI is rejected outright — the trusted publisher only permits
`npm stage publish`.

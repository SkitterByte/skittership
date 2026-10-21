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
**`spec → start → next → commit → complete`**, with **`/spec-diff`** to read what
a phase changed and `/spec-connect` when you want to test the spec in a browser.

**Skills vs commands.** The lifecycle skills are read by Claude, which exercises
judgment. `/spec-connect` and `/spec-live` are **slash commands** instead — each
pre-executes one `spec-env` verb and relays it, so only you can run them; a
skill that wants one will tell you to type it.

**Seeing the work.** A phase is built in its own worktree, so `git diff` in your
terminal answers about the base branch. **`/spec-diff`** renders that worktree's
diff as a self-contained HTML page you open locally — or publish, and read on a
phone. The diff never passes through the model, so the page costs no context
tokens however large it is; the optional written review is the part that costs,
and it is offered rather than assumed. `/spec-next` writes the page at the end of
every phase.

**Handing the review back.** The page takes marks: tick `✓ accept` per file as
you read, note anything against a line or a whole file, answer the questions a
written review asked — then **end it in a decision**. At the end of a phase the
buttons are `✓ Commit`, `✓ Commit & Continue` (commit, then build the next
phase), `↺ Request changes` and `… Discuss first`. A spec that has just been
written gets `✓ Commit & Start` instead — the `commit-start` verdict, which is
the `commit && /spec-start` you would otherwise type. A **served** page hands
the pass to the engine, which **holds** it and shows a six-digit code. Committing
is unavailable while a note is open — you asked for something, so it cannot also
be fine — and it hands off to your own commit skill (`review.commitWith`,
`/commit` by default) rather than a copy living here. Fixes come back as
resolutions, so the next render shows each note struck through with what changed.
An accept remembers the file's content, so it lapses by itself when that file
changes again. The marks are information — nothing gates on them; the verdict is
the one thing you choose, once.

**A second opinion, when you want one** (`review.reviewers`, empty by default).
Point it at a code reviewer that runs from your terminal — CodeRabbit's CLI has
a free tier and `{ "use": "coderabbit" }` is the whole setup; anything printing
[rdjsonl](https://github.com/reviewdog/reviewdog) works too — and its findings
land on the page beside your own notes, each badged with the tool that found it
and linked to the line it is about. `/spec-next` runs them once per phase;
`/spec-diff --reviewers` is the mid-phase ask. **They never block a commit** —
reply to one and your reply does, because then a person has asked for something.
A reviewer that could not run says `did not run — <why>` rather than passing as
clean, because on the page you commit from those two must not look alike.
Adding one sends your diff to whatever the command talks to, which is why the
list starts empty and `init` never writes one.

**Above the verdicts sits one line that is not a verdict.** `▶ Put it live`
commits the phase, checks the branch out where your dev server can see it, and
hands you back the same page with the same options — so you can judge the change
by *using* it, not only by reading it. It clears no gate: you have looked at it
running and concluded nothing, so the phase still owes an answer.

**Every render lists where the page can be read**, labelled, in a fixed order —
`local`, `network`, `remote` — each either a URL or the one command that turns it
on, plus a `live:` line saying whether the change is also running. `local` and
`network` are two doors into one room: the same server and the same waiting
verdict, so one wait covers both. `remote` is a published page, a second store —
a verdict there needs `/spec-reviewed`, and it stays off until someone types
**`/spec-remote-review`**, which toggles it. Publishing is permitted by that
command, never performed by it: a published page is one this tooling cannot
remove.

**One ending.** Every spec skill finishes with the same block — a verdict
(`✅` · `⚠️` · `❌` · `⏸`), then a table of the fields that skill declares,
ending on the one thing to do next. A refusal emits it too, so "nothing
happened" is reported rather than absent, and `Follow-ups` is always there
because a recorded `none` is a decision. Skills stay quiet while they run. The
shape lives in **`.claude/rules/spec-reports.md`**.

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

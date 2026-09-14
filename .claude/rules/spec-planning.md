# Spec Planning

Spec-driven development is driven by nine lifecycle skills (plus the
`/spec-connect` and `/spec-live` **commands** when isolation is on) — use them rather than hand-rolling specs so the structure
and lifecycle stay consistent. Each sets a status on the spec header
(`> **Status:** …`):

| Skill | Purpose | Status | Folder |
|-------|---------|--------|--------|
| `/spec` | (Feature) Grill to a clear shared understanding, then write a groomed spec | `Ready` (or `Draft`) | `specs/backlog/` |
| `/spec-bug` | (Bug) Reproduce with a failing test, capture spec, drive red→green | `In Progress` | `specs/in-progress/` |
| `/spec-hotfix` | (Hotfix) Fork a worktree from a release tag, red→green, land by tag + cherry-pick | `In Progress` | `specs/in-progress/` |
| `/spec-review` | Re-validate a spec against the codebase; refresh stale parts | `—` | (unchanged) |
| `/spec-start` | Put a spec in flight — provision its branch, then build phase 1 | `In Progress` | `specs/in-progress/` |
| `/spec-next` | Build the next phase of the spec this session is in (re-run per phase) | `In Progress` (unchanged) | (unchanged) |
| `/spec-to-main` | Land the branch on the base (rebase + ff) **without** finishing — for running the work in CI / a shared env mid-spec; repeatable | `In Progress` (unchanged) | (unchanged) |
| `/spec-complete` | Verify all phases done + tests green; land + tear down | `Complete` | `specs/complete/` |
| `/spec-cancel` | Record progress, stamp a reason on the header; tear down | `Cancelled` | `specs/cancelled/` |
| `/spec-init` | Bootstrap/repair this workflow in a project (idempotent) | — | — |

**Skills vs commands.** The table above lists **skills** — Claude reads them and
exercises judgment. `/spec-connect` and `/spec-live` are instead **slash commands**
(`.claude/commands/`): each pre-executes one `skitterspec spec-env` verb and
relays its output, so there is no judgment to apply and no model turn spent
finding one. They are marked `disable-model-invocation`, meaning
**only you can run them** — a skill that wants one will tell you to type it
rather than invoking it.

`/spec-to-main`, `/spec-status` and `/spec-sync` stay **skills** — each carries
real judgment (green tests before a land; an MCP fetch and a team-key check; ten
subcommands) — but they are marked user-only too, since nobody reaches them
except by typing them. Everything else in the table above stays model-invocable,
which is what lets `/spec-next` hand off to `/spec-push` as work progresses.

Status flow: `Ready → In Progress → Complete` (or `Cancelled` from any state).
`/spec` grills to a **Ready** spec directly — there is no separate grooming
command; it writes `Draft` only when open questions are deliberately left.
`/spec-bug` and `/spec-hotfix` are test-first and start straight in `In Progress`
(work begins immediately), so they skip Draft/Ready. `/spec-to-main` does **not**
move the spec through the flow at all — it lands the branch on the base branch
mid-spec (so the work can run in CI / a shared test env) while the spec stays
`In Progress` in `specs/in-progress/`; it's the intermediate, repeatable half of
`/spec-complete`'s landing, without the finalise-and-tear-down.

**Two workspace modes.** `specs/.core/env.config.json` → `mode` decides where a
spec's branch is built. **`worktree`** (the default) gives each spec its own
checkout — several specs at once and `main` left free — and `/spec-start` moves
the session you typed into *into* that checkout, so the work carries on in the
same terminal. **`checkout`** builds the branch in the primary checkout instead:
one spec at a time, and nothing to move into. Neither mode costs you a second
terminal; the difference is how many specs can be in flight at once.
Pick it for how you work rather than for what the project contains — a repo with
no dev servers may still want several specs in flight. In `checkout` mode
`/spec-connect` and `/spec-live` do not apply and say so: both exist to reach
work that lives elsewhere, which is the gap that mode removes.

**Per-spec isolation (opt-in to adopt, then the default policy).** When a project
adopts isolation (`skitterspec init --isolation`, or `specs/.core/env.config.json`
present), `/spec-start` gives **every** in-progress spec its own git worktree
automatically — several specs run side by side without stashing or clashing, and
`main` stays free. Docker is a **per-spec escalation**: `/spec` records
`> **Stack:** worktree` (default) or `worktree + docker` when the spec touches the
DB / stateful services, and `/spec-start` brings up a namespaced stack only for the
latter. `/spec-start` also starts the project's host **dev servers** (`env.config`
→ `dev`) on the spec's ports; **`/spec-connect <name>`** then exposes that spec on
your canonical `localhost` ports so you can test it at the normal URL
(`/spec-connect main` hands them back). All housekeeping (the backlog→in-progress
move, header edits, the code) happens on the spec's branch in the worktree; `main`
changes only when it merges. Teardown is folded into `/spec-complete` ·
`/spec-cancel`. Beneath the skills, `skitterspec spec-env
<up|down|prune|dev|connect|integrate|hotfix|live|status|resolve>` is the CLI
engine (omit the spec name and it uses the worktree you are standing in). Teardown drops
the finished spec's own test-DB volume; `spec-env prune` additionally reaps
**orphaned** volumes left by declined/aborted teardowns, so `/spec-complete` and
`/spec-cancel` also sweep orphans (confirm-first). A **hotfix** is the one
exception to "fork from `main`": `/spec-hotfix` forks the worktree from a release
tag and `/spec-complete` lands it via `spec-env hotfix land` (tag + cherry-pick),
not a fast-forward. Isolation is **orthogonal to lifecycle status** and inactive
when `env.config.json` is absent — every skill then behaves as it does today.

**Live overlay (`/spec-live`, a command) — the light way to test a spec.** `/spec-connect`
runs a spec's *own* dev stack and proxies the canonical ports to it (one stack per
spec). **Live overlay** instead reuses the one dev server you already have running:
`/spec-live <spec>` rebases the branch onto base, frees it from its worktree, and
checks it out **in the primary checkout**, so your running server hot-reloads the
feature at the normal URL — no second stack, no proxy. The branch checked out in
the primary checkout **is** the lock: exactly one spec is live at a time, and
`/spec-live main` hands the instance back (fixes you make while live commit
straight onto the branch; `/spec-complete` is live-aware and lands them). Rule of
thumb: **live overlay is the light default for *testing* a code-only spec** — it
is not how work gets started, and no lifecycle skill invokes it; it *refuses*
stateful ones (`Stack: worktree + docker`, or a branch touching migrations) — keep
`/spec-connect` + a Docker stack for those, and for genuinely parallel testing.
Beneath it, `skitterspec spec-env live <take|release|abort|status>` is the engine.

**Ticketing-provider sync (opt-in, a separate package).** The base is
tracker-free: it knows nothing about any specific ticketing system. A
ticketing provider is installed as its own distribution that plugs into named
**seams** in the shared skills and fulfils a skill-name + CLI contract.

Part of that contract is the **binary name**: the shipped `/spec-connect` and
`/spec-live` commands invoke `skitterspec`, so a superset that replaces the base
must expose that name too, alongside whatever it calls itself — one entry point
under two names. A distribution shipping only its own name leaves those commands
failing with `command not found`, which reads as a broken install rather than a
missing alias.
Sync is **one-way**: the repo is the source of truth and the tracker is a
**generated mirror**. It ships `/spec-push` (repo→tracker; computes a create/update plan
against a committed last-pushed snapshot and applies it) and `/spec-status`
(read-only drift report — what would push, and whether the tracker's
workflow-state drifted), backed by a `spec-sync` CLI. There is no content pull —
the tracker is never read back or merged.

**Every skill that moves a spec through the lifecycle carries a seam**, so the
mirror keeps up without anyone remembering to push: `/spec`, `/spec-bug` and
`/spec-hotfix` link the spec they create; `/spec-next` refreshes it as work starts;
`/spec-complete`, `/spec-cancel` and `/spec-review` refresh it after they change
it. `/spec-to-main` and `/spec-live` carry none — they change no status.
With no provider installed the seams are empty and every skill behaves as a plain
filesystem workflow. See the provider package's own docs for its config and field
reference.

**Release gating (opt-in, config-gated).** With
`specs/.core/gating.config.json` present, every spec `/spec`, `/spec-bug` and
`/spec-hotfix` write carries a `> **Gating:**` header recording one decision:
does this ship behind a feature flag, or land live? The value is a **flag name**,
or **`none: <one-line reason>`** — and the reason half is the load-bearing part,
because `none: additive, nothing to revert` is a decision a reviewer can argue
with while a bare `none` is a shrug and a missing line is an oversight.

Skitterspec bakes in **the offer, never the mechanism**: it asks, cites the
project's own doc (`guidance` in that config), and records the answer. It never
reads your flag code. `skitterspec gating check` reports specs with no decision
and **always exits 0** — it reads only `backlog/` and `in-progress/`, so specs
finished before you adopted gating are out of range by construction. With the
config absent nothing appears at all: no question, no header, no check.

## Project conventions

The spec skills tell you to run "your project's typecheck and test commands" and
to "honour project conventions". Here they are for this project:

- **Typecheck command:** none — this is plain CommonJS JavaScript with no
  TypeScript and no build step. Skip the typecheck step entirely; do not
  substitute another command for it.
- **Test command:** `npm test` (i.e. `node --test`). Single file:
  `node --test test/<name>.test.js`.
- **Lint/format:** none — no linter or formatter is configured. Match the
  surrounding style by hand.
- **Other rules specs must honour:**
  [`.claude/rules/commit-messages.md`](commit-messages.md) — the Conventional
  Commit grammar, length limits, and the `Release-Note:` footer this repo's own
  release tooling reads. Also
  [`.claude/rules/negative-checks.md`](negative-checks.md).

## Spec types — Feature, Bug, Hotfix

Every spec is one of three types, recorded **both** in the header and the filename:

- **Header field:** `> **Type:** Feature`, `> **Type:** Bug`, or
  `> **Type:** Hotfix` (authoritative, greppable:
  `grep -rl 'Type:.*Hotfix' specs/`).
- **Filename prefix:** `feat-<name>` for features, `bug-<name>` for bugs,
  `hotfix-<name>` for hotfixes (visible in listings; glob-safe — never use
  `[BUG]`/`[FEATURE]` brackets).

A **Hotfix** is a Bug fixed against a **released tag** rather than `main`: it
carries an extra `> **Base version:** <tag>` header, forks its worktree from that
tag, and lands by tagging a new patch + cherry-picking onto `main` (never a
fast-forward merge). `/spec-live` refuses a hotfix — test it with `/spec-connect`.

All three types share the same lifecycle folders below — type is orthogonal to
status.

## Header fields & State log (audit trail)

Every spec header carries:

- `> **Name:**` — the spec's folder name (`feat-`/`bug-`/`hotfix-<kebab-name>`).
  It's the handle you pass to `/spec-start` and the other lifecycle skills, surfaced
  in the header so it's copy-pasteable without digging for the folder name.
- `> **Author:**` — who created the spec (set at `/spec` / `/spec-bug`, defaults
  to `git config user.name`).
- `> **Developer:**` — who implements it (`—` until `/spec-start` starts work, then
  set to `git config user.name`; `/spec-bug` sets it immediately).
- `> **Gating:**` — the release-gating decision,
  **only when `specs/.core/gating.config.json` exists**: a flag name, or
  `none: <one-line reason>`. Absent entirely in a project that has not adopted
  gating.

Every spec also has a **State log** table — the audit trail of folder/status
transitions. Each lifecycle skill appends exactly one row when it changes state:

```
## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-01-01 | Draft | backlog | Jane Dev |
| 2026-01-02 | In Progress | in-progress | Jane Dev |
```

Keep the **State log** (state transitions) separate from the **Changelog**
(decisions and course-corrections) — state moves go in the table, not the
changelog.

When asked for a plan, implementation strategy, or feature breakdown:

1. Create or update a spec under `specs/` — never plan only in chat.
2. Reach a clear shared understanding of the requirement AND the proposed
   solution before writing (the `/spec` skill grills for this).
3. Use markdown checkboxes `- [ ]` for tasks, `- [x]` when done.
4. Organise work into phased sections with short goal descriptions.
5. Tasks must be granular enough to complete in one coding session.
6. Every phase ends with creating and running tests — a phase is not done until
   its tests are green (run the project's typecheck + test commands above).
7. Keep specs **as concise as possible**.
8. Record decisions and course-corrections in the spec's **Changelog** section.

## Lifecycle folders

```
specs/backlog/       Ready (or Draft) specs (/spec)
specs/in-progress/   under active implementation (/spec-start, /spec-bug)
specs/complete/      finished (/spec-complete)
specs/cancelled/     abandoned, with a reason on the header (/spec-cancel)
specs/.core/         project rules — ALWAYS APPLY, never moved
```

Every spec is a **folder** `specs/<bucket>/<name>/` — never a bare file, even for
simple changes. Inside it:

- `00-overview.md` is the entry point / dashboard: header, Problem, Decisions,
  Solution overview, the **Impact map** (a `Surface | Change | Detail` table
  naming the concrete surfaces the spec touches — endpoints, schemas, DB tables,
  domain objects, routes, business rules — as the scannable blast radius), the
  **phase index** (a table linking to each phase file with its status), Open
  questions, State log, Changelog. **No per-phase task lists live here.**
- **One file per phase** — `01-<phase-slug>.md`, `02-<phase-slug>.md`, … in
  execution order. Each holds that phase's goal, its task checkboxes (tests
  included), and any phase-specific notes. Even a single-phase spec gets `01-….md`
  — so each phase is easy to open and work on its own.

Keep the index and the phase files in sync (`⬜`/`🔄`/`✅`). Legacy specs may be a
bare `<name>.md`, or a `00-overview.md` with inline phases — the skills read
those, but new specs always use the folder + phase-file form.

## Finding specs

The **folder buckets are the source of truth** — a spec's bucket is its status.
To see the backlog, list `specs/backlog/`; for the latest completed specs, use
`git log`/mtime on `specs/complete/` or each spec's dated **State log**. Live
status also lives in the tracker when a ticketing provider is linked. (There are
no `00-index.md` summary files — the folder tree, headers, and State logs are
queried directly.)

## Rules

- If a spec already exists, update it — don't rewrite from scratch.
- Preserve completed `[x]` tasks.
- Add new tasks to the appropriate phase.
- Never delete historical notes.
- The spec file is the single source of truth for implementation progress.
- Move specs between buckets with `git mv` to preserve history.
- Never let inline emphasis or a link cross a hard line break — keep a whole
  `**bold**`, `*italic*`, or `[text](url)` on one line (let it overflow the wrap
  column rather than splitting it). Many round-tripping editors mangle a
  `**`/`*`/link span that straddles a newline, so clean source avoids the churn.

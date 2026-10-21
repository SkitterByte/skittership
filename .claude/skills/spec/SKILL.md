---
name: spec
description: Create a new spec-driven-development spec. Grills the user to a clear, shared understanding of the requirement AND the proposed solution FIRST, then writes one concise, phased, test-included, change-logged spec into specs/backlog/. Use when the user wants to plan a feature, write a spec, capture a requirement, or says "/spec" or "spec this out".
---

# /spec — author a new spec

> Stay silent while this runs — speak only to ask something you cannot answer
> yourself, or to report a failure at the moment it happens. Read
> `.claude/rules/spec-reports.md` before reporting; it defines the block this
> skill ends with.

Produce ONE concise spec in `specs/backlog/`. Do not start coding — this skill
plans only. Implementation happens later via `/spec-start`.

Lifecycle (the governing skills) — status in parentheses:
`/spec` (writes **Ready** when fully groomed, else Draft; backlog) → `/spec-start`
(In Progress, in-progress; implement phase 1) → `/spec-complete` (Complete) /
`/spec-cancel` (Cancelled). See `.claude/rules/spec-planning.md`. (There is no
separate grooming command — `/spec` grills to a Ready spec directly.)



## Phase A — reach a clear shared understanding (grill first)

Interview the user until requirement AND proposed solution are unambiguous. Do
not write the spec until this is resolved.

- Break the problem into **distinctive areas** and work them in logical order,
  resolving dependencies between decisions one at a time.
- **Batch independent questions; sequence dependent ones.** When several
  questions do not affect each other's answers, put them to the user together
  (up to four at once — use the harness's multi-question ask tool where it has
  one) rather than spending a round trip on each. When an answer would change
  what you ask next, ask that one alone and wait for it. Give your
  **recommended answer** either way.
- If a question can be answered by **reading the codebase, read it** instead of
  asking. Verify endpoints/models/files actually exist before relying on them.
- Cover, at minimum, the areas that apply:
  1. **Problem & why** — what's broken/missing, who feels it, why now.
  2. **Scope & non-goals** — explicit out-of-scope items.
  3. **Affected areas** — concrete files/modules/packages this touches.
  4. **Proposed solution shape** — the chosen approach and the alternatives
     rejected, with the reason (this becomes "Decisions").
  5. **Data / API impact** — schema/model changes, new endpoints, and
     **backward compatibility** (additive = safe; breaking = needs explicit
     permission and coordination).
  6. **Security & multi-tenancy** — authz, tenant scoping, untrusted input.
  7. **Edge cases & failure modes.**
  8. **Testing approach** — what proves each phase correct.
  9. **Isolation stack** *(only when `specs/.core/env.config.json` exists)* — does
     this spec touch the DB / stateful services (so its worktree needs a Docker
     stack), or is a plain worktree enough? Default `worktree`; escalate to
     `worktree + docker` only when it must. This sets the `> **Stack:**` header
     that `/spec-start` acts on (it can be escalated later). Skip when isolation
     isn't enabled — leave the default `worktree`.
  10. **Release gating** *(only when `specs/.core/gating.config.json` exists)* —
      should this ship behind a feature flag, or land live?
      **Offer, don't impose**: the user decides and you raise it, so a spec
      never reaches
      `/spec-complete` with the question unasked. Cite the project's own
      `guidance` path from that config when it names one — skitterspec knows
      nothing about how this project does flags, and must not guess. Record the
      answer **either way**: a flag name, or `none: <one-line reason>`. "No" is a
      decision and belongs in the header; silence is not. Skip entirely when the
      config is absent — that project does not use flags.
  11. **Open questions** — anything still undecided.

Stop grilling when there are no unresolved branches that would change the spec.
Briefly play back the agreed understanding before writing.

## Phase B — write the spec

This skill is for **features**. For bugs, use `/spec-bug` (test-first, red→green).

### Write it in its own worktree

**Only when the project has per-spec isolation** (`specs/.core/env.config.json`
present). Without it there is no worktree to make and this section does not
apply — write the folder where you are standing, exactly as before.

**Provision before you write, not after.** Grilling put nothing on disk and the
spec's name is settled by the time Phase A ends, so this is the one moment where
a worktree costs nothing to obtain and everything is still ahead of it:

```
skitterspec spec-env up <name> --docs
```

Run the commands it prints under `to provision, run:`, and the
`skitterspec spec-env bootstrap <name> --docs` under `then, run:` where there is
one (it seeds the gitignored files, nothing more). Then move this session into
the worktree with a plain `cd` — the Bash working directory persists between
calls, so from here on the spec is written on its own branch. Confirm the move landed rather than
reading silence as success (`.claude/rules/negative-checks.md` rule 1):
`skitterspec spec-env resolve` with no argument must name this spec. If it does
not, say so and write the spec where you are standing instead; a spec in the
wrong tree is worse than a spec with no worktree.

**`--docs` is what makes this cheap.** It skips the `setup` commands and the
Docker stack — everything whose only purpose is making a tree *runnable* — so
provisioning a worktree to write markdown in is a `git worktree add` and nothing
else. `/spec-start` re-runs `up` over the same worktree without the flag, and the
setup runs then, at the first moment the tree is used for code.

**Why the base branch is no longer where this happens.** `main` is where work
**lands**, not where it happens. Authoring on it meant the spec sat uncommitted
there for as long as Phase C2's page went unanswered — which is unbounded by
design, because a reader walking away from a diff is the normal case — and a
release could not be cut through it. The verdict lands the spec instead, so
`main` gains it as one commit and is never dirty on the way.

**A spec written in ANOTHER spec's worktree is still the mistake it always was**,
and this section does not soften that. It physically lives on that branch: not on
`main` until that spec lands, invisible to anyone listing `specs/backlog/`
meanwhile, and cancelled along with its host. Committing it there also mis-stamps
the ticket trailer, which is resolved from the branch (see
`.claude/rules/commit-trailers.md`, installed with a ticketing provider). The
difference is whose worktree: **its own** is now the normal path, and someone
else's is the accident.

So if Phase A ran inside another spec's worktree — most likely because a design
question came up part-way through implementing it — the provision above is the
fix rather than something to warn about: it moves the session out of that tree
and into this spec's own. Where isolation is off and there is no worktree to
move to, **warn, don't refuse**, and say the trailer for that commit wants
`spec-sync ref <new-spec-name>` rather than the bare form.

- **Every spec is a folder** — never a bare file, even for a one-line change:
  `specs/backlog/feat-<kebab-name>/`. Create it with `mkdir -p`.
- The entry point is **always `00-overview.md`** — the index/dashboard for the
  spec. It holds the header block, Problem, Decisions, Solution overview, the
  **phase index** (a table linking to each phase file), Open questions, State
  log, and Changelog. It does **not** hold the per-phase task lists.
- **Each phase is its own file** — `01-<phase-slug>.md`, `02-<phase-slug>.md`, …
  numbered in execution order; the slug is a short kebab description of the phase
  goal (e.g. `01-data-model.md`, `02-api-endpoints.md`). The phase file holds
  that phase's goal, its task checkboxes (tests included), and any phase-specific
  notes. **Even a single-phase spec gets `01-….md`** — never lump phase tasks
  into `00-overview.md`. This keeps each phase easy to dive into on its own.
- Choose a short kebab-case name and **prefix it `feat-`** (the bug counterpart
  uses `bug-`).

Use this template (keep it **as concise as possible** — no filler, no restating
the codebase, link rather than duplicate):

```markdown
# <Feature title>

> **Type:** Feature
> **Name:** feat-<kebab-name> (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** Ready — not started
> **Author:** <git user.name — `git config user.name`>
> **Developer:** —
> **Raised:** <YYYY-MM-DD (today)>
> **Area:** <comma-separated files/modules this touches>
> **Stack:** <worktree — or "worktree + docker" if it touches the DB/stateful
> services; only acted on when isolation is enabled — see Phase A item 9>
> **Gating:** <flag name — or "none: <one-line reason>". Only when release gating
> is configured; omit the line entirely otherwise. An empty value or a bare
> "none" is not a valid outcome — see Phase A item 10>

## Problem

<2–6 sentences: what's wrong/missing and why it matters. No fluff.>

## Decisions

<Numbered, confirmed decisions from Phase A. Each: the choice + one-line why,
and the rejected alternative when it sharpens the choice. This is the heart of
the spec — be specific.>

## Solution overview

<Short prose or bullets describing the chosen shape end-to-end. Optional small
schema/grammar/output snippets where they remove ambiguity.>

## Impact

<The concrete surfaces this spec touches — the scannable blast radius, so a
reader can eyeball where the spec got something wrong without reading prose.
`Change` is `add` · `update` · `remove`. `Surface` is guided-but-open: use
values like Endpoint, Route/UI, Schema/model, DB table/migration, Domain object,
Service, CLI command, Config key, Skill/rule, Business rule — or whatever fits
this project (skitterspec itself is a CLI with no HTTP surface). Keep `Detail`
terse — names/signatures, not sentences. List **only** surfaces that actually
change; the heading is always present, but if nothing external changes write the
single line below instead of an empty table.>

| Surface | Change | Detail |
|---------|--------|--------|
| <e.g. Endpoint> | add | <e.g. POST /orders> |
| <e.g. DB> | update | <e.g. orders (+status col)> |

<_No external surface changes — internal refactor only._ — use this line in
place of the table when the spec touches no external surface.>

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | <goal> | ⬜ | [01-<phase-slug>.md](01-<phase-slug>.md) |
| 2 | <goal> | ⬜ | [02-<phase-slug>.md](02-<phase-slug>.md) |

## Open questions

- [ ] <anything deferred — or "None">

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| <YYYY-MM-DD> | Ready | backlog | <author> |

## Changelog

- <YYYY-MM-DD> — Spec created.
```

Then create **one file per phase** (`01-<phase-slug>.md`, `02-…`, in execution
order). Each phase file uses this template:

```markdown
# Phase 1 — <goal> ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** <one line — what this phase delivers and how it's proven>.

## Tasks

- [ ] <clear, verb-first task>
- [ ] <clear, verb-first task>
- [ ] Add/extend tests covering this phase; run the project's typecheck and
      test commands (see `.claude/rules/spec-planning.md`) — green before the
      phase is done.

## Notes

<Phase-specific decisions, gotchas, or context. Delete if empty.>
```

Keep the `00-overview.md` phase index and the phase files in sync: the index row
is the one-line summary + status; the phase file is the detail.

The **State log** is the audit trail of folder/status transitions — every
lifecycle skill (`/spec-start`, `/spec-complete`, `/spec-cancel`) appends one row
when it moves the spec. The **Changelog** is for decisions and course-corrections
only — keep the two separate.

Rules for the spec body:

- **Every phase is independently shippable and ends with tests.** A phase is
  not "done" until its tests are written and the suite is green. Bake a test
  task into each phase — never a separate "testing phase" at the end only.
- **Tasks are checkboxes** (`- [ ]`), clear, verb-first, and granular enough to
  finish in one session. They live in the **phase files**, not the overview. Use
  `⬜`/`🔄`/`✅` on each phase-file heading and mirror it in the `00-overview.md`
  phase index.
- **Honour project conventions** when writing tasks — reference the relevant
  `.claude/rules/*.md` rather than re-explaining them.
-
  **The `## Impact` table is derived from Phase A items 3 (Affected areas) & 5 (Data/API impact)**
  — a structured place to record what those already surface, not new grilling.
  It is the scannable substitute for spelling impact out in prose: name the
  surfaces (endpoints, schemas, DB tables, domain objects, routes, business
  rules) instead of describing them, keep `Detail` terse, and let it — not
  paragraphs — carry the blast radius. It complements the `Area:` header
  (files) by naming behavioural surfaces.
- **Changelog** is mandatory and lives in the spec. Every later decision or
  course-correction gets a dated one-line entry. Convert relative dates to
  absolute.
- Keep it tight. If a section adds no information, delete it.

## Phase C — finish up

Decide the status: **`Ready`** in `backlog` when grilling in Phase A resolved the
open questions, `Draft` when you deliberately left some unresolved. Either way
the next step is `/spec-start`. The Report section below is where all of that
reaches the user — do not narrate it here as well.

## Phase C2 — render the spec, then wait for the verdict

**Only when the project has per-spec isolation** (`specs/.core/env.config.json`
present). Without it there is no page and this phase does not exist — skip it in
silence rather than explaining an absence.

A spec is the one artefact whose whole purpose is to be
**read before work begins**, and until now it was the only one with no reading
surface: `/spec`
finished, the spec sat uncommitted, and `/spec-start` had to point that out and
commit it as a side effect of provisioning. So this phase ends where every other
phase of the lifecycle ends — on a page, in a verdict.

```
skitterspec spec-env review <spec> --docs --buttons authoring
```

`--docs` reads the spec's own documents from the tree you are standing in, which
after Phase B is **this spec's own worktree**. It renders
**this spec's documents and nobody else's**: the `owned` half of
`spec-env stage` is what supplies the file set, and it stays load-bearing even
now that the tree holds one spec — a project's `spec.companionPaths` and a
hand-edited `specs/.core/` both land in the same tree, and only the spec's own
documents belong under this verdict.

**This is free.** The engine reads git and splices text into a template; the
diff never passes through you.

**Never pass `--run-reviewers` here.** A spec is prose, and the reviewers
`review.reviewers` names read code — spending a rate-limited review on a
paragraph buys nothing. The engine refuses it on a `--docs` render whatever this
skill asks for, so this is a note about intent rather than a guard you are
holding: do not add the flag on the assumption that it was an oversight.

**Render nothing when nothing was written.** A `⏸` run — grilling that never
reached a shared understanding — has no spec to show, and must not ask for a
verdict on one.

**Arm nothing.** There is no `spec-env review arm` in this path, and that is a
decision rather than an omission: the gate asserts that *a phase which ended*
owes an answer, and a backlog spec owes no phase. A `/spec` run must leave
`spec-env review gate --check` exiting 0.

**And walking away from this page now costs nobody anything**, which is a
stronger reason than the one that used to sit here. It read *"the spec is simply
still uncommitted, which `/spec-start` already handles"* — true, and a
concession: an uncommitted spec meant a dirty base branch, which is everyone's
problem, so "arm nothing" was tolerating a mess rather than describing a clean
state. Since Phase B the unanswered spec sits on its own branch in its own
worktree, where it is in nothing's way: no release is blocked, no other spec has
to replay over it, and it is still exactly where it was tomorrow morning.

### The two endings this page offers

`--buttons authoring` offers `Commit & Start` and `Commit` in place of the
committing pair, because "commit and build the next phase" is meaningless for a
spec with no phase in flight.

- **`commit-start`** — hand off to `review.commitWith` (`/commit` by default),
  passing the pathspec the render reported on `docs.paths`; **land it** (below);
  then **keep the worktree** and run **`/spec-start <name>`**, and **stop there**.
  It never completes or tears anything down, exactly as `commit-continue` stops
  after `/spec-next`. This is the `commit && /spec-start` that was typed by hand.
- **`commit`** — the same commit and the same land, then
  **tear the worktree down** and finish. The spec stays `Ready` in `backlog` —
  on the base branch, where anyone can see it — ready for a `/spec-start`
  whenever it is wanted.

**Both committing verdicts land, and that is what keeps the backlog findable.**
`ls specs/backlog/` is how specs are found, and a folder bucket is only the truth
on the branch you are standing on — so a spec left on its own branch would be
invisible to everyone, including the next `/spec` run. The commit goes on the
branch and then the branch goes onto the base:

```
skitterspec spec-env integrate <name>
```

It plans a rebase onto the base branch in the worktree, then a
`merge --ff-only` in the primary checkout — run the commands it prints. It
refuses on a dirty tree, which is correct here: the commit ran first, so anything
still uncommitted at this point is not this spec's and the land must not proceed.

**Do not run its after-land section.** Where the plan ends with
`then, in the primary checkout (<path>), run:`, those are the project's
`afterLand` commands — a data migration, an install — and they exist for code
that landed. This land is documents only, so it changes nothing they would
catch up on; `/spec-complete`, `/spec-to-main` and `/no-spec` run them.

**If the rebase conflicts, stop and say so.** It is unlikely on a
documents-only branch and not impossible — two specs authored at once can both
touch `specs/.core/`. Run `git rebase --abort`, leave the commit sitting on the
branch, and report `❌` with the conflict: there is a standing worktree to clear,
which is what separates `❌` from `⏸`. Never resolve someone else's conflict to
get the land through.

**The worktree lifetime follows the verdict, and the asymmetry is deliberate.**
`commit-start` keeps it because you are carrying straight on, and `/spec-start`
re-runs `up` and `bootstrap` over it without `--docs`, which is where the setup commands
Phase B skipped finally run. Plain `commit` tears it down with
`skitterspec spec-env down <name>`, because a spec parked in the backlog should
hold no worktree and no `node_modules`; `/spec-start` provisions from scratch
whenever it is wanted. Always-keep would leave five backlog specs holding five
checkouts, and always-teardown would have `commit-start` re-provision seconds
after destroying the tree it needed.
- **`changes`** — work the notes into the spec, record a resolution for each one
  so the next render shows it struck through with what changed, then
  **re-render, and wait again**. The reader is still holding a decision, so
  ending the turn and
  making them type `/spec-diff` would reopen the loop this exists to close.
- **`discuss`** — report and talk. Claim nothing, change nothing.

**Take the pathspec from the render, not from the tree.** A checkout is shared,
so the set of this spec's uncommitted documents can differ between the render and
the verdict — and the reader's conclusion is about what the page showed them.

### Then wait for it

**The wait is a command. Do not write one.**

1. **Note the moment you start waiting**, as an ISO timestamp. That instant is
   the whole scope of what you may claim.
2. **Run the engine's wait, and end your turn** — under the harness's
   persistent watch primitive where one exists, else in the background
   (`.claude/rules/spec-reports.md` carries the preference):

   ```
   skitterspec spec-env review wait <spec> --since <the timestamp>
   ```

   It takes no timeout unless you pass one, and you must not pass one: a reader
   who walks away from a spec is the normal case, and a bounded watch once lost a
   verdict to a lunch break.
3. **On waking, let the engine pick:**

**A watch that dies is re-armed on the same window**, silently and bounded by
the age of that window — `.claude/rules/spec-reports.md` carries the contract,
including when to stop and what the banner says instead. Do not restate it
here.

   ```
   skitterspec spec-env review <spec> --docs --claim-since <the timestamp> --json
   ```

   It claims the one pass that arrived inside the window, acts on nothing when
   none did, and refuses to choose when two did.
4. **Route on the verdict** as above.

**Where the page is `file://`** — the engine could not serve — there is no server
to POST to, so the pass is copied and pasted and the reader's next message is
what carries it. **Do not start a watch that cannot fire**: a wait on the pending
store would spin forever while the report underneath it claimed to be holding,
which is the exact failure `.claude/rules/spec-reports.md` records. The wait is
the turn ending, and the banner says so.

Relay the engine's **stack** — the `local:`, `network:` and `remote:` lines, all
three, in that order — never the bare `page:` path. `.claude/rules/spec-reports.md`
carries the shape and why every tier is named rather than one being chosen.

## Phase D — record the isolation stack (only if configured)

**Only when `specs/.core/env.config.json` exists** (per-spec isolation is
enabled), make sure the `> **Stack:**` header reflects the Phase A item 9
decision — `worktree` (default) or `worktree + docker` when it touches the DB /
stateful services. Nothing to provision now: `/spec-start` gives every in-progress
spec its own worktree automatically, and brings up Docker only when the Stack
says so. Mention the operator can escalate the Stack later (edit the header, or
run `skitterspec spec-env up <name>` to add Docker to an existing worktree). If
`env.config.json` is absent, isolation is off — leave the default `worktree` and
finish as above.

## Phase D2 — record the gating decision (only if configured)

**Only when `specs/.core/gating.config.json` exists.** Make sure the
`> **Gating:**` header carries the Phase A item 10 answer — a flag name, or
`none: <reason>` using the config's `default` wording if it sets one. Nothing is
provisioned or enforced by this: the header exists so the decision is
**on the record and reviewable**, and `skitterspec gating check` reports a spec that has
none. It never blocks. If the config is absent, do not write the line at all.

## Phase E — link to a ticketing provider (only if one is installed)

**Only when a ticketing provider is installed and configured** (it ships the
`/spec-push` · `/spec-status` skills and a provider config under
`specs/.core/`). If none is present, skip this phase entirely — the spec stays
local-only and `/spec` behaves exactly as above. When a provider is present, link
the spec to the tracker after writing it, so status and discussion live there
while the repo stays the source of truth — follow the provider's link steps
below (nothing to do here without one).





## Report

End with the block defined in `.claude/rules/spec-reports.md`. That file carries
the shape; this section carries only what is specific here.

**Verdicts**

- `✅` — a `Ready` spec is written to `specs/backlog/<name>/`.
- `⚠️` — written as `Draft`; open questions were deliberately left. Name them.
- `❌` — the spec was committed and the land failed part-way: the rebase
  conflicted, or the fast-forward was refused. There is a standing worktree and a
  branch to deal with, so say where both are.
- `⏸` — grilling did not reach a shared understanding, so nothing was written.
  That is the skill working: a spec written over an unresolved requirement is
  the outcome Phase A exists to prevent.

**Fields:** `Tracker` · `Spec` · `Built` · `Landed` · `Worktree` · `Follow-ups` ·
`Next`

`Built` is the spec's path and phase count; `Spec` is its status and bucket;
`Tracker` appears only when a provider is installed and linked it.

`Landed` and `Worktree` belong to the **verdict** half of the run and appear
only once one has been acted on — a run that is still waiting on the page has
neither. `Landed` says the base branch fast-forwarded and to what; `Worktree`
says kept (on `commit-start`) or removed (on `commit`), with the path. Neither
appears where isolation is off: nothing was provisioned and nothing was landed.

**`Next` depends on whether Phase C2 rendered a page.** Where it did, the run is
waiting on a verdict, so the block **omits the `Review` row** and ends on the
banner defined in `.claude/rules/spec-reports.md` — counts, the tier stack, and
this page's two exits:

---

## ⏸ Review ready — &lt;N&gt; files, +&lt;a&gt; −&lt;d&gt;

- **local** — &lt;the `local:` URL&gt;
- **network** — &lt;the `network:` URL, or off with the command that turns it on&gt;
- **remote** — &lt;the `remote:` URL, or off with the command that turns it on&gt;

I'm holding here until you send a verdict — the wait covers local and network.

`Commit & Start` puts it in flight · `Commit` keeps it for later

---

There `Next` names the page rather than a command, because the button is what
carries the work on.

**Neither exit leaves the spec anywhere awkward**, and the banner does not
explain that — the whole point of Phase B is that there is nothing to warn
about. Both buttons commit and land, so either way the spec reaches the base
branch as one commit; the only difference is whether the worktree stays.

Where no page was rendered — isolation is not configured, or nothing was
written — `Next` is `/spec-start <name>`, with the name spelled the way it must
be typed.

**A spec written without a page is still uncommitted**, so that `Next` relies on
`/spec-start` committing the spec when it is all that is uncommitted. Say
`/commit, then /spec-start <name>` when anything else is uncommitted too, or the
row sends the reader to a refusal.

**`Follow-ups` is almost always `none` here.** This skill's whole job is to
capture work, so anything it surfaced belongs in the spec it just wrote rather
than in a follow-up line beneath it.

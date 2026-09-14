---
name: spec
description: Create a new spec-driven-development spec. Grills the user to a clear, shared understanding of the requirement AND the proposed solution FIRST, then writes one concise, phased, test-included, change-logged spec into specs/backlog/. Use when the user wants to plan a feature, write a spec, capture a requirement, or says "/spec" or "spec this out".
---

# /spec — author a new spec

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

### Write it from the base branch

**Check where you are before creating the folder.** A backlog spec belongs on
the base branch (`main`). If you are on another spec's branch — most likely
inside its worktree, because a design question came up part-way through
implementing it — say so before writing, and offer to author the spec from the
primary checkout instead.

It matters for more than tidiness: a spec written inside another spec's worktree
**physically lives on that branch**. It is not on `main` until that spec lands,
it is invisible to anyone listing `specs/backlog/` meanwhile, and if that spec is
cancelled the new spec is cancelled with it. Committing it there also mis-stamps
the commit's ticket trailer, since that is resolved from the branch (see
`.claude/rules/commit-trailers.md`, installed with a ticketing provider).

**Warn, don't refuse** — doing this deliberately is legitimate, and the user may
have a reason. If they continue, carry on exactly as normal, and mention that
the trailer for that commit wants `spec-sync ref <new-spec-name>` rather than the
bare form.

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

After writing, tell the user the path and that it's **`Ready`** in `backlog`
(grilling in Phase A resolved the open questions). If you deliberately left open
questions unresolved, write `Draft` instead and say what still needs deciding.
Either way, the next step is `/spec-start` to start building.

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





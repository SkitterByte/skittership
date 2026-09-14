---
name: spec-review
description: Re-validate an existing spec against the current codebase — detect drift (renamed/removed files, changed APIs, tasks already done in code, stale decisions), grill where a decision is needed, and update the spec so it's relevant again. Targets a spec by name (arg) or the spec in context. Use when the user says "/spec-review", "is this spec still accurate", "this spec has gone stale", or before picking up an old backlog spec.
---

# /spec-review — bring a spec back in sync with the codebase

Specs rot: the code moves on while a spec sits in the backlog or pauses
mid-build. This skill re-validates a spec against the **current** code and
rewrites the stale parts so it's safe to act on. It plans only — it does not
implement anything (that's `/spec-next`).

## 1. Identify the target spec

- Use the name/path argument if given, else the spec **in context**. If unclear,
  ask which spec.
- Locate the spec folder under `specs/` (any bucket). Entry point is its
  `00-overview.md`; read it **and every phase file** (`01-<slug>.md`, `02-…`)
  listed in its phase index (legacy specs may be a bare `<name>.md`).

## 2. Validate against the codebase — evidence first

Read the spec, then check every claim it makes against the real code. Don't
trust the spec's own wording — verify:

- **Referenced things still exist.** Grep/read for each `file:line`, module,
  function, route, model, type, or symbol the spec names. Flag anything renamed,
  moved, or deleted.
- **Impact map matches reality.** Walk every row of the `## Impact` table and
  verify against the code: does the named surface (endpoint, schema/model, DB
  table/migration, domain object, route, business rule) exist, and does its
  stated `Change` (add/update/remove) still hold? A stale Impact map is the
  highest-signal drift — each row is a named, checkable surface, so a wrong row
  is exactly the "obvious mistake" the map exists to surface. Flag/refresh stale
  rows (and add rows for surfaces the spec now touches but omits).
- **Tasks already done.** For each `- [ ]`, check whether the code already
  implements it (it may have landed via other work). Tick `- [x]` what's done.
- **Decisions still valid.** Re-check each `## Decisions` entry against the
  current architecture and `.claude/rules/*.md`. Flag any that now conflict with
  how the codebase actually works (a changed convention, a superseded approach).
- **New constraints.** Note rules/patterns introduced since the spec was written
  that it must now honour (e.g. a new required field, a new error type, a new
  pattern the rest of the code now follows).
- **Backward compatibility.** Re-confirm the planned API/schema changes are still
  additive/safe given the current code (see the project's compatibility rules).

### Release gating (only when configured)

**Only when `specs/.core/gating.config.json` exists.** Run
`skitterspec gating check <spec>`. A spec it names has no recorded gating
decision — or a bare `none` that records nothing — and that is
**drift like any other**: the question was never asked, or its answer was lost. Grill for it in
step 3 and write the header in step 4, exactly as you would a stale file path.

**This check is advisory.** It reports; it never refuses, and nothing below is
conditional on it. A spec written before the project adopted gating has no header
and is not broken — turning this into a gate would accuse the very specs the
feature was designed not to disturb.

## 3. Grill only where a decision is needed

Where the drift forces a choice (the old approach no longer fits, a referenced
thing is gone, scope is now ambiguous), grill the user like `/spec` Phase A —
**batching independent questions, each with a recommended answer** — but scoped
tightly to the drift. Don't re-litigate decisions that still hold. If you can
resolve it by reading the code, do that instead of asking.

## 4. Update the spec

- Rewrite stale **Decisions** / **Solution overview** and refresh the
  **Impact map** in `00-overview.md`, and stale **tasks** in the phase files,
  so they match the current code and the resolved questions. Add/remove tasks
  within a phase file; add a new phase by creating a `0N-<slug>.md` file
  **and** a matching overview index row, or drop a dead phase by removing both.
  Keep the index and files in sync; **preserve completed `[x]` history**.
- **A phase's status is the `⬜`/`🔄`/`✅` on its H1** — `# Phase 2 — <goal> 🔄`.
  It is mirrored in that file's `> **Status:**` line and in the matching
  `00-overview.md` phase-index row, but the **heading is the authoritative one**:
  tooling reads it, and a heading carrying no emoji reads as *not started*. So a
  finished phase marked only by a `**Status:** done` line is silently wrong
  everywhere except the file itself. Set all three together.
- **Especially when you create phase files.** Migrating a legacy spec (a bare
  `<name>.md`, or a `00-overview.md` with inline phases) into the folder +
  phase-file form means authoring `0N-<slug>.md` headings from scratch — carry
  each phase's real status onto its H1 as you split it out, rather than
  defaulting every new file to `⬜`. A ticketing provider projects that emoji as
  the phase's state in the tracker, so getting it wrong mirrors a
  complete phase as not-started.
- Tick tasks already satisfied by the code; re-open `## Open questions` for
  anything still undecided.
- Add a dated **Changelog** entry summarising the review (e.g. `- <date> —
  Reviewed vs codebase: retargeted Phase 2 onto X, dropped Y (removed), ticked Z
  (already done)`).
- **Status:** if drift is minor, leave status as-is. If a `Ready` spec needs real
  re-grooming, knock it back to `Draft` (set `> **Status:** Draft` and append a
  **State log** row).



## 5. Report

Summarise the drift found, what you changed, any questions still open, and
whether the spec is now safe to `/spec-start` (or should drop back to `Draft` until
the open questions are resolved). Do **not** `git commit` unless the user asks.

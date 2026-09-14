---
name: spec-init
description: Bootstrap the spec-driven-development workflow in the current project — create the specs/ lifecycle folders and .core, wire version-control so specs are tracked, verify the spec skills are installed, and add the spec workflow to CLAUDE.md and .claude/rules. Idempotent and safe to re-run. Use when setting up a new project for specs or repairing the setup, or when the user says "/spec-init", "set up specs here", "initialise the spec process".
---

# /spec-init — set up the spec-driven-development workflow

Bootstrap (or repair) everything this project needs to run the spec lifecycle.
**Idempotent:** detect what already exists, create only what's missing, and never
clobber customised content. Finish with a summary of created vs already-present.

> If `@skitterbyte/skitterspec` is installed, `npx @skitterbyte/skitterspec init` does
> all of the below mechanically. This skill is the manual/repair path and is
> useful when the package isn't available or you only need to fix part of the
> setup.
>
> **Re-running on an already-set-up repo is safe.** `init` detects the existing
> setup (via the committed `specs/.core/.skitterspec-manifest.json` of installed
> file hashes) and, interactively, offers three paths — **Resync** (update managed
> skills/rules to the latest but keep files you've edited), **Start again** (reset
> the managed scaffolding fresh — never your specs or config, with a confirm), or
> **Leave alone**. Non-interactively it only adds what's missing; `--resync` /
> `--reset` (reset needs `--yes`) drive the stronger actions.

The system is **ten skills**: `spec` (feature), `spec-bug` (bug),
`spec-hotfix` (a bug fixed on a released tag), `spec-review`, `spec-start`,
`spec-next`, `spec-to-main`, `spec-complete`, `spec-cancel`, and this
`spec-init`. The lifecycle is `backlog → in-progress → complete / cancelled`,
with `.core` holding always-apply project rules.

## 0. Workspace mode (only when adopting isolation)

If this project is adopting per-spec isolation, ask which `mode` belongs in
`specs/.core/env.config.json` — `worktree` (default; a checkout per spec, several
at once, one terminal session each) or `checkout` (the branch is built in the
checkout you are already in; one spec at a time, no hand-off). It is a question
about how the operator works, not about what the repo contains, so ask rather
than infer it from whether dev servers or Docker are configured.

## 0b. Release gating (optional, and separate)

Ask whether specs should record a **release-gating** decision — does this change
ship behind a feature flag, or land live? Adopting it copies
`specs/.core/gating.config.json.example` → `gating.config.json` and sets
`guidance` to wherever this project documents its flags.

It is **orthogonal to isolation**: a project can adopt either, both, or neither.
Skitterspec never learns how the flags work — it asks the question, cites that
path, and records the answer on each spec. Leave it off and nothing appears:
no question, no header, no check. Off is a perfectly good answer for a project
that does not use flags.

## 1. Folders

Create any that are missing; drop a `.gitkeep` into ones that would otherwise be
empty so git keeps them:

- `specs/.core/` — project rules (always apply; never moved)
- `specs/backlog/` `specs/in-progress/` `specs/complete/` `specs/cancelled/`

## 2. Version control — keep specs tracked

The whole lifecycle lives in git — **everything under `specs/` is tracked**, so
the default is simply *no ignore rule excluding it*. Ensure `.gitignore` has no
`/specs/*` (or similar) entry that would hide spec folders; if one exists and the
project wants everything tracked, remove it. Confirm with
`git check-ignore -v specs/.core/<any-file>` — it should print nothing (tracked).

- **`.core` dotfile caveat:** only relevant if a `/specs/*` ignore is
  (re)introduced — `*` matches dotfiles, so `.core` would need an explicit
  `!/specs/.core/` negation. With no ignore rule, it's tracked automatically.
- If the project uses a formatter/linter ignore glob that excludes `specs/**`,
  decide whether spec markdown should be formatted/linted and adjust accordingly.
- If a project later wants to **stop** versioning work-in-progress specs, that's
  a deliberate opt-out (e.g. `/specs/*` + `!/specs/.core/`) — ask first; the
  default is track-everything.

## 3. Verify the skills are installed

Check each of the ten skills resolves — `.claude/skills/<name>/SKILL.md`
(project) or `~/.claude/skills/<name>/` (global). List any missing. This skill
scaffolds the project; it does **not** regenerate skill bodies — missing skills
must be copied in (e.g. `npx @skitterbyte/skitterspec init`) from a global install
or a sibling project. If most/all are global, just confirm availability.

## 4. Governing rule (`.claude/rules/spec-planning.md`)

Ensure it exists. If missing, create it documenting:

- the lifecycle skills with their **status** and **folder** (table);
- the **type** convention — header `> **Type:** Feature|Bug` + filename prefix
  `feat-`/`bug-` (never `[BUG]` brackets — glob hazard);
- the **Author** / **Developer** header fields;
- the **State log** audit table (folder/status transitions), kept separate from
  the **Changelog** (decisions);
- the project's concrete typecheck/test commands, and the rule that
  **every phase ends with creating + running tests**.

Read a sibling spec skill (e.g. `spec`, `spec-next`) for the canonical shapes
rather than inventing them. If the rule already exists, leave it unless stale.

## 5. CLAUDE.md

Ensure a `## Spec workflow` section exists. If absent, add one with the
skill table (`Skill | Action | Status | Folder`), the Feature/Bug type note,
and a pointer to `.claude/rules/spec-planning.md`. Also update the `specs/` entry
in any project-structure tree to show `.core/` + the four lifecycle folders. If
the section exists, refresh only stale folder/skill names — don't rewrite it.

## 6. Report

Summarise per area — folders, `.gitignore` lines, tooling-ignore negations,
skills (present/missing), rule file, CLAUDE.md section — as created / updated /
already-present, plus the `git check-ignore` result for `.core`. Do **not**
`git commit` unless the user asks.

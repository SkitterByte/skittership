---
name: commit
description: Stage and commit the current change with a concise conventional-commit message. Stages only files related to the task, runs typecheck and the relevant tests first, and appends a Release-Note: footer when the change is user-visible (grammar in .claude/rules/commit-messages.md). Use when the user says "/commit", "commit this", or wants their working changes committed.
---

# /commit — stage and commit the current change

A disciplined commit: stage only what belongs to the task, prove it's green,
then write a conventional-commit message — with a `Release-Note:` footer when an
end user would notice the change. Message grammar and length limits live in
`.claude/rules/commit-messages.md`.

1. Run `git status` and `git diff --staged`.
2. Stage ONLY files related to the current task (ignore unrelated UI/config
   drift).
3. Run typecheck and the relevant tests.
4. Write a concise conventional commit message scoped to the change.
5. **Decide if the change is user-visible.** If an end user would notice it
   (feature, fix, improvement), append a `Release-Note:` footer in plain user
   language — what they can now do, not the implementation. Use `Release-Note!:`
   for a release headline, and `Release-Area:` to override the area when the
   scope isn't a user area. Omit the footer for internal/dev-only changes
   (`chore`, `test`, `docs`, refactors with no user effect). Put a blank line
   before the footer. See `.claude/rules/commit-messages.md` → "Release notes
   footer" for the grammar. When the release tooling is installed, these footers
   are what the generated release notes are built from at `npm version` — so the
   note is the user-facing record of the change, not just metadata.
6. Do NOT ask about unrelated uncommitted files.

---
name: commit
description: Stage and commit the current change with a concise conventional-commit message. Stages the files it names one by one, commits them with the same explicit pathspec, runs typecheck and the relevant tests first, and appends a Release-Note: footer when the change is user-visible (grammar in .claude/rules/commit-messages.md). Use when the user says "/commit", "commit this", or wants their working changes committed.
---

# /commit — stage and commit the current change

A disciplined commit: name the files that belong to the task, prove it's green,
then commit exactly those files with a conventional-commit message — with a
`Release-Note:` footer when an end user would notice the change. Message grammar
and length limits live in `.claude/rules/commit-messages.md`.

1. Run `git status` and `git diff --staged`.
2. **Re-run `git status --short` immediately before staging** — not just at step
   1 — and stage each file by name:

   ```
   git add -- <path> <path> <path>
   ```

   Name every path. Never stage a directory, never `-A`, never `.`. A directory
   pathspec stages whatever happens to be in that directory at that instant,
   including a file another session created in the seconds since step 1. That is
   why the status re-run is part of this step and not optional.
3. Run typecheck and the relevant tests.
4. Write a concise conventional commit message scoped to the change — including
   the `Release-Note:` footer decision in step 5 — and commit it with **the same
   pathspec you staged**:

   ```
   git commit -m "<message>" -- <path> <path> <path>
   ```

   The `--` pathspec is what bounds the commit. `git add` alone does not — see
   "Why both halves are required" below.
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
6. Do NOT ask about unrelated uncommitted files. With a bounded commit they
   cannot ride along.

## Why both halves are required

A checkout has one `.git/index`, shared by every process standing in it —
another agent session, a watcher, a hook. Both halves below are load-bearing and
they answer different failures:

- **Naming paths on `git add`** stops *this* session from sweeping in files it
  never touched. Staging a directory — `git add src/` — takes everything in
  it, including a file that appeared between your `git status` and your
  `git add` seconds later.
- **Naming the same paths on `git commit`** is what actually bounds the commit.
  If another session has already staged something, a bare `git commit` takes it
  no matter how precisely this session staged its own files. `git commit --`
  with a pathspec commits only those paths and leaves the rest of the index
  untouched.

Neither half substitutes for the other. The `git add` is still required because
`git commit` cannot take a path git has never seen — which is every new file.

Do not collapse this into a single step.

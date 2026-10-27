---
name: spec-github-setup
description: Configure GitHub sync for this repo by interview rather than by hand — asks for the repo, the board and its Status options, validates the answers against GitHub, then writes specs/.core/github.config.json. Safe to re-run; an existing config is reviewed, never overwritten without consent. Use when the user says "/spec-github-setup", "set up GitHub sync", "connect this repo to GitHub", "configure github.config.json", or "check my GitHub setup".
---

# /spec-github-setup — configure GitHub sync by interview

> Stay silent while this runs — speak only to ask something you cannot answer
> yourself, or to report a failure at the moment it happens. Read
> `.claude/rules/spec-reports.md` before reporting; it defines the block this
> skill ends with.

Writes `specs/.core/github.config.json`, the file that switches one-way GitHub
sync on for this repo. You **interview**; the engine
(`spec-sync init-config`) **validates and writes**. Keep that split: composing
the JSON yourself is how a malformed config gets committed, and the engine
already rejects everything the loader would later reject.

The gap this closes is not "I can't remember my repo name" — it's that nothing
ever asks which board this repo's work lives on and which Status options its
lifecycle maps to, so the config ends up describing a shape nobody confirmed.
Ask about structure first; the values fall out of the answers.

## 1. Check what already exists

Read `specs/.core/github.config.json`.

- **Absent** — this is a first-time setup. Carry on.
- **Present** — say so and default to **reviewing** it, not replacing it: run
  the checks in steps 2 and 5 and report where the live config disagrees with
  GitHub (a board number that no longer resolves, a Status option that was
  renamed).
  That is the most useful thing a re-run can do. Only write when the user asks
  for it, and then pass `--force`.

## 2. Credentials first

The interview validates its answers against GitHub, so settle authentication
before asking anything:

```
skitterspec spec-sync credentials status
```

If nothing is set, tell the user to run this **themselves**, in their own
terminal:

```
skitterspec spec-sync credentials set
```

It prompts for a token (hidden): a **classic** personal access token with the
`repo` and `project` scopes, created at https://github.com/settings/tokens.
Fine-grained tokens are documented only for **org-owned** boards, so on a
personal account's board a classic one is what works. With `GITHUB_TOKEN` or
`GH_TOKEN` already exported — `gh` users often have one — nothing needs storing.

**Do not ask the user to paste a token into this conversation, and do not offer to store one for them.**
A credential pasted into a chat enters the transcript, is sent to the model,
and may be logged — moving where it is stored is pointless if it travels
through the conversation to get there. Your job is to confirm the setup is
ready and name the command; the values are theirs alone.

**Degrade, never block:** with no credentials and no MCP connection the answers
cannot be validated. Say so in one line —
*"GitHub not reachable — can't validate the answers"* — point at the manual path
(`github.config.md`, the field reference beside the example config), and
**stop without writing anything**. A half-written config is worse than none:
every other command switches on the moment the file exists.

## 3. Which repo, and which board?

- **Owner and repo** — read them off `git remote get-url origin` and offer them;
  they are where spec issues are created. The owner also keys the stored token.
- **Board** — the Projects v2 board's **number**, the one in its URL
  (`github.com/users/<owner>/projects/7` → `7`). It must be owned by the same
  owner.

**The board is required, and it is one per repo.** An issue is only open or
closed; the states a spec moves through are the options of a single-select
field on the board, so an issue off the board has no state at all. Say that
plainly. If the user has no board yet, tell them to create one on GitHub — a
**Board** layout is the natural view — and come back with its number. **Never
create the board yourself**: it is the user's surface, and its layout and
automations are theirs to choose.

## 4. Which field carries state?

- **`github.statusField`** — default **Status**, the field every new board
  starts with. Take the default unless the user keeps state in another
  single-select.
- **Turn off the board's built-in "Item closed → Done" and "Pull request
  merged → Done" workflows**, or leave them knowingly: the engine sets Status
  itself, and a board automation moving it too is a second writer the next push
  overrides.
- **A second single-select, `Deployed`**, is where release stages belong
  (Test, Demo, Prod) — never as Status options, or a finished phase reads as
  deployed. Mention it; releases set it, and setup does not need it.

## 5. Check the Status options

```
skitterspec spec-sync states --json
```

It prints the board's options, exactly as GitHub spells them — and reaching
them is the setup's first real end-to-end check: a wrong owner, repo, board
number or token fails here, while the user is still in the setup conversation.
Relay a failure with its fix rather than pressing on.

Then settle the four bucket→option names against that list:

- `backlog` → `Backlog` · `in-progress` → `In Progress` · `complete` → `Done` ·
  `cancelled` → `Cancelled` by default. A new board's Status field carries
  `Todo`, `In Progress` and `Done`, so a fresh board usually needs `Backlog`
  and `Cancelled` **added on the board** — or `backlog` mapped to `Todo`.
  Offer both; it is the user's call.
- `complete` also closes the issue as `completed`, and `cancelled` as
  `not_planned`, whatever the options are called.
- **Validate every answer against the `states` output** before writing. An
  option the board lacks is refused at push time, after the body has landed —
  catching it here is the whole reason this step exists.
- Where a configured or offered name is not in the list, show the real names
  and ask which one means that bucket here — the mapping is the user's call,
  never a guess.

Each answer that differs from the defaults becomes a `--state <bucket>=<name>`
flag in step 6.

**Labels.** Spec issues are labelled `spec` and phases `phase` (configurable in
`github.labels`). GitHub creates a label on first use, so nothing is required —
but offer to create them now with a colour, since a label made on first use is
grey and undescribed. Create them only on a yes.

## 6. Write it

```
skitterspec spec-sync init-config \
  --owner <owner> --repo <repo> --project <N> \
  [--status-field Status] [--state <bucket>=<name> …] [--force]
```

The engine writes **only the keys that were given**, so the file shows this
repo's choices and keeps inheriting everything else. `--force` is required to
replace an existing config — never pass it without the user having asked for a
rewrite in step 1.

**Relay the engine's report as printed.** It names what it wrote and whether
the state map was checked against the board — that report is the evidence the
setup is right, so don't paraphrase it into "done". It also says to commit the
file: a spec worktree forks from a commit, and sync is off wherever the file is
absent.

## 6b. Let `/spec-start` commit the snapshot with its spec

**Only when `specs/.core/env.config.json` exists** (per-spec isolation is on).
If it is absent, skip this — there is nothing to configure.

**Check before you write — a fresh install may already have this.** When this
superset's `init --isolation` wrote the `env.config.json`, both keys below are
seeded; this step is the **retrofit** for a project that adopted isolation
before installing the GitHub provider, or ran `/spec-github-setup` before adopting
it.

`/spec-start` commits an uncommitted spec for you, but only the paths it can
prove belong to that spec. Its own folder always does; this repo's per-spec
GitHub snapshot (`sync.baseDir`, `specs/.core/github-base/<ID>.base.json`) does
not, because the base engine is deliberately tracker-free and cannot know that
path exists. Declare it once, in `env.config.json`:

```json
"spec": {
  "companionPaths": ["specs/.core/github-base/{identifier}.base.json"]
}
```

`{identifier}` resolves through `branch.identifierField`, so **set that too** if
it is still empty — `"github_identifier"` is the field `/spec` stamps. Without
it the pattern expands to nothing and the snapshot is treated as another spec's
file: `/spec-start` then refuses the tree instead of committing it, which is the
safe failure but a needless one.

Leave both alone if the user has already set them.

## 7. Report and hand off

**Finish by checking, not by describing.** Run:

```
skitterspec spec-sync doctor
```

and relay its table. That is the difference between a summary of what setup
*meant* to do and a check of what is actually true — including the layers this
skill never touched (the scaffold, isolation). Every row that needs attention
names its own fix, so there is nothing to paraphrase.

It exits non-zero only when a layer is **broken** — configured but wrong. A
`missing` row is an opt-in nobody took, which is fine; report it, don't treat
it as a failure.

Then name the next step:

- `/spec` — write a spec; with GitHub configured it creates the linked issue in
  the configured repo, puts it on the board and stamps its number.
- `/spec-status` — read-only drift report, the safe way to prove the link works.
- `/spec-push` — send a spec up.

Mention what setup did **not** configure, so the defaults aren't mistaken for
decisions: phase mapping (`mapping.phases` — sub-issue per phase by default) and
field ownership, and intake (`intake.label`, `bugLabels`, `hotfixLabels`).
Point at `github.config.md` for those. Assignment is on by default
(`sync.fieldOwnership.assignee: push`): `/spec-start` assigns the issue to the
token's login, and `spec-sync whoami` shows who that is.

End with the block defined in `.claude/rules/spec-reports.md`. That file carries
the shape; this section carries only what is specific here.

**The `doctor` table goes above the block, verbatim.** It is a check rather than
a summary, and every row that needs attention names its own fix — paraphrasing
it into fields would lose exactly that.

**Verdicts**

- `✅` — every layer `doctor` checked is configured and working.
- `⚠️` — configured, with a `missing` row: an opt-in nobody took, which is fine.
  Report it; do not treat it as a failure.
- `❌` — a `broken` row: configured but wrong. Relay the row and its fix.
- `⏸` — an existing config was reviewed and left alone, or GitHub could not be
  reached. Nothing was written.

**Fields:** `Built` · `Follow-ups` · `Next`

`Built` is the config written or reviewed, plus what was deliberately left
unset. **The credentials are never a field** — `doctor` already reports whether
they are set, masked, and the values are the user's alone.

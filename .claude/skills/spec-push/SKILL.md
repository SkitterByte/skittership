---
name: spec-push
description: Push a spec up to its linked GitHub issue (repo → GitHub, one-way). The repo is the source of truth and GitHub a generated mirror, so content is never read back or merged. A spec is an issue and each phase a sub-issue. Opt-in — needs specs/.core/github.config.json. Use when the user says "/spec-push", "push to GitHub", "update the GitHub issue from this spec".
---

# /spec-push — send a spec up to GitHub (one-way)

> Stay silent while this runs — speak only to ask something you cannot answer
> yourself, or to report a failure at the moment it happens. Read
> `.claude/rules/spec-reports.md` before reporting; it defines the block this
> skill ends with.

Repo → GitHub. The repo is the **source of truth**; GitHub is a
**generated mirror**. A spec is a GitHub **issue**; each phase is a **sub-issue**,
and the phase file is mirrored into that sub-issue's description as written — its
prose, its sections, and its tasks as a read-only checklist, never as issues of
their own. Only the phase's h1 and `> **Status:**` line are left out, because
both are pushed as fields of their own (the sub-issue's title and board Status). This
skill computes what changed since the last push and applies it — it never reads
GitHub content back or merges. A person editing the mirror in GitHub will see it
overwritten on the next push.

**Opt-in**: only runs when `specs/.core/github.config.json` exists. If absent,
tell the user how to enable GitHub sync and stop.

## 1. Identify the target spec

Use the argument, else the spec in context; ask if unclear.

## 2. Pick the transport, and get the board's Status options

**Ask the engine first — it decides, not you:**

```
skitterspec spec-sync states --json
```

With a GitHub token set (`GITHUB_TOKEN`, `GH_TOKEN`, or whatever
`auth.tokenEnv` names, or the stored one) the engine talks to GitHub directly.
That is the **fast path**, and it is the default whenever a token resolves:
descriptions never pass through you, in either direction. Without them it falls
back to MCP and everything below works as it always has.

- **`transport = api`** → the command prints the board's Status options as a
  JSON array. Write it to a file and carry on to step 3.
  **Skip the MCP tool discovery entirely** — you make no GitHub calls here.
- **`transport = mcp`** → do the MCP work: discover the issue
  **read + write** tools at runtime on GitHub's official MCP server
  (`https://api.githubcopilot.com/mcp/`) — `issue_read`, `issue_write`,
  `sub_issue_write`, plus `projects_get` / `projects_write` for the board. If
  GitHub isn't connected or a needed tool is missing, relay the fix and stop,
  **writing nothing**. Then read the board's `github.statusField` options
  yourself and write their **names** to a file as a JSON array
  (e.g. `["Backlog","In Progress","Done","Cancelled"]`).

Either way you end up with a states file. Step 3 requires it:
`push` **refuses to run** without one, because a spec's state is a **board
Status option** — the engine sets it by name, and an option the board lacks is
refused at the field write, after the body already landed. So it is checked
before anything is written. If the check reports a name that isn't on the board,
stop and fix `specs/.core/github.config.json`.

**If the check refuses, offer to fix it.** The refusal lists every configured
name the board lacks, the board's real Status options, and — where the bucket
makes it unambiguous — which one to use instead. Relay that, then offer to
apply it to `specs/.core/github.config.json` → `states`, and do so on the user's
confirmation. Never edit their config without asking, and never guess a bucket
the refusal made no suggestion for — ask which status they want.

`--skip-state-check` exists for the deliberate exception; do not reach for it to
get past a failing check.

## 3. Get the plan from the engine

```
skitterspec spec-sync plan <spec> --workspace-states <file> --json
```

The engine prints a JSON **plan** (no network, no remote read):

```json
{
  "issue": { "description": "…", "state": "in-progress" },
  "subIssues": {
    "create": [{ "ref": "01-outbox", "name": "Outbox", "goal": "…", "state": "backlog" }],
    "update": [{ "id": "#2", "name": "…", "goal": "…", "state": "in-progress" }]
  }
}
```

An empty plan (no `issue`, no sub-issue create/update) means the mirror is up to
date — say so and stop. The plan's `subIssues` key is where the sub-issues live.
`state` values are local buckets
(`backlog`/`in-progress`/`complete`/`cancelled`); map each to the GitHub STATUS
name via `config.states` at apply time.

A **`phasesDeferred`** field means `mapping.phases` is `"deferred"` and this spec
has not started, so its phases are deliberately absent from the plan — the issue
pushes alone and the sub-issues are minted by the push that follows `/spec-start`.
Relay the count; it is not a sign the phase files failed to parse. Nothing else
about applying the plan changes.

The plan always carries a **`phaseMode`** field — `subissue`, `deferred` or
`inline` — the mode that resolved for THIS spec's lifecycle bucket.
`mapping.phases` may be a per-bucket map, so the config alone no longer tells you
which mode a given spec got. Relay it whenever it is not `subissue`:

- **`inline`** — no sub-issues are created at all. Each unlinked phase is a
  section of the spec issue's own description, and the `## Phases` index stays as
  its table of contents. A plan with no sub-issue creates is the expected shape,
  not a parse failure. A phase that already carries an id keeps its sub-issue and
  still appears under `subIssues` — apply those normally.
- **`deferred`** — as above; the `phasesDeferred` count says how many are waiting.

Nothing about how you apply the plan changes in either mode: apply exactly the
`issue` and `subIssues` the plan lists.

## 4. Apply the plan

**On `transport = api`, this is one command:**

```
skitterspec spec-sync apply <spec> --plan plan.json
```

It creates and updates the issue and its sub-issues, reads each description back
and runs the same check as step 4b, stamps every returned number into the spec, and
records the snapshot. **Steps 4a–5 below are then already done** — skip to step 6
and report what it printed, including the transport.

Two things it guarantees, so you don't have to manage them:

- **It writes nothing until everything checkable has been checked** — a missing
  key or a `config.states` name the board lacks fails before the first write.
- **It stamps each number the moment its object exists.** If a run is interrupted,
  re-run the same command: the objects it already created are linked, so the new
  plan sees them as updates and no duplicate is minted. Never "start again" by
  hand.

If it prints **`transport = mcp`** it has written nothing and is telling you to
apply the plan yourself — do steps 4a, 4b and 5 below. Pass `--via mcp` to force
that deliberately.

There is no project to pick, on either path: a minted issue lands in the
configured repo, on the configured board.

## 4a. Apply it yourself — the MCP path (order matters)

**First, check whether you are about to overwrite someone.** On the API path
`apply` does this for itself, off the read-back it already makes — for the spec
issue and for every phase sub-issue it is about to update, so a box ticked on a
phase issue prints `!! #N's body was edited on GitHub`. On the MCP
path nothing has read the issue yet, so ask before you write:

```
skitterspec spec-sync status <spec> --remote <issuefile>
```

using the same issue JSON step 2 fetched — it must carry the `description`. A
`drift: … description was edited on GitHub since the last push` line means a
person wrote something there that step 1 below replaces.

**It is a warning and never a gate.** The repo is the source of truth and the
push still goes ahead; relay the line, name the issue, and carry on. What is
forbidden is doing it *silently* — someone's paragraph disappearing with nothing
said about it is the failure this exists to end. Nothing printed means nothing to
say, which includes every case the engine could not tell.

1. **Spec issue** → if the overview has no `github_identifier`, this push
   **mints** it: create it with `issue_write` (title from the spec title; body
   from `plan.issue.description`; label `github.labels.spec`), then with
   `projects_write` add it to the board and set its Status to the option
   `config.states` maps `plan.issue.state` to. Keep the returned number and url
   for step 5 — don't hand-edit frontmatter. If it already exists and
   `plan.issue` is present, **update it by number** with `issue_write`, and set
   the Status only when it actually differs.
2. **Sub-issues create** → for each, `issue_write` (`name` → title, `goal` →
   body, label `github.labels.phase`), then `sub_issue_write` to link it under
   the spec issue, then add it to the board with its mapped Status. Keep each
   returned number against its `ref` (the phase-file basename).
3. **Sub-issues update** → `issue_write` by number (title/body), plus
   `projects_write` where the Status changed.
4. **Close or reopen to match.** A spec or phase in `complete` closes with
   reason `completed`; in `cancelled`, `not_planned`; anywhere else it is open.
   `issue_write` sets `state` and `state_reason`.

Milestones, other labels and comments are GitHub-native triage — do **not**
push them; they're the PM's.

## 4b. Verify what GitHub actually stored — the MCP path

*(On the API path `apply` already did this. Skip.)*

GitHub stores an issue body as the markdown it was sent, so a clean push reads
back identical; what `verify` catches is a body someone has since edited, or a
write that did not land. Check before you record the push as good.

For each issue you created or updated in step 4a, read its `description` back
(`issue_read`) and write what you got to a JSON file:

```json
{ "issue": "<stored description>", "subIssues": { "01-outbox": "<stored>" } }
```

Then:

```
skitterspec spec-sync verify <spec> --stored <file>
```

It compares against what the engine sent, ignoring bullet markers and
whitespace and reporting only lost or altered **word characters**. Relay any divergence — it prints both sides around
the first difference. It exits 0 either way: the repo is unaffected and still
correct, so this is a warning, not a failure.

This is **not a pull**. Nothing read here is merged, stamped, or written
anywhere; the repo remains the only source of truth. Do it before step 5 so a
corrupted push is visible before the snapshot records it as good.

## 5. Stamp the numbers, then record the snapshot — the MCP path

*(On the API path `apply` already did both. Skip.)*

Write every number you collected back into the spec in **one** call — the engine
does the file edits, so there is no hand-editing of frontmatter:

```
skitterspec spec-sync stamp <spec> \
  --issue #11 --url https://github.com/<owner>/<repo>/issues/11 \
  --sub 01-outbox=#12 --sub 02-api=#13
```

Pass `--issue`/`--url` only on the push that minted the spec issue; pass one
`--sub <ref>=<#n>` for every sub-issue **created** in step 4a.2 (updates already
have their number). It validates every ref and number **before** writing anything and
exits non-zero having changed nothing if any is wrong — so a typo can't leave the
spec half-stamped, pointing at an issue that isn't there. Fix what it reports and
re-run; it is safe to repeat.

Then record what was pushed:

```
skitterspec spec-sync record <spec>
```

This writes the last-pushed snapshot from the now-stamped files, so the next
`/spec-push` produces an empty plan. Commit the stamped spec + snapshot into the
branch so the mirror-link rides in the PR.

## 5b. A refused mint, and the way back

Two refusals reach you from `apply`, and neither is a failure to retry.

**`N already exists and no spec claims it`** — the push was about to mint, and
an issue with **exactly** this title is sitting there unheld. That is almost
always the spec's own issue, whose link was lost: a bad merge, a hand edit, a
stray `sed` over the frontmatter. Adopt it rather than creating a twin. The
Linear provider ships `reattach` for this; the GitHub provider does not yet, so
the fix is the manual escape hatch — read the issue number back to the user,
confirm it is the spec's own issue, then:

```
skitterspec spec-sync stamp <spec> --issue <#N>
```

**`N exists in GitHub but could not be recorded`** — the create landed and the
stamp did not, so GitHub holds an issue the repo does not point at.
**Do not re-run**:
the plan still reads the spec as unlinked, so a re-run mints a second.
`stamp` with the number the refusal named is the fix here too.

Everything else — a rate limit, a refusal that says waiting will not help — is
reported with GitHub's own explanation and whether retrying can help. Relay it;
do not paraphrase.

## 6. Report

End with the block defined in `.claude/rules/spec-reports.md`. That file carries
the shape; this section carries only what is specific here.

**Verdicts**

- `✅` — the mirror matches the repo and the snapshot is recorded.
- `⚠️` — pushed, with something worth knowing: GitHub stored different words, or
  `phasesDeferred` phases not yet minted.
- `❌` — it wrote some objects and failed on another. Name what exists in GitHub
  now; `apply` stamps each number as it goes, so the re-run is an update, never a
  duplicate.
- `⏸` — no config, no `github_identifier`, or an unvalidated status list. Nothing
  was written.

**Fields:** `Tracker` · `Follow-ups` · `Next`

`Tracker` carries what was created and updated — the spec issue and its
sub-issues — **the transport that did it**, and that the snapshot was recorded.

**Say the transport, every time.** On the API path you never saw the
descriptions, so "pushed 12 sub-issues" is the engine's report rather than your
observation, and that distinction is the difference between a fact and a
paraphrase. If it warned that GitHub stored different words, relay it: the repo
is still correct and a re-push overwrites the mirror.

There is no pull — GitHub is a generated mirror.

GitHub has no project picker: a minted issue lands in the configured
`github.owner`/`github.repo`, on the one board `github.project` names — both
decided once in `specs/.core/github.config.json`. There is nothing to ask.

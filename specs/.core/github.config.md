# `github.config.json` — field reference

`specs/.core/github.config.json` is the committed half of GitHub sync: the
repo, the board, and env-var **names**. It never holds a token — that lives in
the environment or the user-level store (`spec-sync credentials set`).

A spec is a GitHub **issue**; each phase a **sub-issue** of it, its tasks a
task list in the body. GitHub stays a generated mirror: one-way, repo wins,
and a person's edit on GitHub is reported before the next push replaces it.

## Workflow state lives on a board

An issue is only open or closed. The states a spec moves through are the
options of a **Projects v2 single-select field** — `Status` by default — on a
board owned by `github.owner`. The board is **required**: an issue that is not
on it has no state at all, so every spec and phase issue is added to it as it
is minted. One board per repo.

The terminal buckets also close the issue itself, so the issue list agrees
with the board:

| Bucket | Board Status (default) | Issue |
|--------|------------------------|-------|
| `backlog` | Backlog | open |
| `in-progress` | In Progress | open |
| `complete` | Done | closed — `completed` |
| `cancelled` | Cancelled | closed — `not_planned` |

Option names must match the field's options exactly (case aside). An unknown
name is refused and the refusal lists the options the field does have.

**Map work states, not pipeline stages.** "On Test" is where a *release* is,
not where a spec's work is. Keep it on a second single-select (`Deployed`)
that releases set — never as a Status option, or a finished phase will read as
deployed.

## Fields

| Key | Default | Meaning |
|-----|---------|---------|
| `github.owner` | — | The account or org that owns the repo **and** the board. Keys the stored token. |
| `github.repo` | — | Where spec issues are created. |
| `github.project` | — | The board's **number**, from its URL (`…/projects/7` → `7`). |
| `github.statusField` | `Status` | The single-select carrying workflow state. |
| `github.labels.spec` / `.phase` | `spec` / `phase` | Labels that tell a spec issue from a phase. Empty string = no label. |
| `github.issueTypes.spec` / `.phase` | — | Issue type names. **Org-owned repos only** — naming one on a personal repo is refused by GitHub. |
| `states.<bucket>` | see table | Board Status option per lifecycle bucket. |
| `intake.label` | — | The label `/spec --from-issue` lists. |
| `intake.bugLabels` / `.hotfixLabels` | `["bug"]` / `[]` | Labels that route an adopted issue to `/spec-bug` / `/spec-hotfix`. |
| `auth.tokenEnv` | `GITHUB_TOKEN` | Env var holding the token; `GH_TOKEN` is read after it. |
| `apply.transport` | — | `api` or `mcp`; unset = API when a token resolves. |
| `sync.baseDir` | `specs/.core/github-base` | Last-pushed snapshots. Commit them. |
| `sync.fieldOwnership` | all `push` | Per-field ownership; `"none"` declines one (e.g. `assignee`). |

## The token

A **classic** personal access token with the `repo` and `project` scopes.
Fine-grained tokens are documented only for **org-owned** boards; on a
personal account's board use a classic one.

## Frontmatter it stamps

`github_identifier` (`#123`) and `github_url` on the overview,
`github_issue_id` on each phase file. Node ids are resolved at run time and
never written. A repo that moved from another tracker keeps its old stamps
(`linear_identifier`, …) untouched beside these.

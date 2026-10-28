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
| `releases.deployedField` | `Deployed` | The second single-select the release verbs set. |
| `releases.series` | `[]` | One entry per tag series: `{ tagPrefix, envs, npm }` — see below. |

## Releases — the mirror of what shipped

The `spec-sync release` verbs write a release onto GitHub and move its issues'
`Deployed` field: `create <tag> --stage <env>` mints a prerelease listing the
tickets the tag's range contains, `deployed <tag> <env>` sets the field on
every one of them, `complete <tag>` clears the prerelease flag. Every verb is a
dry run unless `--apply`. A series declares its envs in order:

```json
"releases": {
  "series": [
    { "tagPrefix": "myapp@",
      "envs": { "staged": "Staged", "published": "Published" },
      "npm": "@scope/myapp" }
  ]
}
```

**`reconcile` is the self-healing verb**, for the approvals that happen where
no verb runs — the npm website, a batched tag push that fired no workflow. It
asks the npm registry which versions of `npm` are live and repairs the mirror:

- A marked release whose version is live — **or contained in a newer live
  version of its series**, since that version carries its commits — moves to
  the series' **final** env and is completed. Ascending, and only the newest
  takes GitHub's "Latest".
- A pushed tag with **no release at all** is backfilled at the first env, then
  probed like the rest — bounded to tags newer than the series' newest
  release (the newest tag alone where the series has none), so old history is
  never flooded onto the releases page.
- **Absence is never failure**: a version the registry lacks is "not yet" and
  the release is kept; an unreachable registry, a 404 package, or a series
  with no `npm` key skips that series in one line and exits 0. Only a release
  listing that could not be read refuses.
- Only releases carrying the skitterspec marker are touched — a hand-made
  release is never read or written.

Run it hourly from a scheduled workflow (plus `workflow_dispatch` for an
instant run after an approval). The checkout needs `fetch-depth: 0` — tag
ranges are refused on a shallow clone — and the token must be a classic PAT
(`repo` + `project`) in a secret: the Actions `GITHUB_TOKEN` cannot write a
user-owned Projects board.

```yaml
on:
  schedule:
    - cron: '17 * * * *'
  workflow_dispatch:
permissions:
  contents: read
jobs:
  reconcile:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0
      # …install your toolchain…
      - env:
          GITHUB_TOKEN: ${{ secrets.YOUR_PAT_SECRET }}
        run: |
          if [ -z "$GITHUB_TOKEN" ]; then
            echo "::notice::no PAT secret — reconcile skipped"; exit 0
          fi
          skitterspec-github spec-sync release reconcile --apply
```

## The token

A **classic** personal access token with the `repo` and `project` scopes.
Fine-grained tokens are documented only for **org-owned** boards; on a
personal account's board use a classic one.

## Frontmatter it stamps

`github_identifier` (`#123`) and `github_url` on the overview,
`github_issue_id` on each phase file. Node ids are resolved at run time and
never written. A repo that moved from another tracker keeps its old stamps
(`linear_identifier`, …) untouched beside these.

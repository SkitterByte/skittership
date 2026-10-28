# Setting up GitHub sync (one-way)

The repo is the source of truth; GitHub is a generated mirror. A spec becomes a
GitHub **issue**, each phase a **sub-issue**, and a spec's lifecycle bucket a
**Status** on a Projects v2 board. Nothing is read back and merged: a person's
edit on GitHub is reported, then replaced by the next push.

What you need, all free on a personal account:

- the repo, on GitHub;
- a **Projects v2 board** owned by the same account — one per repo;
- a **classic** personal access token with the `repo` and `project` scopes.

Do the steps in order — each one is checked by the next.

## 1. Install the package

```
pnpm add -D @skitterbyte/skitterspec-github
pnpm exec skitterspec init --isolation
```

Install exactly one distribution: the base, or one superset. This one provides
both `skitterspec-github` and `skitterspec`.

## 2. Make the board

On GitHub: **Projects → New project → Board**, owned by the repo's owner. Note
its number from the URL (`…/projects/7` → `7`).

- The **Status** field it starts with is where a spec's state lives. Add
  `Backlog` and `Cancelled` options beside `Todo`, `In Progress` and `Done` —
  or map `backlog` to `Todo` in step 4.
- Under the board's **Workflows**, turn off *Item closed* and *Pull request
  merged* (both set Done): the engine sets Status itself, and a second writer
  is one the next push overrides.
- Optional, for releases: a second single-select field, **Deployed**, with
  options such as `Test`, `Demo`, `Prod` (or `Staged`, `Published` for an npm
  package). Keep release stages out of Status — otherwise a finished phase
  reads as deployed. Declare the matching `releases.series` in the config, and
  give each series its `npm` name so a scheduled
  `spec-sync release reconcile --apply` run can repair the mirror when an
  approval happens outside your pipeline — `github.config.md` → "Releases" has
  the semantics and a copy-paste workflow. The workflow's secret must be a
  classic PAT (`repo` + `project`): the Actions `GITHUB_TOKEN` cannot write a
  user-owned Projects board.

## 3. The token

Create a **classic** token at https://github.com/settings/tokens with the
`repo` and `project` scopes. Fine-grained tokens are documented only for
org-owned boards.

Then store it **yourself, in your own terminal** — never paste it into a chat:

```
pnpm exec skitterspec-github spec-sync credentials set --owner <owner>
# GitHub token for github.com/<owner> (classic, repo + project; hidden): ●●●●●●●●
```

An exported `GITHUB_TOKEN` or `GH_TOKEN` works instead and wins over the store.
`credentials status` shows which one is in use, as a fingerprint.

## 4. Configure — run `/spec-github-setup`

It reads the owner and repo off your remote, asks for the board number,
validates every bucket's Status option against the board, and writes
`specs/.core/github.config.json` through `spec-sync init-config`. By hand:

```
pnpm exec skitterspec-github spec-sync init-config \
  --owner <owner> --repo <repo> --project 7 [--state backlog=Todo]
```

**Commit the file.** Spec worktrees fork from commits, so an uncommitted config
is invisible in every one of them and sync reports itself off there.

## 5. Check — `spec-sync doctor`

```
pnpm exec skitterspec-github spec-sync doctor --check-remote
```

Every row names its own fix: the config, the token, its scopes (classic tokens
only — a fine-grained token's scopes cannot be read), the board's Status
options, and the labels.

## 6. Push a spec

`/spec` links a new spec as it writes it. For an existing one, `/spec-push`.
A repo moving from another tracker keeps its old stamps on finished specs; push
each backlog and in-progress spec to link it here.

## Release smoke checklist

Run against a throwaway repo and board before cutting a release of this
provider.

1. **Doctor** — every row ok, including Token scopes and Board states.
2. **States** — `spec-sync states` lists the options and every bucket row
   reads `ok`.
3. **Mint** — on a test spec with at least one phase and a task checklist:
   plan + apply. Expect a `spec`-labelled issue, one `phase`-labelled sub-issue
   per phase linked under it, all on the board with their Status, and the
   frontmatter stamped `#N`.
4. **Bucket move** — move the spec to `complete/` and push: Status `Done` **and**
   the issue closed as completed. Move it back: reopened, Status restored.
5. **Adopt + preserve** — hand-create an issue with a body, stamp it onto a
   spec, run `spec-sync preserve`, then push: the original survives as a
   comment, and a second `preserve` says already preserved.
6. **Verify** — save a read-back (`{ "issue": "<body>", "subIssues": { "<ref>":
   "<body>" } }`, keyed by the phase file's basename **without** `.md`) and run
   `spec-sync verify`: every body round-trips intact.
7. **Drift** — tick a task box on GitHub, then `spec-sync status --remote`
   reports the body edited; the next push replaces it and says so.
8. **Released** — over a range with `Refs: #N` trailers and an older
   `Refs: KEY-N` one: tickets listed, the old one counted as historical.
9. **Intake** — label an issue with `intake.label` (and one with a bug label):
   `spec-sync intake` lists both, routed to `/spec` and `/spec-bug`.

# `env.config.json` — per-spec isolation config

Opt-in config for per-spec isolation (git worktree + optional namespaced Docker
stack + host dev servers + a front-door proxy + an optional opener per
in-progress spec). Provisioning is folded into `/spec-start`, teardown into
`/spec-complete` · `/spec-cancel`, and traffic diversion is `/spec-connect`; the
`skitterspec spec-env <up|down|prune|dev|connect|integrate>` CLI is the engine
beneath them.

**Once this file is present, isolation is the default policy:** `/spec-start` gives
**every** in-progress spec its own git worktree automatically. Docker is a
**per- spec escalation** — a spec brings up a stack only when its
`> **Stack:**` header is `worktree + docker` (set at `/spec` when it touches
the DB / stateful services). A `worktree`-only spec takes no registry slot, no
port block, and no `.env`.

**Adopt it** with `skitterspec init --isolation` (or copy
`env.config.json.example` → `env.config.json` here) and edit the values. While
`env.config.json` is absent the feature is simply unused — every skill behaves
exactly as it does today.

The loader (`src/env/config.js` → `loadEnvConfig`) merges your file over the
frozen defaults below and returns `{ config, present }`; `present:false` means
no live `env.config.json` was found.

## Fields

```jsonc
{
  // Where sibling worktrees are created and how their dirs are named.
  // Where a spec's branch gets built.
  //
  //   "worktree"  (default) — every spec gets its own git worktree. Several
  //               specs run side by side and `main` stays free, at the cost of
  //               one terminal session per spec (`/spec-start` sets it up for you).
  //   "checkout"  — the branch is built in the primary checkout instead. One
  //               spec at a time, but no second session and no hand-off: the
  //               terminal you are already in follows the work.
  //
  // Pick it for how you work, not for what this repo contains — a project with
  // no dev servers may still want several specs in flight. An unrecognised
  // value falls back to "worktree" rather than erroring.
  //
  // Not to be confused with `seedFiles.mode`, which is "symlink" | "copy".
  "mode": "worktree",

  "worktree": {
    "root": "../{repo}-wt",   // dir that holds all spec worktrees; sibling of
                              // the primary checkout, never nested inside it.
    "folderPattern": "{slug}" // per-spec worktree dir name.
  },

  // Per-spec Docker stack. COMPOSE_PROJECT_NAME namespaces containers,
  // networks, and named volumes; PORT_OFFSET shifts the spec's port block.
  "docker": {
    // Master switch: "is Docker escalation available on this project?" — NOT
    // "always run Docker". true = specs MAY escalate (a spec still needs
    // `Stack: worktree + docker` to actually get a stack); the default stack is
    // worktree-only. false = every spec is worktree-only and the escalation is
    // hidden. (Was "always provision Docker" in the pre-Stack engine.)
    "enabled": true,
    "composeFile": "docker-compose.yml",
    "projectNamePattern": "{repoSlug}_{slug}", // → COMPOSE_PROJECT_NAME
    "portBase": 3000,          // first port of slot 0's block
    "portsPerSpec": 10,        // block width; slot n → portBase + n*portsPerSpec
    "envFile": ".env",         // written into the worktree
    "backupCommand": ""        // optional pre-teardown backup (e.g. pg_dump);
                              // empty = no backup, volumes dropped directly.
  },

  // Gitignored files seeded from the primary checkout into a fresh worktree by
  // `spec-env up`, right after `git worktree add` and BEFORE `setup` runs — so a
  // fresh linked worktree (which starts with none of the repo's gitignored files)
  // has the .env / local secret overrides / local config that setup steps and
  // git hooks depend on. Without this a step like `prisma generate` hard-fails in
  // the new worktree because .env (its datasource URL) isn't there.
  //   mode   "symlink" (default) points the worktree file at the main file, so it
  //          stays in sync; "copy" makes an independent copy.
  //   files  repo-relative paths to seed. A source absent in main is a printed
  //          no-op (not an error); a target that already exists is left untouched
  //          (idempotent — safe when `spec-env up` re-attaches an existing
  //          worktree). The main checkout is resolved robustly at run time via
  //          `git rev-parse --git-common-dir` — no hardcoded repo name or path.
  // Shorthand: `"seedFiles": [".env", …]` == `{ "mode": "symlink", "files": […] }`.
  // Seeded files are gitignored, so they never make the worktree "dirty" and
  // never block teardown; they vanish with the worktree at `spec-env down`.
  // [] (or absent) = seed nothing (current behaviour).
  "seedFiles": {
    "mode": "symlink",
    "files": [".env"]
  },

  // Bootstrap commands `spec-env up <spec>` runs IN the worktree, right after
  // `git worktree add` (before Docker/dev), on every provision including
  // re-attach — so a fresh worktree's dependencies exist and git hooks,
  // typechecks, builds and tests work immediately instead of failing on a
  // missing node_modules. An array, run in order; [] = none. Each string is a
  // shell command; {slug}/{branch}/{worktreePath}/{projectName}/{portOffset}
  // expand (the cwd is already the worktree, so {worktreePath} is usually
  // redundant). Example: ["pnpm install --frozen-lockfile"].
  "setup": [],

  // Host dev servers `spec-env dev up <spec>` starts on the spec's port block
  // (for apps that run via `pnpm dev` on the host, not inside the Docker stack).
  // An array so UI + API (or more) are supervised independently; [] = none.
  // Each entry:
  //   name       label used in logs/pid files (.spec-env/{logs,pids}/<spec>-<name>).
  //   command    the launch command, run detached in the worktree. {portVar} and
  //              {port} expand to the process's resolved port.
  //   portVar    env var the command reads for its port; injected into its env.
  //              Process i in the block gets portBase + slot*portsPerSpec + i.
  //   health     optional URL polled until it answers before reporting ready;
  //              {portVar}/{port} expand here too. Omit for no health gate.
  //   frontPort  optional canonical origin this process fronts (e.g. 3000 for the
  //              UI, 8080 for the API) — used by the proxy to route to it.
  "dev": [],

  // Front-door proxy for `spec-env connect <spec>` — a small bundled Node
  // reverse proxy (no external install) that exposes ONE connected spec's
  // frontPort dev servers on the canonical ports. Exclusive: one target at a
  // time. `connect main` stops it so the primary checkout owns the ports again.
  "proxy": {
    "enabled": true,        // false = the connect command is unavailable
    "host": "127.0.0.1"     // bind host for the canonical ports
  },

  // Optional, editor/terminal-agnostic opener — the FALLBACK for reaching a
  // worktree. `/spec-start` normally moves the session you typed into into the
  // worktree, and then there is nothing to open: it runs this only when it
  // could not switch in place (the session is already inside another worktree,
  // or the harness cannot move it). Run after provisioning and bootstrap, so
  // the session opens onto a tree that is ready to work in. The template is
  // expanded with {worktreePath}, {slug}, {branch}, {projectName},
  // {portOffset}.
  // Empty = nothing is opened (the path is just printed), which is how you turn
  // the auto-open off, and the right value unless you actually want a second
  // window on the fallback path. A non-interactive run skips it either way — an
  // opened window nobody is sitting at helps no one.
  // Examples: "code {worktreePath}", "tmux new-window -c {worktreePath}",
  // or a "warp://..." deeplink for Warp users.
  "open": {
    "command": ""
  },

  // Machine-local slot registry (spec → slot index). Resolved against the
  // primary checkout root, shared by all worktrees, gitignored.
  "registry": ".spec-env/registry.json",

  // Git branch naming, provider-neutral. `pattern` expands {type} and {slug}
  // (e.g. "feat/add-widget"). When a ticketing provider is linked and you want
  // tracker ids in branch names, use {identifier} in the pattern and point
  // `identifierField` at the 00-overview.md frontmatter field the provider
  // writes the id into — pushing that branch can then fire the tracker's
  // automation. Empty `identifierField` (or a spec missing that field) makes a
  // pattern with {identifier} fall back to {type}/{slug}.
  "branch": {
    "pattern": "{type}/{slug}",
    "identifierField": ""
  },

  // Paths that belong to a spec ALONGSIDE its own `specs/<bucket>/<name>/`
  // folder. `/spec-start` uses this to tell "the spec you just wrote, not yet
  // committed" apart from someone else's uncommitted work: if every dirty path
  // belongs to the spec being started it is committed for you, and if a single
  // path does not, the start is refused as before.
  //
  // Provider-neutral by design — the base engine must not know that any
  // particular tracker exists — so you declare the shape here. `{slug}` and
  // `{identifier}` expand exactly as in `branch.pattern` above, `{identifier}`
  // via `branch.identifierField`.
  //
  // A pattern using {identifier} matches NOTHING when no identifier resolves
  // (no `identifierField` set, or a spec never pushed to a tracker). That is
  // deliberate: the file it names then belongs to some other spec, and the safe
  // failure is a refusal you clear with /commit, not a stranger's file swept
  // into your commit. Default: none — a spec owns only its own folder.
  "spec": {
    "companionPaths": []
  },

  // Integration base branch — the branch specs fork from and land back onto
  // (used by the teardown "merged?" guard and, later, the integrate step).
  // Empty = auto-detect: origin/HEAD → main → master. Set it when your default
  // branch isn't discoverable (e.g. no remote) or differs (trunk, develop).
  "baseBranch": "",

  // Teardown safety. --force overrides both. refuseTeardownIfUnpushed only
  // blocks when the commits are ALSO unmerged into the base branch — a branch
  // already landed on base tears down (and its branch is deleted) without
  // --force, even with no remote.
  "guards": {
    "refuseTeardownIfDirty": true,
    "refuseTeardownIfUnpushed": true
  },

  // What teardown cleans up beyond this machine. `/spec-start` pushes the spec
  // branch when it provisions, so without this a completed spec leaves a merged
  // branch on the remote forever. `deleteRemoteBranch`:
  //   "prompt"  (default) — plan `git push <remote> --delete <branch>` in its own
  //             "confirm with the user first" section; /spec-complete and
  //             /spec-cancel ask before running it.
  //   "never"   — omit it; clean the remote up yourself.
  //   "always"  — fold it into `run these:` and never ask.
  // Only ever planned for a branch that has LANDED (merged into base, or captured
  // by a hotfix's deploy tag) and whose remote-tracking ref this clone can
  // actually see. Until a branch lands, the remote copy is its only backup, so
  // --force does NOT enable this. A branch pushed from another machine has no
  // local ref here and is simply missed — teardown under-cleans rather than
  // deleting something it cannot see. An unrecognised value means "prompt".
  "teardown": {
    "deleteRemoteBranch": "prompt"
  },

  // Live overlay (`spec-env live` / `/spec-live`): test a spec on the already-
  // running dev server by checking its branch out in the primary checkout.
  // `migrations` is a list of globs (`**`, `*`, `?`) marking migration files; a
  // branch that changes any of them is treated as STATEFUL and `live take`
  // refuses it (code-only v1 — use `/spec-connect` for those). Default: none.
  "live": {
    "migrations": []
  },

  // Hotfix landing (`spec-env hotfix land` / `/spec-complete` on a Type: Hotfix
  // spec). A hotfix forks from a release tag and lands by tag + cherry-pick, not
  // fast-forward. `bump` is the version-bump strategy for the new deploy tag (only
  // "patch" today: v33.16.4 -> v33.16.5). `cherryPickMain` also cherry-picks the
  // fix onto the base branch for the next release (default true). `targets` is an
  // optional default list of extra base tags to also patch (test/demo lines);
  // `--also <tag>` adds more at run time. Nothing is ever pushed — you push the
  // deploy tag to trigger CI/CD. Default: patch, main, none.
  "hotfix": {
    "bump": "patch",
    "cherryPickMain": true,
    "targets": []
  }
}
```

## Token expansion

- `{repo}` — primary checkout dir basename (e.g. `skitterspec`).
- `{repoSlug}` — `{repo}` lower-cased, non-alphanumerics collapsed to `-`
  (safe for a `COMPOSE_PROJECT_NAME`).
- `{slug}` — the spec slug (folder name minus its `feat-`/`bug-` prefix).

## Pruning orphaned test-DB volumes

`spec-env down` drops the finished spec's own Docker volume, but volumes leak
when that path is skipped — a declined/guard-aborted teardown, a manual
`git worktree remove`, or `--keep-volumes`. Over many worktrees these orphaned
DB volumes pile up and eat disk.

`skitterspec spec-env prune` reconciles the live volumes in the
`{repoSlug}_*` namespace against the specs that still have a **worktree** and
lists the orphans (volumes owned by no live spec) plus the `docker volume rm`
commands to remove them. It plans only — you run the printed commands — and it
frees any stale registry slot for a reaped spec.

- **Liveness = an existing worktree, not the registry** (the registry is what
  goes stale). A spec with a live worktree — in any bucket, including one checked
  out only on its branch — is always protected.
- **No backup.** Unlike `spec-env down`, prune does **not** run
  `backupCommand`: an orphan has no running DB to dump. Add `--older-than <days>`
  to only reap volumes older than a cutoff (volumes of unknown age are kept).
- `/spec-complete` and `/spec-cancel` run prune (confirm-first) as their last
  teardown step, so orphans get swept as specs finish. You can also run it by
  hand at any time to clear an existing backlog.

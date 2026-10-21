# `env.config.json` — per-spec isolation config

Opt-in config for per-spec isolation (git worktree + optional namespaced Docker
stack + host dev servers + a front-door proxy per in-progress spec).
Provisioning is folded into `/spec-start`, teardown into `/spec-complete` ·
`/spec-cancel`, traffic diversion is `/spec-connect`, and reading a spec's diff
is `/spec-diff`; the `skitterspec spec-env
<up|bootstrap|nospec|main|down|prune|dev|connect|integrate|hotfix|live|review|stage|status|resolve>` CLI is
the engine beneath them.

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
frozen defaults below and returns `{ config, present, unknown }`;
`present:false` means no live `env.config.json` was found.

**A key not listed below is ignored — and says so.** Every `spec-env` command
prints one advisory line per unrecognised key, top-level or nested:

```
spec-env: env.config.json — unknown key "docker.portbase" is ignored.
```

It is advisory in the strongest sense: the key is dropped exactly as it always
was, nothing refuses, and the exit status is unchanged. It exists because the
two things an unknown key can be — a deliberate forward-compat entry and a typo
— are indistinguishable from here, and only one of them is a mistake you would
want to hear about. A mis-typed `review.required` leaves the commit gate on and
a mis-typed `teardown.deleteRemoteBranch` reverts to `prompt`; before this, the
only signal either gave was that nothing happened.

A **known** key whose value is rejected — `mode: "Checkout"`,
`teardown.deleteRemoteBranch: "yes"` — is not reported here. Each of those falls
through to a documented conservative default; see the field notes below.

## Fields

```jsonc
{
  // Where sibling worktrees are created and how their dirs are named.
  // Where a spec's branch gets built.
  //
  //   "worktree"  (default) — every spec gets its own git worktree. Several
  //               specs run side by side and `main` stays free. `/spec-start`
  //               moves your session into the spec's worktree with a `cd`, so
  //               the terminal you are already in follows the work.
  //   "checkout"  — the branch is built in the primary checkout instead. One
  //               spec at a time, and nowhere else to stand: the work comes to
  //               your terminal rather than your terminal going to it.
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
    // Passed as `-f` to `docker compose` on up and down, but ONLY when the file
    // is actually there — a project whose file has a name docker finds by
    // itself keeps working untouched. It is also the signal that lets a spec
    // with no `Stack:` header inherit `enabled` above: the switch is a
    // project-wide default, the file is evidence there is a stack to bring up.
    // An explicit header is checked first and never consults it.
    "composeFile": "docker-compose.yml",
    "projectNamePattern": "{repoSlug}_{slug}", // → COMPOSE_PROJECT_NAME
    "portBase": 3000,          // first port of slot 0's block
    "portsPerSpec": 10,        // block width; slot n → portBase + n*portsPerSpec
    // Written into the worktree by `spec-env bootstrap`, and passed to compose
    // as `--env-file`. A Docker spec's worktree steps run in this order:
    // seedFiles, this env file
    // (COMPOSE_PROJECT_NAME and PORT_OFFSET appended only where missing, so a
    // value `setup` or you put there is kept), `setup`, then
    // `docker compose … up -d` — all from inside the worktree, so the stack
    // reads this spec's values and not the primary checkout's.
    // It must be a file of its OWN: if it is also in `seedFiles` as a symlink,
    // the write is refused rather than send this spec's port block into the
    // primary checkout's file. Name a different file here (".worktree.env")
    // and have your compose file read the values from it.
    "envFile": ".env",
    "backupCommand": ""        // optional pre-teardown backup (e.g. pg_dump);
                              // empty = no backup, volumes dropped directly.
  },

  // Gitignored files seeded from the primary checkout into a fresh worktree by
  // `spec-env bootstrap`, after `git worktree add` and BEFORE `setup` runs — so a
  // fresh linked worktree (which starts with none of the repo's gitignored files)
  // has the .env / local secret overrides / local config that setup steps and
  // git hooks depend on. Without this any setup step that reads .env — a schema
  // or client generator, a codegen pass — hard-fails in the new worktree
  // because the file it expects isn't there.
  //   mode   "symlink" (default) points the worktree file at the main file, so it
  //          stays in sync; "copy" makes an independent copy.
  //   files  repo-relative paths to seed. A source absent in main is a printed
  //          no-op (not an error); a target that already exists is left untouched
  //          (idempotent — safe to re-run `spec-env bootstrap` over an existing
  //          worktree). Seeding is done by the engine itself, never printed as
  //          shell, so no command line ever names one of these files.
  // Shorthand: `"seedFiles": [".env", …]` == `{ "mode": "symlink", "files": […] }`.
  // `.env` is an ILLUSTRATION, not an expectation — skitterspec never reads any
  // of these files, it only links or copies them. Name whatever your stack keeps
  // out of git: `appsettings.Development.json` or a user-secrets file, `.envrc`,
  // `local.settings.json`, `config/local.yml`.
  // Seeded files are gitignored, so they never make the worktree "dirty" and
  // never block teardown; they vanish with the worktree at `spec-env down`.
  // On a Docker project, do not seed `docker.envFile` as a symlink — the env
  // file step refuses to write through one (see `envFile` above).
  // [] (or absent) = seed nothing (current behaviour).
  "seedFiles": {
    "mode": "symlink",
    "files": [".env"]
  },

  // Bootstrap commands `spec-env bootstrap <spec>` runs IN the worktree, after
  // the seeds and the env file and before the stack, on every provision including
  // re-attach — so a fresh worktree's dependencies exist and git hooks,
  // typechecks, builds and tests work immediately instead of failing on a
  // missing node_modules. An array, run in order, stopping at the first that
  // exits non-zero; [] = none. Each string is a shell command; {slug}/{branch}/{worktreePath}/{projectName}/{portOffset}
  // expand (the cwd is already the worktree, so {worktreePath} is usually
  // redundant). Example: ["pnpm install --frozen-lockfile"].
  "setup": [],

  // Commands to run in the PRIMARY checkout after a land — the counterpart of
  // `setup`, for whatever landed code needs before the base branch is usable
  // locally (e.g. ["pnpm db:data-migration"] for imperative data migrations
  // your deploy runs and nothing runs on your dev DB). An array, run in order;
  // [] (or absent) = none, and every plan prints exactly what it always did.
  //   `spec-env integrate` prints them after the fast-forward (worktree and
  //   checkout mode), and also after "already landed" — a land on another
  //   machine leaves them pending here. `spec-env hotfix land` prints them
  //   after the cherry-pick onto the base branch, and not at all when
  //   `hotfix.cherryPickMain` is false, since the base gained nothing.
  // The engine only plans: /spec-complete, /spec-to-main and /no-spec run
  // them (a /spec documents-only land does not). They stop at the first
  // failure, report it as a caveat, and never undo the land or block
  // teardown. Literal strings — tokens are NOT expanded, because they run on
  // the base branch where a spec's {slug} or {portOffset} mean nothing.
  "afterLand": [],

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

  // What teardown cleans up beyond this machine. Nothing publishes a spec
  // branch for you, so a remote copy exists only because you pushed it by hand —
  // and without this a completed spec leaves that merged branch on the remote
  // forever. `deleteRemoteBranch`:
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
  },

  // Reading a spec's diff (`spec-env review`, `/spec-diff`).
  //
  // `reader` decides how the page's LOCATION IS WORDED. It no longer decides
  // the bind — `allowNetwork` does, see below — and it no longer decides which
  // tiers are offered, because every tier is now listed whatever it says.
  // WHAT THE SERVER
  // BINDS TO — and nothing else. It never decides whether to serve (`serve`
  // does) and never decides to PUBLISH. Three values:
  //   "local"  — you are at the machine holding the page; it binds 127.0.0.1.
  //   "remote" — you are not; it binds every interface so the page opens.
  //   "detect" — work it out (the default); cannot-tell binds 127.0.0.1.
  // An explicit "local"/"remote" is BELIEVED WITHOUT SNIFFING: you know where
  // you are reading, and no signal outranks being told. Detection is only the
  // default, and it has three outcomes rather than two — local, remote, and
  // unknown. Unknown behaves exactly as the tool did before any of this existed
  // (the file:// URL, no warning), because a wrong "local" prints a dead link
  // and a wrong "remote" warns at someone whose link works fine. An
  // unrecognised value falls through to "detect", so a typo cannot become a
  // confident answer. Default: detect.
  //
  // `servePort` is the port for `spec-env review serve`, which renders every
  // spec's diff per request on one local server. Two forms:
  //
  //   "auto" (the default) — derive it from this repo's path, as
  //     7700 + hash(realpath(repoRoot)) % 100. Two repos on one machine stop
  //     competing for one shared port without anyone configuring anything, and
  //     — the part that matters — THE SAME REPO GETS THE SAME PORT EVERY TIME.
  //     The derivation reads nothing on disk, so the port survives a restart, a
  //     reboot and a `--stop`, which is what lets a link handed out yesterday
  //     still resolve. A symlinked spelling of the tree resolves first, so one
  //     repo never lands on two ports.
  //   <a number> — pin it. An explicit number always wins, and pinning is what
  //     you do when you want a port you can memorise, or when two repos derive
  //     the same one.
  //
  // A derived port CAN still collide — a hundred slots is a small chance, not
  // no chance — and the server refuses rather than moving itself aside. The fix
  // it names is `servePort`, because that is what the next link is built from;
  // `--port` moves one run and leaves every link already handed out pointing at
  // the busy port. `spec-env review serve --status` prints the port and which
  // of the three chose it.
  //
  // An unrecognised value falls through to "auto", like every other typed key
  // here. Default: "auto".
  //
  // The server binds 127.0.0.1 unless `--host 0.0.0.0` is passed, which mints
  // an unguessable path token and prints the LAN URL including it — anyone
  // holding that URL can read every spec's diff while it runs.
  //
  // `serve` is whether a render stands the local server up at all:
  //   "always" — every render does (the default), so `local:` and `network:`
  //              are both http URLs the page can POST a verdict back to. The
  //              LAN address comes first with the rest listed under it, because
  //              the guess reads interface names and a VPN or an unusual
  //              adapter will fool it.
  //   "never"  — `local:` is a file:// URL instead. Note what that costs: a
  //              file:// page has no server to POST to, so its verdict buttons
  //              copy a command for you to paste rather than sending anything.
  // It replaced `serveOnRemote`, which gated serving on the reader — and so
  // handed a local machine a page it could read and not answer. A legacy
  // `serveOnRemote: false` is still read as `serve: "never"`.
  // Either way NOTHING IS PUBLISHED on a detection: a server is one process
  // ended by one flag, while a published page is one this tooling cannot
  // remove, so that half stays an explicit ask. Teardown names a server that
  // served the last spec, and `spec-env prune` reaps a pidfile whose process is
  // gone. Default: true.
  //
  // `allowNetwork` and `allowRemote` decide WHICH TIERS a render offers, and
  // they replaced the engine guessing where the reader was sitting. It guessed
  // for a while and got it wrong three separate ways in one day: a file:// page
  // on a session detected `unknown`, a LAN URL for a phone that had left the
  // network, and an address that changed underneath a reader mid-session. So
  // every tier is listed, labelled, and either a URL or the one command that
  // turns it on — and you pick the one that reaches you.
  //
  //   `allowNetwork` — whether the review server binds EVERY INTERFACE, so the
  //                    page opens on your phone, or loopback only. THIS IS WHAT
  //                    CHOOSES THE BIND; `reader` no longer does. Default: true,
  //                    which matches what the engine already did.
  //   `allowRemote`  — whether PUBLISHING is permitted for EVERY spec. It
  //                    permits it; it publishes nothing. Default: FALSE,
  //                    because a published page is one skitterspec cannot
  //                    delete, so it must never happen unasked. This is the
  //                    PROJECT DEFAULT: `/spec-remote-review` permits one spec
  //                    at a time, in a gitignored sidecar beside its page, and
  //                    never edits this file — `review allow remote --project`
  //                    is what does.
  //
  // `local` and `network` are two doors into ONE ROOM — the page POSTs to
  // `location.pathname`, so both reach the same server and the same waiting
  // verdict, and one wait covers both. `remote` is a second store: a verdict
  // pressed on a published page needs `/spec-reviewed`, because nothing pushes
  // from an artifact's store into a conversation.
  //
  // Both are toggled by `spec-env review allow <tier> --set [on|off]`, where an
  // empty value toggles — which is what `/spec-remote-review` runs. It writes
  // THIS FILE in the primary checkout, so it changes for everyone who pulls and
  // leaves that tree dirty; the engine says so when it does.
  //
  // `commitWith` names the skill a COMMITTING verdict hands off to. A review
  // page ends in a verdict — commit, commit & continue, request changes,
  // discuss — and the point of the first two is that the commit follows from
  // the reading rather than costing a separate decision. Skitterspec never
  // commits through a skill it vendored: `/commit` ships with skittership, a
  // different package, and a copy living here would fork it. Two shapes:
  //   "/commit"  — the default; hand off to skittership's commit skill.
  //   "<name>"   — any other skill your project installs.
  // With the named skill unavailable, the committing branch commits directly —
  // stage, typecheck, test, conventional message — and SAYS it took that path,
  // because a commit made under rules nobody configured must not read as one
  // made under /commit.
  //
  // THERE IS NO OFF SWITCH. `"none"` existed and was removed: it produced a
  // verdict that records itself and does nothing, which is the one thing a
  // review page must not offer — a review is the guard in front of an action.
  // Recording an approval for SOMEONE ELSE to act on is a separate mechanism,
  // not a value of this key. Default: "/commit".
  //
  // `required` decides whether a phase that has ended owes a verdict before its
  // work is committed or the next phase is built. The gate is armed when a
  // phase's page is rendered and cleared by exactly two things: a COMMITTING
  // verdict, or `spec-env review skip "<reason>"` — allowed, and on the record,
  // which is the whole difference between skipping and drifting.
  //   true   — the default. A review is the normal exit from a phase.
  //   false  — nothing is ever owed; `review gate` answers "cannot tell" and
  //            the commit hook (if installed) defers to it, so this one key
  //            turns the whole thing off.
  // Only a literal `false` opts out: a typo leaves a check that REFUSES in
  // place rather than quietly disabling it. Default: true.
  //
  // `reviewers` lists EXTERNAL CODE REVIEWERS whose findings render on the page
  // as CHECKS, beside (or instead of) a written review. Empty by default, and
  // `init` never writes one.
  //
  //   READ THIS BEFORE ADDING ONE. A reviewer is a command run in the spec's
  //   worktree, and every hosted one sends that worktree's diff to a third
  //   party. Nothing else in skitterspec leaves your machine — the page is a
  //   local file, the server binds your own network, and the diff never reaches
  //   a model. Configuring a reviewer changes that, deliberately and only
  //   because you asked. Every finding on the page is badged with the reviewer
  //   that produced it, so it stays visible where the code went.
  //
  // Two entry shapes, told apart by which key is present:
  //   { "use": "<adapter>" }
  //       A bundled adapter. The engine owns its command line and its parser,
  //       so this is the whole configuration. One ships today: "coderabbit",
  //       which drives `cr review --agent` (a free tier, rate-limited per
  //       hour; `cr auth login` first). A `use` this build does not have is
  //       reported on stderr and does not run.
  //       Its adapter also does the one thing a shell script cannot: it tells
  //       ITS OWN refusals — not authenticated, rate limited, no network —
  //       apart from a review that ran and found nothing.
  //   { "name": "<label>", "command": "<shell>", "format": "rdjsonl" }
  //       Bring your own. `name` is what the page badges findings with, and
  //       `command` is a shell line run with the worktree as its cwd.
  // Both take an optional `timeout` in seconds (default 180).
  //
  // `format` is the output contract, and today there is one: `rdjsonl` — one
  // JSON object per line, reviewdog's diagnostic shape:
  //   {"path":"src/a.js","range":{"start":{"line":12}},"severity":"ERROR","message":"…"}
  // A flat `"line": 12` is read too. Most linters already emit this, so a
  // project gets non-AI checks on the same page for free, and an adapter for
  // anything else is a twenty-line script that prints rdjsonl.
  //
  // `command` may carry `${scope}` (`working` | `branch`), `${base}`,
  // `${spec}` and `${worktree}`. `scope` matches the render's own two modes —
  // a phase-end render is `working` (uncommitted + untracked in the worktree)
  // and `--branch` is the whole spec against its base — so what the page shows
  // is what was reviewed. An unknown `${…}` is left verbatim rather than
  // blanked, so a typo shows up in the command that failed instead of silently
  // becoming an empty argument.
  //
  // `severity` maps to the page's levels: `ERROR` → `flag`, everything else →
  // `confirm`. Never `good` — that means "I read this and it is right", which
  // is a thing a person says.
  //
  // FINDINGS NEVER GATE A COMMIT. They are checks, and `judgeVerdict` refuses a
  // committing verdict only while a COMMENT is unresolved. A comment is
  // something a person asked for; twelve machine findings are not. Reply to one
  // on the page and that reply IS a comment — which does gate, because now
  // someone asked. There is deliberately no severity threshold that blocks:
  // that is the counting gate this whole design exists against, and it makes a
  // reviewer's bad day into a wall.
  //
  // A REVIEWER THAT COULD NOT RUN SAYS SO, rather than staying silent — the one
  // place `.claude/rules/negative-checks.md` inverts. Silence is normally the
  // safe branch; here a rate-limited or unauthenticated reviewer would render
  // identically to one that read the diff and found nothing, on the page a
  // commit decision is made from. So every configured reviewer gets a line:
  // `12 findings` · `clean` · `cached` · `did not run — <why>`. Nothing exits
  // non-zero and nothing refuses — a reviewer that could not run never blocks a
  // render, a verdict or a commit.
  //
  // They run in SEQUENCE, at the end of a phase and on demand (`/spec-diff
  // --reviewers`), and the results are cached against a hash of the diff — so
  // re-rendering unchanged work reuses them rather than spending another review
  // against an hourly limit. An entry that is neither shape is dropped and
  // REPORTED on stderr; it cannot be caught by the unknown-key check, because
  // this default is an array. Default: [].
  "review": {
    "reader": "detect",
    "servePort": "auto",
    "serve": "always",
    "commitWith": "/commit",
    "required": true,
    "reviewers": []
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

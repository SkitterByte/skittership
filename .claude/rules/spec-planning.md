# Spec Planning

Spec-driven development is driven by ten lifecycle skills (plus the
`/spec-connect`, `/spec-live` and `/spec-remote-review` **commands** when isolation is on) — use them rather than hand-rolling specs so the structure
and lifecycle stay consistent. Each sets a status on the spec header
(`> **Status:** …`):

| Skill | Purpose | Status | Folder |
|-------|---------|--------|--------|
| `/spec` | (Feature) Grill to a clear shared understanding, write a groomed spec in its own worktree, then land it on the verdict | `Ready` (or `Draft`) | `specs/backlog/` (on the base branch, by a fast-forward) |
| `/spec-bug` | (Bug) Reproduce with a failing test, capture spec, drive red→green | `In Progress` | `specs/in-progress/` |
| `/spec-hotfix` | (Hotfix) Fork a worktree from a release tag, red→green, land by tag + cherry-pick | `In Progress` | `specs/in-progress/` |
| `/no-spec` | Work that genuinely has no spec — its own branch, worktree, page and land. Writes no spec and moves nothing through the lifecycle | `—` | (none) |
| `/spec-review` | Re-validate a spec against the codebase; refresh stale parts | `—` | (unchanged) |
| `/spec-start` | Put a spec in flight — provision its branch, then build phase 1 | `In Progress` | `specs/in-progress/` |
| `/spec-next` | Build the next phase of the spec this session is in (re-run per phase) | `In Progress` (unchanged) | (unchanged) |
| `/spec-reviewed` | Pick up a review approved on the page — offered by its code, claimed on your word | (unchanged) | (unchanged) |
| `/spec-to-main` | Land the branch on the base (rebase + ff) **without** finishing — for running the work in CI / a shared env mid-spec; repeatable | `In Progress` (unchanged) | (unchanged) |
| `/spec-complete` | Verify all phases done + tests green; land + tear down | `Complete` | `specs/complete/` |
| `/spec-cancel` | Record progress, stamp a reason on the header; tear down | `Cancelled` | `specs/cancelled/` |
| `/spec-init` | Bootstrap/repair this workflow in a project (idempotent) | — | — |

**Skills vs commands.** The table above lists **skills** — Claude reads them and
exercises judgment. `/spec-connect`, `/spec-live` and `/spec-remote-review` are
instead **slash commands**
(`.claude/commands/`): each pre-executes one `skitterspec spec-env` verb and
relays its output, so there is no judgment to apply and no model turn spent
finding one. They are marked `disable-model-invocation`, meaning
**only you can run them** — a skill that wants one will tell you to type it
rather than invoking it.

**`/spec-remote-review`** is the newest and the smallest: it toggles whether
**this spec** may publish, and takes `on`/`off` when you would rather say which.
The permission is per worktree, kept in the gitignored review store, so the base
branch is never dirtied and no other spec gains it; `review.allowRemote` in the
committed config is the project default beneath it. Turned on beside a page
that already exists, it is the ask to publish that page and re-show the stack.
It exists because a render's `remote:` line has to name something a person can
act on, and `skitterspec spec-env review allow remote` is not what anyone
reconstructs from a page they are reading on a phone. Making the line
*clickable* was considered and rejected — the only clickable thing markdown has
is a URL, and a URL that acts when it is **fetched** is one a link previewer or
a prefetcher fires with nobody involved. It **permits** publishing; it publishes
nothing.

`/spec-reviewed` is a **skill** and **user-only**, and there the marking is not
convenience — it is the enforcement of `/spec-diff` step 0's rule that a waiting
review pass is never claimed unasked. Because the model cannot invoke this
skill, a pass named this way is only ever picked up because a person typed the
command, and typing it **is** the human signal. Prose alone did not hold that
line once already.

It is **no longer the only way in**, and the difference is worth stating
precisely. A phase that ends now *waits* on its page, and a pass arriving inside
that wait is claimed by the engine (`--claim-since`) without anyone typing
anything — scoped to the window, refusing when two arrive. `/spec-reviewed` is
what answers everything outside it: a pass sent when nobody was waiting, two
passes to choose between, and every harness with no file-watch to wait with.

**`/no-spec` is the one row that writes no spec**, and it is in the table
because it is the same lane: a branch, a worktree, a review page, a verdict, a
land. What it leaves out is the document, because mechanical work — a version
bump, a lockfile refresh, a rename — genuinely has none, and a one-phase spec
written for it is a document nobody reads. What it does **not** leave out is the
branch. Doing that work in the primary checkout leaves the base branch dirty for
every in-flight spec to replay over, and renders no page, so it is the one kind
of change that reaches the base branch unreviewed. It is model-invocable, which
matters: it is where Claude is sent when it would otherwise write on the base
branch. Beneath it, `skitterspec spec-env nospec <name>` records the branch —
and that record is what makes a name with nothing under `specs/**` resolvable by
`review`, `integrate`, `down` and a bare `resolve`.

**`/allow-main` is the fourth command.** It is user-only for a different reason
from the other three: `/spec-connect`, `/spec-live` and `/spec-remote-review`
are marked that way because there is no judgment to apply. This one is marked that
way because **Claude must not be able to lift a guard aimed at Claude.**

The guard is `.claude/hooks/main-guard.cjs`, a `PreToolUse` hook on the write
tools, and it refuses an `Edit` or a `Write` in the **primary checkout** while
it is on the **base branch**. `main` is where work lands, not where it happens:
work done there leaves the base branch dirty for every in-flight spec to replay
over, and renders no review page at all, so it is the one kind of change that
arrives unreviewed. It refuses the FIRST write rather than the commit, because
nothing has been written yet and the fix is one command — where a commit-time
gate fires once the work already exists in a checkout that cannot `switch -c`
out from under the other worktrees.

It fires only on a **positive signal** — isolation configured, the guard not
switched off, this directory IS the primary checkout, HEAD IS the base branch —
and every cannot-tell allows the write in silence: no repo, no config, a
worktree, an unresolvable base, a missing or crashed engine
(`.claude/rules/negative-checks.md`). `skitterspec spec-env main
<check|allow|status>` is the engine, and `guards.mainIsLandingZone` in
`env.config.json` turns it off for a project. It is
**on by default wherever isolation is configured**, matching the review gate.

There is **no allowlist**, and it is empty by construction rather than by
omission: `/spec` authors into its own worktree and `/no-spec` catches ad-hoc
work, so no legitimate writer to the base branch is left. `/spec-init` looks
like the exception and is not one — it bootstraps a repo with no
`env.config.json` yet, so the guard never fires there.

**Two exits, and they are not equal.** `/no-spec <name>` and `/spec-start
<name>` move the work, and Claude takes those on its own; `/allow-main` lifts
the guard, and only a person can type it. That asymmetry is the same line
`/spec-reviewed` draws, and `spec-planning.md` already records that prose alone
did not hold it once.

**`/spec-skip` is the fifth command**, and it is user-only for `/allow-main`'s
reason rather than the mild one: it lifts the review gate, which is a guard
aimed at Claude. It pre-executes `skitterspec spec-env review skip "<reason>"`
and relays it — the same exit that always existed, at an address a person will
actually type. The long form stays exactly as valid and is what the engine
prints; what changed is that a refusal now names something reachable, because a
gate whose exit nobody can find gets switched off wholesale instead of answered.

**It is not a `--force`, and one was asked for.** A reasonless lift reopens
precisely what the reason requirement closed: `none: additive, nothing to
revert` is a decision a reviewer can argue with, and silence is an oversight.
So a bare `/spec-skip` refuses and asks for a reason, and the two things that
discharge a phase's obligation are still a committing verdict and a recorded
skip — never a flag. Putting the flag on `/commit` was the other suggestion and
is worse: `/commit` belongs to skittership, which is why the gate is enforced
by a hook rather than by editing that skill.

**A refusal may OFFER its own exit, and that is a different thing again.**
Where the engine declares one, a skill relays the refusal and **then** offers it
— once per obligation, with the choice recorded, and answered by the operator
rather than by Claude. `.claude/rules/offered-unblocks.md` is the whole
contract. The three properties named there are what let a Claude-raised bypass
survive the rule above, where a reasonless `--force` did not: the operator
answers, the choice is on the record, and it is offered once. Remove any one and
the objection returns.

`/spec-to-main`, `/spec-status` and `/spec-sync` stay **skills** — each carries
real judgment (green tests before a land; an MCP fetch and a team-key check; ten
subcommands) — but they are marked user-only too, since nobody reaches them
except by typing them. Everything else in the table above stays model-invocable,
which is what lets `/spec-next` hand off to `/spec-push` as work progresses.

Status flow: `Ready → In Progress → Complete` (or `Cancelled` from any state).
`/spec` grills to a **Ready** spec directly — there is no separate grooming
command; it writes `Draft` only when open questions are deliberately left.
`/spec-bug` and `/spec-hotfix` are test-first and start straight in `In Progress`
(work begins immediately), so they skip Draft/Ready. `/spec-to-main` does **not**
move the spec through the flow at all — it lands the branch on the base branch
mid-spec (so the work can run in CI / a shared test env) while the spec stays
`In Progress` in `specs/in-progress/`; it's the intermediate, repeatable half of
`/spec-complete`'s landing, without the finalise-and-tear-down.

**Two workspace modes.** `specs/.core/env.config.json` → `mode` decides where a
spec's branch is built. **`worktree`** (the default) gives each spec its own
checkout — several specs at once and `main` left free. `/spec-start` builds the
branch there, **moves your session into it** with a plain `cd`, and then asks:
build phase 1 now? Say yes and it carries on into a bare `/spec-next`; say no and
you are already standing in the worktree, so `/spec-next` typed later does the
same thing. The primary checkout stays on the base branch throughout — the
session followed the spec, nothing was checked out anywhere.
**`checkout`** builds the branch in the primary checkout instead: one spec at a
time, nowhere else to stand, and the build always carries straight on.
The difference is how many specs can be in flight at once.
Pick it for how you work rather than for what the project contains — a repo with
no dev servers may still want several specs in flight. In `checkout` mode
`/spec-connect` and `/spec-live` do not apply and say so: both exist to reach
work that lives elsewhere, which is the gap that mode removes.

**Per-spec isolation (opt-in to adopt, then the default policy).** When a project
adopts isolation (`skitterspec init --isolation`, or `specs/.core/env.config.json`
present), `/spec-start` gives **every** in-progress spec its own git worktree
automatically — several specs run side by side without stashing or clashing, and
`main` stays free. Docker is a **per-spec escalation**: `/spec` records
`> **Stack:** worktree` (default) or `worktree + docker` when the spec touches the
DB / stateful services, and `/spec-start` brings up a namespaced stack only for the
latter. `/spec-start` also starts the project's host **dev servers** (`env.config`
→ `dev`) on the spec's ports; **`/spec-connect <name>`** then exposes that spec on
your canonical `localhost` ports so you can test it at the normal URL
(`/spec-connect main` hands them back). All housekeeping (the backlog→in-progress
move, header edits, the code) happens on the spec's branch in the worktree; `main`
changes only when it merges. Teardown is folded into `/spec-complete` ·
`/spec-cancel`. Beneath the skills, `skitterspec spec-env
<up|bootstrap|nospec|main|down|prune|dev|connect|integrate|hotfix|live|review|stage|status|resolve>` is the CLI
engine. `up` plans the fork;
**`bootstrap` then runs the worktree's own steps itself** — seeding the gitignored files, the env file, `setup`, the stack — so
the command a skill runs names no file, and a secrets hook that refuses any
`.env` path has nothing to refuse. **Omit the spec name anywhere and it uses the worktree you are standing in**,
else the sole provisioned spec — with no exceptions left: a bare
`/spec-connect` connects, and a bare `/spec-live` takes, where both once meant
`main`. Teardown drops
the finished spec's own test-DB volume; `spec-env prune` additionally reaps
**orphaned** volumes left by declined/aborted teardowns, so `/spec-complete` and
`/spec-cancel` also sweep orphans (confirm-first). A **hotfix** is the one
exception to "fork from `main`": `/spec-hotfix` forks the worktree from a release
tag and `/spec-complete` lands it via `spec-env hotfix land` (tag + cherry-pick),
not a fast-forward. Isolation is **orthogonal to lifecycle status** and inactive
when `env.config.json` is absent — every skill then behaves as it does today.

**Live overlay (`/spec-live`, a command) — the light way to test a spec.** `/spec-connect`
runs a spec's *own* dev stack and proxies the canonical ports to it (one stack per
spec). **Live overlay** instead reuses the one dev server you already have running:
`/spec-live <spec>` — or a bare `/spec-live`, which takes the spec you are
standing on — rebases the branch onto base, frees it from its worktree, and
checks it out **in the primary checkout**, so your running server hot-reloads the
feature at the normal URL — no second stack, no proxy. Bare only acts when there
is exactly one answer *and* the workbench is free; anything else prints the
status report rather than guessing. The branch checked out in
the primary checkout **is** the lock: exactly one spec is live at a time, and
`/spec-live main` hands the instance back (fixes you make while live commit
straight onto the branch; `/spec-complete` is live-aware and lands them). Rule of
thumb: **live overlay is the light default for *testing* a code-only spec** — it
is not how work gets started, and no lifecycle skill invokes it; it *refuses*
stateful ones (`Stack: worktree + docker`, or a branch touching migrations) — keep
`/spec-connect` + a Docker stack for those, and for genuinely parallel testing.
Beneath it, `skitterspec spec-env live <take|release|abort|status>` is the engine.

**Authoring a spec is work, so it happens off the base branch too (`/spec`).**
`main` is where work **lands**, not where it happens, and a spec document is no
exception. With isolation configured, `/spec` grills first — which puts nothing
on disk — then provisions the new spec's own worktree with
`spec-env up <name> --docs`, moves the session into it, and writes the spec
there. `--docs` skips the `setup` commands and Docker, so a tree to write
markdown in costs one `git worktree add`; `/spec-start` re-runs `up` without the
flag and the install happens then, at the first moment the tree holds code.

**The committing verdict is what puts it on the base branch.** Phase C2's page
offers `Commit & Start` and `Commit`, and **both** commit on the branch and then
`spec-env integrate` — rebase, fast-forward — so the base gains the spec as one
commit. That is not optional tidiness: `ls specs/backlog/` is how specs are
found, and a folder bucket is only the truth on the branch you are standing on,
so a spec left unlanded is invisible to everyone. They differ only in the
worktree: `Commit & Start` keeps it and carries into `/spec-start`, plain
`commit` tears it down, because a spec parked in the backlog should hold no
checkout.

**What this bought is the reason it changed.** The page waits for a verdict
without a timeout — deliberately, because a reader walking away from a diff is
the normal case — and while the spec was authored in the primary checkout that
wait held the base branch dirty for as long as it lasted, so a release could not
be cut through it. Now an unanswered spec sits on its own branch in its own
worktree, in nothing's way. Phase C2 still **arms nothing**: the gate asserts
that a phase which ended owes an answer, and a backlog spec owes no phase — and
walking away from it now costs nobody anything rather than leaving a mess
someone else has to work around.

With isolation **absent** none of this applies: there is no worktree to make and
no land to do, so `/spec` writes the folder where the session is standing,
exactly as it always did.

**Staging one spec and not another (`spec-env stage`).** A `git add specs/`
stages a *directory*, sweeping whatever else happens to be sitting in it into
this spec's commit, under this spec's ticket trailer.
`skitterspec spec-env stage [<spec>] [--json]` is how a skill asks instead of
guessing: it splits the uncommitted tree into the paths that are this spec's —
its folder in **any** bucket, so a tree mid-`git mv` is handled, plus each
`spec.companionPaths` entry the project declares — and the paths that are not.
It reads **the tree you are standing in**, which is the worktree inside one and
the primary checkout outside, and prints which. The `owned` half is the spec's
**documents**, never its code: a phase's own implementation is `foreign`, because
the commits this bounds are the lifecycle ones. Nothing here refuses, writes, or
exits non-zero — `foreign` is a list of paths to leave alone, not an accusation.

**And it stays load-bearing now that `/spec` authors in its own worktree**, even
though that tree holds one spec. It was once justified by several specs sharing
one `specs/` folder, and that justification is gone; what replaces it is smaller
and just as real. A project's `spec.companionPaths`, a hand-edited
`specs/.core/`, and a tracker snapshot all land in the same tree as the spec, and
only the spec's own documents belong under its authoring verdict. Where isolation
is absent the original reason applies unchanged.

**Naming the paths is necessary and not sufficient**, which is why every spec
commit is also pathspec-limited: `git add -- <paths>` **and**
`git commit -m "…" -- <paths>`. A checkout has one `.git/index` and every session
standing in it shares that index, so a bare `git commit` takes whatever another
session has already staged no matter how carefully this one staged its own. The
`add` is still needed — `git commit` cannot take a path git has never seen, which
is every brand-new spec folder — but it is the `--` on the **commit** that bounds
what lands. The two failures are different and the fix needs both halves.

**Reading a spec's diff (`/spec-diff`) — seeing the work, not running it.**
`/spec-connect` and `/spec-live` both exist to reach a *running app*.
**`/spec-diff`** answers the other question: what did this actually change? A
phase is built in its own worktree, so `git diff` in your terminal answers about
the base branch — and a 350-line diff read as terminal text is scrolling, not
review. The engine collects the worktree's changes with `git -C` and writes a
self-contained HTML page (`.spec-env/reviews/<spec>.html`, gitignored) with
whole-file context that folds away, a file tree, and new files included. You open
it locally, or publish it and read it on a phone.
**The diff never passes through the model**, so the page is free to produce
however large it is; the *written*
review — a short read plus `flag`/`confirm`/`good` notes — is the part that costs
tokens, and it is offered rather than assumed. It is a **skill**, model-invocable,
and it is gated on nothing: half a phase, a hand edit and a colleague's branch are
all ordinary inputs. `/spec-next` renders the page at the end of a phase and
offers the review; `skitterspec spec-env review <spec> [--branch]` is the engine.

**The page is not read-only — it takes a review pass back.** Tick `✓ accept` per
file as you read, write notes against a line or a whole file, answer the
questions a written review asked, then **end it in a decision** and hand it
back. Three buttons, each carrying its own verdict:
**`✓ Approve`** (commit it), **`↺ Request changes`** (work them now),
**`… Discuss first`** (report and talk). `/spec-diff` stores it (`--notes`),
plays back what it read, and routes on the verdict — `changes` **is** the
go-ahead, so it works the commented files immediately, while `discuss`, a
refused approval and a pass carrying no verdict at all report and wait, which
is what a bare paste has always done. Accepted files stay unopened either way.

**Two ways back, and both are ordinary.** A **served** page POSTs the pass to
its own URL; the engine holds it in a gitignored `.pending.json` beside the
notes sidecar and answers with a **six-digit code**. Read the code out and
`/spec-diff` claims it (`--claim`), merging exactly the pass that code names.
A `file://` page has no server to talk to — the File System Access API is
Chrome-only and absent on iOS Safari — so it copies to the clipboard and you
paste, exactly as before. The clipboard path is **not legacy**: it is the whole
story for a local reader.

The code is **not a secret** — it is printed on the page, and it cannot be a
gate against Claude either, because the store is a file Claude can read.

It was once true that a device reaching your page
**could not reach your conversation**, and that fact was the whole guard: a pass sat in the holding
area until you typed `/spec-reviewed`. It is no longer true, deliberately —
a phase that ends **waits** for its verdict, so the button you press on the page
is what carries the work on. What replaced the guard is two mechanisms and one
rule. The **serve token** — 48 bits of randomness in the URL path, minted per
server — decides who can POST at all. The **wait window** decides which pass may
be claimed without you naming it: the engine's `--claim-since` takes the one
pass that arrived *while this session was waiting*, acts on nothing when none
did, and refuses to choose when two did. And outside that window the rule stands
unchanged and absolute: **Claude never claims a pass it was not asked to**
(`/spec-diff` step 0, because nothing enforces it).

What you give up is real and worth naming: the page can now act. What you get is
the loop closing without anyone remembering a command — which is the failure the
old design traded it for.

What the code *does* is let you **tell two passes apart** — it is an address,
never a password. One waiting pass is claimed and acted on the moment you type
`/spec-reviewed`, with nothing read back: the round-trip verified *which* pass
in a design where the page pushed and the agent went looking, and that design is
gone. Two waiting is a refusal to guess — the one case where a stranger's pass
sits beside yours, and the one case where six digits are worth anyone's time.
Pasting the code (`/spec-reviewed 324199`) skips even that. A pass you disown is `--drop <code>`; left there it is reported on every
render until you stop reading the line.

A code that matches nothing refuses, **names nothing**, and never falls back to
"the only one" — that fallback is precisely what would let an unread pass
through. Claiming **consumes**: a code works once. A second pass from the same
page render supersedes the first, so the code on screen is always the pass on
screen; passes from different renders stand alongside each other.

**And a claimed pass never enters the model's context.** The engine holds it,
merges it, and reports the counts — six digits is what reaches Claude, where a
pasted blob costs context in proportion to how much you wrote. That is the same
rule the diff already follows, applied to the one place it used to break. What it did comes back as a **resolution** (`--resolve`),
so the next render shows each note struck through with a one-line account and you
verify the fix instead of trusting it. An accept is keyed to the file's
**content hash**, so it survives the commit that ends the phase and lapses by
itself when that file changes again — announced as `accepted earlier — changed since`, never
silently. All of it lives beside the page in gitignored `.spec-env/`, and
**the marks are information, never a gate**: nothing counts them and nothing
refuses on them.

**A second opinion, from something that did not write the code (`review.reviewers`).**
The page can also carry findings from code reviewers
that run from a CLI — CodeRabbit's has a free tier, PR-Agent and Kodus are
self-hosted — and they arrive as **checks**, the same shape a written review
uses. `/spec-next` runs them once per phase before the render, so the page is
populated when it is opened; `/spec-diff --reviewers` is the opt-in mid-phase
run, and a bare `/spec-diff` never spends one. Results are cached against a hash
of the diff, so re-reading unchanged work costs nothing.

**They inform; they never gate.** A check is not a comment, so a page carrying
twenty findings still offers `Commit` — and a reader who replies to one creates
a comment, which does gate, because then a person has asked for something. There
is deliberately no severity threshold that blocks: that is the counting gate
this whole design exists against, wearing a vendor's name.

**And a reviewer that could not run says so**, which is the one place
`.claude/rules/negative-checks.md` inverts. Silence is normally the safe branch;
here a rate-limited or unauthenticated reviewer would render identically to one
that read the diff and approved of it, on the page a commit decision is made
from. So each gets a line — `12 findings` · `clean` · `did not run — <why>` —
and none of it ever refuses a render, a verdict or a commit.

The list is **empty by default** and `init` never writes one: configuring a
hosted reviewer sends the worktree's diff to a third party, which is a real
change for a tool that otherwise touches nothing outside `.spec-env/`. Every
finding on the page is badged with the reviewer that produced it. `env.config.md`
carries the field reference.

**The verdict is chosen, never derived.** A verdict is one person's conclusion,
sent once per pass; a counting gate is a refusal computed from how many boxes
are ticked, and it stays forbidden. The one refusal here is not a count of
ticks: **committing** is unavailable while any **comment** is unresolved,
because you asked for something and it therefore cannot also be fine. Files you
never ticked block nothing — an unticked file is something you said nothing
about, and requiring every one of them would be the tally this design exists to
avoid.

**The gate — a phase that ended owes an answer.** That is the second refusal,
and it is a different kind: not a count, and not about the marks at all.
`/spec-next` **arms** it when a phase ends and renders its page, and exactly two
things clear it — a **committing verdict**, or
`skitterspec spec-env review skip "<reason>"`. Until one of them happens,
`/spec-next` refuses to build the next phase and (where the hook is installed)
`git commit` refuses in that worktree. `skitterspec spec-env review gate
[--check] [--json]` is what both ask.

**The hook is the half that cannot be talked past.** `skitterspec init` and
`skitterspec update` install `.claude/hooks/review-gate.cjs` and register it in
the project's committed `.claude/settings.json`, so a `git commit` is refused by
the harness rather than by prose — which is what covers a bare `git commit`, a chained command, and
skittership's own `/commit` without skitterspec ever editing it. It decides
nothing itself: it hands the command line to
`spec-env review gate --check --for-command` and turns one exit status into an
answer. It refuses only where the commit is running
**inside that spec's own worktree** — a commit on the base branch, or in
another spec's tree, is not this obligation's business — and it fails **open** on everything else: no engine, an
unreadable payload, a crash, a timeout, a repo with no isolation.

Three things keep it a push rather than a wall. It is armed
**only by a phase ending**, so reading your own half-finished work mid-phase
owes nothing.
It has an **exit that is always one command**, and one of them is
*"I am moving on"* — with a reason, because `none: additive, nothing to revert` is a decision
a reviewer can argue with while silence is an oversight. And it accuses
**only on a positive signal**: an unreadable sidecar, a project that set
`review.required: false`, a spec the engine could not resolve — every
cannot-tell exits 0 and says nothing (`.claude/rules/negative-checks.md`).

It is on by default wherever isolation is configured. That is the point: the
push toward reading the diff is the normal path, and stepping off it is the
thing you have to do deliberately.

**The verdict names the action**, and that is why it is `commit` rather than
`approve`: a review is the guard in front of an action, and an approval that
only recorded itself was the one control on the page that did not describe what
it does. Both committing verdicts hand off to the project's own commit skill
(`review.commitWith` in `env.config.json`, `/commit` by default) — skitterspec
never vendors one, because `/commit` belongs to skittership.
**There is no off switch**: `"none"` existed and was removed, since it produced
exactly the record-and-do-nothing verdict this design is against.
`Commit & Continue` then runs `/spec-next` and **stops there** — it never
completes, lands or tears anything down.

A verdict is **consumed**, not stored: a commit verdict is spent by the commit
and a changes one by the work, so neither can go stale and later act on
something nobody read. What survives is a one-line outcome log, shown on the
next render as history.

**One ending, every skill (`.claude/rules/spec-reports.md`).** Every skill in
the table above finishes with the same block — a verdict, then a table of only
the fields that skill declares — and says nothing while it runs beyond a
question it cannot answer itself or a failure at the moment it happens. The
shape is defined once in that rule; each skill's `## Report` section names only
its verdicts and its fields.

✅ **Phase 2 built** — `feat-orders`, 2 of 4

| | |
|---|---|
| **Tracker** | [ABC-88](https://example.invalid/ABC-88) · `feat-orders` · phase 2 moved |
| **Branch** | `spec/feat-orders` · 3 commits, clean |
| **Built** | POST /orders handler, orders schema |
| **Tests** | 128 passed · dotnet test |
| **Review** | 7 files, +212 −18 · **local** [http://127.0.0.1:7760/…](http://127.0.0.1:7760/…) · **network** [http://192.168.0.136:7760/…](http://192.168.0.136:7760/…) · **remote** off |
| **Follow-ups** | none |
| **Next** | `/spec-next` → phase 3 (Auth) |

Four verdicts, and the last two are different facts about the repo: `✅` done ·
`⚠️` done with caveats · `❌` failed part-way, so there is a mess to clear ·
`⏸` refused before acting, so nothing changed.
**A refusal emits the block too** — "nothing happened" is a reported outcome
rather than an absent one.
`Follow-ups` is always present, because a recorded `none` is a decision where a
missing line is an oversight. And the block covers **that run only**: what else
is in flight is another question, and volunteering it here leaves the reader
unable to tell what followed from the run they just watched.

**Ticketing-provider sync (opt-in, a separate package).** The base is
tracker-free: it knows nothing about any specific ticketing system. A
ticketing provider is installed as its own distribution that plugs into named
**seams** in the shared skills and fulfils a skill-name + CLI contract.

Part of that contract is the **binary name**: the shipped `/spec-connect` and
`/spec-live` commands invoke `skitterspec`, so a superset that replaces the base
must expose that name too, alongside whatever it calls itself — one entry point
under two names. A distribution shipping only its own name leaves those commands
failing with `command not found`, which reads as a broken install rather than a
missing alias.
Sync is **one-way**: the repo is the source of truth and the tracker is a
**generated mirror**. It ships `/spec-push` (repo→tracker; computes a create/update plan
against a committed last-pushed snapshot and applies it) and `/spec-status`
(read-only drift report — what would push, and whether the tracker's
workflow-state drifted), backed by a `spec-sync` CLI. There is no content pull —
the tracker is never read back or merged.

**One-way means the repo wins, and it now wins *loudly*.** Those are different
claims and only the first was ever in doubt. A ticket's description is generated
from the spec, so a person editing it there is writing something the next push
replaces — which is correct, and which used to happen in silence. The engine now
compares a hash of what the tracker holds against a hash of what the repo last
sent, and says *that* it changed and where to read it.
It **reports and never refuses**: only a person can tell a typo fix from a
paragraph worth keeping.

**This is still not a pull.** Nothing read is merged, written to a spec, or fed
into the projection, and the text never enters the conversation — the comparison
is hashes, and the output is one line for a human. It is the same thing
`compareStored` has always done for a different question.

**And adoption no longer costs the reporter their words.** When a provider
adopts an existing ticket — one a PM or colleague filed — the linking push
replaces its description with the spec. Before that happens the original is
posted back onto the ticket as a **comment**: a surface one-way sync never
touches, so no later push can clobber it. Where a provider supports it, this is
automatic and has an opt-out. See the provider's own docs.

A provider may also ship a **read-only listing** of what the tracker holds. That
is not a pull: nothing is merged back and no spec file is written. It exists
because the folder buckets are only the truth *on the branch you are standing
on* — `/spec-start` moves a spec to
`specs/in-progress/` on that spec's own branch, so on the base branch an
in-flight spec still reads `backlog` and a teammate's unlanded spec is not on
disk at all. The tracker knows both, and each row carries the spec's folder name
so `/spec-start <name>` is a copy-paste away. See the provider's own docs for
what it calls the command.

A provider may also mirror **who is building a spec**, as one more field the repo
owns. Where it does, `/spec-start` records the developer and the tracker's ticket
is assigned to them, the assignment is released when the spec completes, and
`/spec-claim` moves ownership mid-flight — take it, hand it back, or hand it to a
teammate. Like everything else here it is opt-in and one-way: the spec file is
the record, and the ticket is the mirror. See the provider's own docs for how to
turn it on.

**Every skill that moves a spec through the lifecycle carries a seam**, so the
mirror keeps up without anyone remembering to push: `/spec`, `/spec-bug` and
`/spec-hotfix` link the spec they create; `/spec-next` refreshes it as work starts;
`/spec-complete`, `/spec-cancel` and `/spec-review` refresh it after they change
it. `/spec-to-main` and `/spec-live` carry none — they change no status.
With no provider installed the seams are empty and every skill behaves as a plain
filesystem workflow. See the provider package's own docs for its config and field
reference.

**Release gating (opt-in, config-gated).** With
`specs/.core/gating.config.json` present, every spec `/spec`, `/spec-bug` and
`/spec-hotfix` write carries a `> **Gating:**` header recording one decision:
does this ship behind a feature flag, or land live? The value is a **flag name**,
or **`none: <one-line reason>`** — and the reason half is the load-bearing part,
because `none: additive, nothing to revert` is a decision a reviewer can argue
with while a bare `none` is a shrug and a missing line is an oversight.

Skitterspec bakes in **the offer, never the mechanism**: it asks, cites the
project's own doc (`guidance` in that config), and records the answer. It never
reads your flag code. `skitterspec gating check` reports specs with no decision
and **always exits 0** — it reads only `backlog/` and `in-progress/`, so specs
finished before you adopted gating are out of range by construction. With the
config absent nothing appears at all: no question, no header, no check.

## Project conventions

The spec skills tell you to run "your project's typecheck and test commands" and
to "honour project conventions". Here they are for this project:

- **Typecheck command:** none — this is plain CommonJS JavaScript with no
  TypeScript and no build step. Skip the typecheck step entirely; do not
  substitute another command for it.
- **Test command:** `pnpm test` (i.e. `node --test`). Single file:
  `node --test test/<name>.test.js`. This repo uses pnpm — install with
  `pnpm install`, never `npm install` (there is no `package-lock.json`).
- **Lint/format:** none — no linter or formatter is configured. Match the
  surrounding style by hand.
- **Other rules specs must honour:**
  [`.claude/rules/commit-messages.md`](commit-messages.md) — the Conventional
  Commit grammar, length limits, and the `Release-Note:` footer this repo's own
  release tooling reads. Also
  [`.claude/rules/negative-checks.md`](negative-checks.md).

## Spec types — Feature, Bug, Hotfix

Every spec is one of three types, recorded **both** in the header and the filename:

- **Header field:** `> **Type:** Feature`, `> **Type:** Bug`, or
  `> **Type:** Hotfix` (authoritative, greppable:
  `grep -rl 'Type:.*Hotfix' specs/`).
- **Filename prefix:** `feat-<name>` for features, `bug-<name>` for bugs,
  `hotfix-<name>` for hotfixes (visible in listings; glob-safe — never use
  `[BUG]`/`[FEATURE]` brackets).

A **Hotfix** is a Bug fixed against a **released tag** rather than `main`: it
carries an extra `> **Base version:** <tag>` header, forks its worktree from that
tag, and lands by tagging a new patch + cherry-picking onto `main` (never a
fast-forward merge). `/spec-live` refuses a hotfix — test it with `/spec-connect`.

All three types share the same lifecycle folders below — type is orthogonal to
status.

## Header fields & State log (audit trail)

Every spec header carries:

- `> **Name:**` — the spec's folder name (`feat-`/`bug-`/`hotfix-<kebab-name>`).
  It's the handle you pass to `/spec-start` and the other lifecycle skills, surfaced
  in the header so it's copy-pasteable without digging for the folder name.
- `> **Author:**` — who created the spec (set at `/spec` / `/spec-bug`, defaults
  to `git config user.name`).
- `> **Developer:**` — who implements it (`—` until `/spec-start` starts work, then
  set to `git config user.name`; `/spec-bug` sets it immediately).
- `> **Gating:**` — the release-gating decision,
  **only when `specs/.core/gating.config.json` exists**: a flag name, or
  `none: <one-line reason>`. Absent entirely in a project that has not adopted
  gating.

Every spec also has a **State log** table — the audit trail of folder/status
transitions. Each lifecycle skill appends exactly one row when it changes state:

```
## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-01-01 | Draft | backlog | Jane Dev |
| 2026-01-02 | In Progress | in-progress | Jane Dev |
```

Keep the **State log** (state transitions) separate from the **Changelog**
(decisions and course-corrections) — state moves go in the table, not the
changelog.

When asked for a plan, implementation strategy, or feature breakdown:

1. Create or update a spec under `specs/` — never plan only in chat.
2. Reach a clear shared understanding of the requirement AND the proposed
   solution before writing (the `/spec` skill grills for this).
3. Use markdown checkboxes `- [ ]` for tasks, `- [x]` when done.
4. Organise work into phased sections with short goal descriptions.
5. Tasks must be granular enough to complete in one coding session.
6. Every phase ends with creating and running tests — a phase is not done until
   its tests are green (run the project's typecheck + test commands above).
7. Keep specs **as concise as possible**.
8. Record decisions and course-corrections in the spec's **Changelog** section.

## Lifecycle folders

```
specs/backlog/       Ready (or Draft) specs (/spec)
specs/in-progress/   under active implementation (/spec-start, /spec-bug)
specs/complete/      finished (/spec-complete)
specs/cancelled/     abandoned, with a reason on the header (/spec-cancel)
specs/.core/         project rules — ALWAYS APPLY, never moved
```

Every spec is a **folder** `specs/<bucket>/<name>/` — never a bare file, even for
simple changes. Inside it:

- `00-overview.md` is the entry point / dashboard: header, Problem, Decisions,
  Solution overview, the **Impact map** (a `Surface | Change | Detail` table
  naming the concrete surfaces the spec touches — endpoints, schemas, DB tables,
  domain objects, routes, business rules — as the scannable blast radius), the
  **phase index** (a table linking to each phase file with its status), Open
  questions, State log, Changelog. **No per-phase task lists live here.**
- **One file per phase** — `01-<phase-slug>.md`, `02-<phase-slug>.md`, … in
  execution order. Each holds that phase's goal, its task checkboxes (tests
  included), and any phase-specific notes. Even a single-phase spec gets `01-….md`
  — so each phase is easy to open and work on its own.

Keep the index and the phase files in sync (`⬜`/`🔄`/`✅`). Legacy specs may be a
bare `<name>.md`, or a `00-overview.md` with inline phases — the skills read
those, but new specs always use the folder + phase-file form.

## Finding specs

The **folder buckets are the source of truth** — a spec's bucket is its status.
To see the backlog, list `specs/backlog/`; for the latest completed specs, use
`git log`/mtime on `specs/complete/` or each spec's dated **State log**. Live
status also lives in the tracker when a ticketing provider is linked. (There are
no `00-index.md` summary files — the folder tree, headers, and State logs are
queried directly.)

## Rules

- If a spec already exists, update it — don't rewrite from scratch.
- Preserve completed `[x]` tasks.
- Add new tasks to the appropriate phase.
- Never delete historical notes.
- The spec file is the single source of truth for implementation progress.
- Move specs between buckets with `git mv` to preserve history.
- Never let inline emphasis or a link cross a hard line break — keep a whole
  `**bold**`, `*italic*`, or `[text](url)` on one line (let it overflow the wrap
  column rather than splitting it). Many round-tripping editors mangle a
  `**`/`*`/link span that straddles a newline, so clean source avoids the churn.

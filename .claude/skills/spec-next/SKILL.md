---
name: spec-next
description: Build the next unfinished phase of the spec in flight for this session — pre-flight, implement with tests, record progress and refresh the tracker. Refuses when no spec is in flight rather than guessing one, and builds wherever that spec resolves rather than wherever the session happens to stand. Use when the user says "/spec-next", "build the next phase", "continue the spec", or "carry on with this spec".
---

# /spec-next — build the next phase of the spec in flight

> Stay silent while this runs — speak only to ask something you cannot answer
> yourself, or to report a failure at the moment it happens. Read
> `.claude/rules/spec-reports.md` before reporting; it defines the block this
> skill ends with.

It assumes the workbench is already set up: a spec is **in flight** on this
checkout, and this skill implements its next unfinished phase. Putting a spec in
flight — provisioning, moving it to `in-progress`, getting its branch here — is
`/spec-start`'s job. Re-run this per phase until the spec is done, then
`/spec-complete`.

## 1. Identify the spec in flight

**`--worktree <path>` answers before anything else.** When the invocation names a
worktree, that is the spec to build and that is where it is built — cwd is not
consulted. It is how `/spec-start` carries on into phase 1 without moving your
session, and you can type it yourself.

**This is not a loosening of the refusal below.** That refusal exists against
*guessing* which spec to build, and a path someone typed is not a guess. A bare
`/spec-next` still refuses exactly as it does today.

**Validate the path before writing a line into it.** Run the resolver *from* the
path, so the answer comes from where you are about to write:

```
cd "<path>" && skitterspec spec-env resolve
```

Check the `worktree:` line it prints is that same path. If it is not — or the
command reports that isolation is not enabled — refuse and stop, naming what you
were given. A path that is not a provisioned worktree must never become a place
to write code.
**Read the output, not the exit status** — it exits 0 even when it
cannot resolve anything.

**Not `--dir <path>`.** That flag sets the **repo root**, not the worktree to
resolve from, so it answers a different question: on a repo with two or more
worktrees it refuses with *"no spec given, and N specs have worktrees"* and
validates nothing at all. The `cd` form is what makes the path itself the
evidence.

Otherwise resolve **in this order**, and stop at the first that answers:

1. **The live spec of this checkout** — run
   `skitterspec spec-env live status` and read its `live:` line. `live: yes`
   names the spec whose branch is checked out here; that is the one to build.
2. **The worktree you are standing in** — if this session's cwd is inside a
   spec's worktree, that spec is in flight *for this session*. This is the
   manual-parallel path: several specs may be provisioned, and a terminal tab
   opened in one is its own workbench.
3. **The current branch, in `checkout` mode** — no worktrees exist, so the
   branch the checkout is on names the spec.
4. **The only spec provisioned in this repo** — ask the engine, with no spec
   named, from wherever you happen to be standing:

   ```
   skitterspec spec-env resolve
   ```

   Take its `spec:` line **only when it names exactly one spec**.

   This is the **durable** rung, and that is the whole reason it exists. Rungs 1
   to 3 all read *session* state, and session state does not survive a `/clear`,
   a new terminal tab, or coming back tomorrow — while the provisioned worktree
   they are each a proxy for is **on disk** and survives all three. `/spec-start`
   does leave the session standing in the worktree and that `cd` is real; what it
   is not is durable. Without this rung, a repo holding exactly one answer sends
   the operator away to re-supply something it already knew.

   It is also the resolution every other bare command in this workflow already
   uses — the worktree you are standing in, else the sole provisioned spec — so
   this rung is what stops `/spec-next` being a silent exception to a rule
   `.claude/rules/spec-planning.md` states has none left.

   **Say which spec you resolved and how**, before writing a line of it:
   *"not standing in a worktree — `<spec>` is the only spec provisioned"*. Rungs
   1 to 3 are self-evident to whoever typed the command; this one is not, and
   the operator cannot see from where they sit what you picked.

   **Several worktrees stay a refusal.** The engine names them and resolves
   nothing — exactly the ambiguity the refusal below exists for. Relay its list
   unchanged and stop; never pick from it.

   WHAT WOULD FOOL THIS: a worktree left behind by a declined teardown is still
   a worktree, so a finished spec can go on counting as provisioned. That widens
   the candidate set, so the failure it produces is an extra candidate — an
   ambiguity the engine refuses on — and never a wrong spec built. It cannot
   manufacture an *absence*, which is why the absence below is still worth
   refusing on.

**If none answers, refuse and stop:**
`no spec in flight — run /spec-start <name> to start one`.

That now answers a real absence — no worktree anywhere, the engine included —
rather than a session that merely lost track of where it was standing.

**Never fall back to the spec "in context".** A spec discussed in conversation
is not a spec in flight, and this skill writes real code: building the wrong
spec's phase produces commits on a branch nobody asked for. The refusal is
cheap; the mistake is not.

**Rung 4 is not that fallback wearing a hat.** A provisioned worktree is a
record that someone ran `/spec-start`: it is on disk, the engine reads it, and it
either names one spec or refuses. A spec named in conversation is a guess about
intent with nothing underneath it, and no number of them ever resolves to one.

A **name argument** is accepted, but it must *match* the spec in flight — it
narrows a re-run, it does not select a different spec. A mismatch refuses,
naming both.

## 2. Pre-flight — the last phase is committed, and was answered

Before writing any code for this phase, get the workspace clean:

- **Confirm the last-worked phase is committed.** Run `git status` and
  `git log --oneline -5`. The most recently *implemented* phase (not necessarily
  the numerically previous one) should already be committed. If prior-phase work
  is still uncommitted, **stop and suggest committing it first** (e.g. via
  `/commit`) so each phase lands as its own reviewable commit — don't build the
  next phase on top of an uncommitted one. (Skip if this is the first phase —
  there's nothing prior to commit.)

- **Confirm the last phase's review was answered.** Ask the engine, never the
  sidecar:

  ```
  skitterspec spec-env review gate <spec> --json
  ```

  `state: "armed"` means a phase ended, its page was rendered, and nobody has
  said what they concluded. **Refuse, with the `⏸` block**, and name the three
  ways out in the `Next` row: read the page and send a verdict, type
  `/spec-reviewed` if one is already waiting, or
  `skitterspec spec-env review skip "<reason>"` to move on with the reason on
  the record.

  `state: "clear"` carries on.
  **`state: "unknown"` also carries on, in silence** — it is the project opting out, a sidecar that could not be read, or
  a spec the engine could not resolve, and none of those is evidence that
  anything is owed (`.claude/rules/negative-checks.md`). Do not mention it: a
  line about a gate nobody armed is an accusation against a healthy repo.

  **It may also declare the way out.** An `armed` answer can carry an `offer`,
  and where it does, relay the refusal and **then** offer it — once — exactly as
  `.claude/rules/offered-unblocks.md` describes, spending it with
  `skitterspec spec-env review gate <spec> --offered` as you raise it. Where
  there is no `offer`, the three exits in the `Next` row are the whole answer.

  **This refusal counts nothing.** It is not a tally of ticked boxes — those
  still gate nothing and still are not counted. It asserts one thing: a phase
  that ended has an answer. And the exit is always **one command**, one of them
  being *"I am moving on"*, which is what keeps this a push rather than a wall —
  a gate with no exit gets switched off wholesale instead of answered.

- **Report anything left waiting, and claim none of it.** Ask the engine once:

  ```
  skitterspec spec-env review waiting
  ```

  A pass listed here arrived when nothing was watching — a wait that never ran,
  a session cleared, a terminal closed overnight — and no watcher can recover
  those, however good. Relay what it prints: the spec, the code, the verdict and
  the age, with `/spec-reviewed <code>` to pick one up and `--drop <code>` to
  disown it.

  **It is information, not a gate.** It never refuses, nothing here is
  conditional on it, and **you never claim one** — `/spec-diff` §0 stands
  unchanged, and a pass sitting there when you arrived was not sent to you.
  Silent when nothing is waiting, which is the usual case: say nothing rather
  than reporting that there was nothing to report.

## 3. Implement the phase

Identify the **first unfinished phase** from the `00-overview.md` phase index,
then open its phase file (`0N-<slug>.md`) — that file holds the tasks. Mark it
started: set the phase-file heading to `🔄` and its `> **Status:**` to
`In progress`, and flip the matching row in the overview phase index to `🔄`.

**Then sync with the tracker (only if a provider is installed).** The phase has
just changed state, so refresh the mirror before the build starts — that is what
makes the phase show as in progress *while* it is being built rather than only
once it is over. Without a provider this is a no-op and nothing below changes.



**Before building, compare the worktree against where you are standing.** Take
the `worktree:` line from `skitterspec spec-env resolve <spec>` and compare it
with this session's cwd, resolving both paths first so a symlinked or
trailing-slash spelling of one tree does not read as two.

Same tree — the ordinary case, since `/spec-start` leaves the session standing
in it — and the rest of this step is inert.
**Different trees, and the discipline below applies however the spec was resolved.**
`--worktree <path>` is one way to get here and §1's rung 4 is another: a bare
`/spec-next` typed from the primary checkout resolves the sole provisioned spec
and builds it somewhere this session is not. What makes the discipline necessary
is the two trees, so that is what it is conditioned on — not the shape of the
invocation, which cannot see rung 4 at all.

Record the baseline before you write anything:

```
skitterspec spec-env resolve <spec> --record-primary
```

Then build as below, with one discipline on top.
**The session is not standing in the worktree**, so every write takes an
absolute path under it and every command
is prefixed `cd "<worktreePath>" &&` — typecheck and tests included. A single
relative path lands the work in the primary checkout, on the base branch, and
nothing about it looks wrong at the time. Step 4b is what catches it.

Then build it, following the project rules in `.claude/rules/*.md` and `CLAUDE.md`:

- Work task by task through the phase file. Make focused edits that match
  surrounding code.
- Honour the project's conventions (see `.claude/rules/spec-planning.md` and the
  rules it links).
- **Tests are part of the phase, not after it.** Create/extend tests for the
  work, then run the project's typecheck and test commands. Do not declare the
  phase done until green.
- Never hardcode dates in tests; never run destructive commands against a real
  database — use the project's test database only.

## 4. Record progress

- In the **phase file**: tick completed tasks (`- [x]`), flip its heading to `✅`,
  and set its `> **Status:**` to `Done`.
- In **`00-overview.md`**: flip the matching phase-index row to `✅`.
- If anything changed from the plan (a decision, a deviation, a discovered
  constraint), add a dated **Changelog** entry in `00-overview.md`.
- If new work surfaced, add it as tasks to the appropriate phase file (or add a
  new phase file + index row) rather than doing it silently.

**Then refresh the mirror (only if a provider is installed).** The phase is done
in the repo now; leaving the tracker to catch up at `/spec-complete` is what makes
a mirror lag a whole spec behind. Without a provider this is a no-op.



## 4b. Prove nothing leaked into the primary checkout

**Only when the resolved worktree is not this session's cwd** — the same
comparison step 3 made, and it holds however the spec was resolved. Standing in
the worktree there is no second tree to have written into, so this step does not
apply and there is nothing to check.

WHAT WOULD FOOL THIS CHECK: it watches the **primary checkout** and nothing
else, so a build run from inside *another* spec's worktree would leak there
unseen. That is left unhandled deliberately rather than overlooked — reaching it
takes an explicit `--worktree` typed from a second worktree — and the cost of the
gap is a missed leak, never a false accusation.

The phase is built and its progress recorded — all of it written into a tree this
session is not standing in. Before reporting any of it as done:

```
skitterspec spec-env resolve <spec> --assert-primary-clean
```

- **Exit 0, "primary checkout clean"** — carry on.
- **Non-zero** — stop and relay the engine's message unchanged. It names the
  paths and both readings: this build wrote them and they belong in the worktree,
  or something else did and the baseline wants re-recording.
  **Do not guess which, and do not delete anything.**
  A path that appeared is not proof of who put it there.
- **"cannot tell"** — no baseline, or one from another spec. It exits 0 and
  claims nothing; say so in one line and carry on. An absence is not evidence.

## 5. Render the page, arm the gate, then wait for the verdict

**Only when the project has per-spec isolation** (`specs/.core/env.config.json`
present). Without it there is no worktree to read and this step does not exist.

The phase is built, its tests are green, and nothing is committed yet. That is
the moment the page is about, so render it now — **after** the tests pass and
**before** the commit:

```
skitterspec spec-env review <spec> --run-reviewers
```

**This is free.** It is the engine reading git and splicing text into a template;
the diff never passes through you, so a 266KB patch costs nothing. Report the
path it prints and move on.

**`--run-reviewers` is free to *you* as well, and costs wall-clock.** Where the
project configured any (`review.reviewers` — empty in most projects, and then
this flag does nothing at all), the engine runs each one against the diff before
rendering, so the page is already populated when it is opened. Their findings
come back as JSON and land on the page as **checks**; the patch still never
passes through you. What it spends is 30s–3min once, after the tests are green —
which is the cheap half of a step that is about to wait on a person for far
longer. A re-render of unchanged work reuses the cached findings rather than
spending another review.

**Findings never gate.** A check is not a comment, so a page carrying twenty of
them still offers `Commit`; a reader who replies to one creates a comment, and
that does gate, because then a person has asked for something. Nothing here
counts them, and nothing here acts on them — you render and wait exactly as you
would have.

**A reviewer that could not run is reported by the page**, not by you. Do not
re-state its outcome, do not investigate it, and never treat it as a failure of
the phase: the strip on the page says `clean` or `did not run — <why>` for each
one, which is where a reader deciding whether to commit will look.

**This render takes the committing button set**, which is the default — so
`--buttons` is not passed. That is a statement about the work, not about the
gate: the phase is finished, so `Commit` and `Commit & Continue` are the right
verbs for it. A render part-way through a run takes `--buttons midrun` and
offers `Continue` instead; `/spec-diff` owns that case.

**Then arm the gate**, so the phase now owes a verdict:

```
skitterspec spec-env review arm <spec> --phase <n>
```

It is idempotent within a phase, so a re-render does not restart the clock, and
it is **never fatal**: a project that opted out, or an engine that could not
resolve the spec, says so and the phase is still built. Nothing here counts
anything — the gate asserts that a phase which ended has an answer, and that is
all it asserts.

**Then offer `/spec-diff`. Do not run it.** The written review is the part that
costs — roughly **700 output tokens**, because writing it means reading the diff
— and that spend is the operator's call, not a default.

**Where you are going to wait, the offer is the banner after the block** —
defined in `.claude/rules/spec-reports.md`, and **the `Review` row is dropped**
so one subject lives in one place:

---

## ⏸ Review ready — <N> files, +<a> −<d><, <n> flagged by <reviewer> — only where one found something>

- **local** — <the `local:` URL>
- **network** — <the `network:` URL, or off with the command that turns it on>
- **remote** — <the `remote:` URL, or off with the command that turns it on>

<the `live:` line, exactly as the engine printed it — omitted when it printed none>

I'm holding here until you send a verdict — the wait covers local and network.

`/spec-reviewed` picks it up · `spec-env review skip "<reason>"` moves on

**The findings count goes in the COUNTS, and nowhere else.** Where `--json`
reported a reviewer in the `findings` state, its count joins the heading — the
slot that already says `7 files, +212 −18` — and that is the whole of it. No
extra line, no extra row, and nothing at all when every reviewer was `clean`,
`cached` or could not run: the page's own strip is where the per-reviewer
outcomes belong, and repeating them here would be the second place naming one
subject that `.claude/rules/spec-reports.md` exists to prevent.

**This is not a third amendment to that contract.** The counts slot is already
there and already carries numbers about the same diff; nothing about the
banner's shape, its lines or its exits changes. A reader who has configured no
reviewer sees the heading they have always seen.

**The stack is the engine's — copy it, do not compose it.** `spec-env review`
printed one line per tier, in that order, and `--json` carries the same thing as
`tiers`. Relay all three whatever they say, including the ones that are off with
the command that turns them on: a reader who has left the house cannot ask for a
remote page they were never shown.

**Do not pick one for them.** The engine used to, and the guess failed three
separate ways in one day. `.claude/rules/spec-reports.md` carries the shape and
why the *one link, never two* rule now reads
**one link per reachable store, each labelled** —
local and network are two doors into one room, so the wait
covers both. `remote` is a second store, so its own line carries its own caveat:
*a verdict here needs `/spec-reviewed`*, because nothing pushes from
the artifact store into this conversation. Never let the holding line promise a
wait over that tier.

**Publishing is still never yours to do.** `remote` reading `off` is the normal
state, and the fix for it is the command on that line — typed by the operator,
or pressed on the page, because a published page is one this tooling cannot
remove and permitting it is not publishing it.

**The `live:` line goes with the stack**, and it is the engine's line too —
copied as printed, and **absent when the engine printed none**. The page can act
on it: a press puts the spec live or takes it down and hands the reader back the
same page, which is `/spec-diff` §2b's routing and not this skill's. What
matters here is that an action **never clears the gate this phase armed** — the
reader has looked at it running and concluded nothing, so the phase still owes a
verdict.

---

**Where you are not waiting, it stays the `Review` row** — the counts and the
page link, and **no question**:

| **Review** | <N> files, +<a> −<d> · **local** <URL> · **network** <URL> · **remote** off |

At the end of a phase you are always waiting, so this shape belongs to the
renders that are not this step: a mid-phase `/spec-diff`, a page produced
alongside other work. A row cannot be waited on, so a question in one is
unanswerable however findable it is.

**Both shapes are addressed to someone, and that is the constraint.** The offer
was once a fenced block of engine output: two quoted lines under the test
counts, addressed to nobody, with the report then closing on *"commit this
first"* — the last instruction the reader got was to move on, so they did. A row
in a labelled table is findable; a banner says the work has stopped. What must
never come back is something unaddressed, unfindable, or fenced.

**The row asks nothing, and that is not a weakening of the above.** A row cannot
be waited on, so a question in one is unanswerable however findable it is —
which is the failure `spec-reports.md` records under *asking implies waiting*.
The row names the page; the banner is what asks, because the banner is the shape
the run is standing behind.

**Never bury it and never split it.** The row sits above the last two rows of
the block, and the page and its counts stay in the same row; the banner
replaces the row rather than joining it. Two places naming one page make the reader
resolve a distinction before acting on either — which is the same failure
whether the two places are adjacent rows or a row and a banner.

### Then wait for the verdict, where the harness can

The row is findable, but a row cannot make the continuation follow from the
reading — and that is the gap the whole gate exists to close.

**The wait is a command. Do not write one.**

1. **Note the moment you start waiting**, as an ISO timestamp. That instant is
   the whole scope of what you may claim.
2. **Run the engine's wait, and end your turn** — under the harness's
   persistent watch primitive where one exists, else in the background
   (`.claude/rules/spec-reports.md` carries the preference):

   ```
   skitterspec spec-env review wait <spec> --since <the timestamp>
   ```

   It returns when a pass arrives inside that window, and
   **it takes no timeout unless you pass one** —
   the wait lasts as long as your session, because a reader who walks away from
   a diff is the normal case rather than the edge one. Do not give it a duration
   of your own.

**A watch that dies is re-armed on the same window**, silently and bounded by
the age of that window — `.claude/rules/spec-reports.md` carries the contract,
including when to stop and what the banner says instead. Do not restate it
here.

   Then **end your turn**. Do not poll it and do not hold the turn open: the
   point is that the reader has the terminal back while they read.
3. **On waking, let the engine pick**:

   ```
   skitterspec spec-env review <spec> --claim-since <the timestamp> --json
   ```

   It claims the one pass that arrived inside the window, and acts on nothing
   at all when none did (the wait can be woken by something that was not a
   pass) or when two did (two sittings, or two people — the operator has the
   codes).
4. **Route on the verdict** exactly as `/spec-diff` §2 and §4 describe. Do not
   restate that routing here.

**WHY A COMMAND RATHER THAN A LOOP YOU COMPOSE.** This step used to say "watch
the pending store" and stop, so every run invented its own watcher in shell —
and three failed in two days, each reaching the operator as *"I pressed the
button and nothing happened"*. The worst wrote
`until [ -f "$P" ] && [ "$x" \> "$y" ]`: valid bash, a syntax error in zsh, a
predicate that could never be true. It spun for five minutes writing to a
stderr nobody reads.

**The bug is not the lesson — the silence is.** A watcher that can never fire
and one patiently working are indistinguishable from outside, so nothing about
that run looked wrong until the operator asked. `review wait` says it has
started, is written once, and is tested against a store that gains a pass
mid-flight. A predicate composed fresh each time is proven by nothing.

**WHY THIS IS SAFE, AND WHAT IT COSTS.** It was once true that a device
reaching your page could not reach your conversation, and that fact was the
whole guard: a pass sat in the holding area until a person typed
`/spec-reviewed`. This replaces that guard rather than weakening it by
accident, and the replacement is two things together — **the serve token**,
48 unguessable bits minted per server, which is what decides who can POST at
all; and **the window**, which is what decides which pass is yours. A pass
already waiting when the wait began is never claimed by it, which is exactly
the stranger's pass the old rule was written about. What is genuinely given up
is that the page can now act, so the token has become a credential rather than
a convenience — and `--claim-since` refusing to choose between two passes is
what stops a race becoming a wrong commit.

**Where the harness cannot run something in the background, you still wait** —
the turn ending is the wait. Say the page is rendered and that you are holding
for the pass, then end your turn; the reader's next message is what carries it,
and `/spec-diff` picks it up from the paste exactly as it always has. The gate
holds either way: it is the engine's, not the wait's.

This once read *"change nothing"* — keep the row, keep the question, do not
wait — and that exemption is the hatch a whole class of unanswerable questions
came through. Every harness can end a turn.

**It still does not break a chained run.** `/commit && /spec-next` is typed as
one line; by the time this step is reached the chain has finished, so waiting
here stops nothing that was still going to happen.

Relay the engine's **stack** — the `local:`, `network:` and `remote:` lines —
never the bare `page:` path: a path is not clickable in any terminal, and a page
nobody can open is a page nobody reads.

- **Never write the review unasked**, and **never publish**. Publishing leaves
  something behind that this tooling cannot remove, so it is always something
  someone asks for. A `file://` link is no use on a phone, and saying so **is**
  the ask — publishing is the answer to it, and `/spec-diff` §6 owns how.
**The `reader:` line no longer decides anything here, and that is the point.**
It is still printed, and it is still the only place that question is answered —
but the offer does not change with it, because the stack lists every tier
whatever it says. Three reader states used to mean three different offers, and
that branching is exactly what produced a `file://` page on a session detected
`unknown`, a LAN URL for a phone off the network, and an address that changed
underneath a reader when detection flipped mid-session.

So: **relay all three tier lines, every time.** Any `also:` lines sit under
`network` — the other addresses this machine has, offered because the
best-guess one can be wrong — so pass them on rather than editing them out.

**Never read an environment variable to decide anything about the offer** — not
`SSH_CONNECTION`, not `CLAUDE_CODE_*`, not a tty check. There is nothing left
here for a detection to decide, and a second implementation of one could not be
tested and would drift.

**Serving is the engine's to do; publishing is never.** The server is one
process, ended by one flag, leaving nothing behind, and `review.allowNetwork`
decides whether it binds wide — no detection involved. A reader the server CAN
reach is not a reason to publish as well: the tiers they can already open are on
the stack. Publishing leaves a page this tooling cannot remove, so it stays an
ask in every case, always — which is why `remote` shows the command rather than
a URL until someone types it.

- **Never fatal.** A failed render — no worktree, a git error — is one line and
  the phase is still done. The page is a convenience; the repo is the record.
- If the project has no isolation config, skip the whole step in silence rather
  than explaining an absence.

## 6. Report

Do **not** `git commit` unless the user asks — finish, verify, and wait.

End with the block defined in `.claude/rules/spec-reports.md`. That file carries
the shape; this section carries only what is specific here.

**Verdicts**

- `✅` — the phase is built and its tests are green.
- `⚠️` — built and green, with something worth knowing (a mirror that did not
  refresh, a deviation from the plan).
- `❌` — the phase's tests are red, or it stopped part-way. Quote the failure.
- `⏸` — no spec in flight, or the name given does not match the one that is.

**Fields:** `Tracker` · `Branch` · `Built` · `Tests` · `Notes` · `Review` ·
`Follow-ups` · `Next`

## 6a. End in a picker

The block says what happened; this is what to do about it. Offer the same four
endings the review page carries, so a review finishes the same way wherever the
reader is standing — the page, a pasted code, or here.

**Not when you are waiting.** Where §5 set a watch and ended the turn, the
verdict is coming from the page and the picker would be a second way to answer
a question already asked — so the block ends on `Next`, which names the page.
The picker is for the run that did not wait: no watch available, or a render
the reader is expected to come back to in their own time.

| Option | Does |
|--------|------|
| `Reviewed` | Claims the waiting pass and routes on its verdict |
| `Commit` | Runs the project's commit skill, and stops |
| `Commit & Continue` | Commits, then `/spec-next` — and **stops there** |
| `Discuss` | Asks what is up; changes nothing |

**`Reviewed` only when a pass is actually waiting.** The render's `pending:`
block already says. Offering a pickup with nothing to pick up is the empty
gesture this exists against — the other three stand on their own.

**Do not restate the routing.** `/spec-diff` §2, §2a and §4 own it, including
the commit hand-off through `review.commitWith` and what `commit-continue` does
after. Two copies of a routing rule is how the two come to disagree.

**It does not break a chained run.** `/commit && /spec-next` is typed as one
line and the picker appears at the **end**, by which point the chain has already
finished. The cost that was feared here — a question stopping a run mid-way — is
not a cost this placement has.

**Nothing may claim a pass without a pick.** `/spec-reviewed` is user-only by
*harness enforcement*, because prose alone once failed to stop an agent claiming
a pass nobody asked it to. A pick keeps the **property** that makes that safe —
a person in the conversation chose, and a device that reaches the page cannot —
while routing around the **mechanism**, since the claim runs downstream of the
pick. That trade is deliberate and it has exactly one condition: a run that
shows no picker claims nothing, and a picker nobody answered claims nothing.

WHAT WOULD FOOL THIS: a picker shown reflexively at the end of every run trains
the reader to dismiss it, and a dismissed picker is indistinguishable from a
considered decline. So offer it where there is a real choice, and let the `Next`
row carry the rest.

`Next` names the commit and then the phase, as
`/commit, then /spec-next → phase 3 (Auth)`, so the block says what to do and
which phase is next without a line of prose for either.

**The commit is not optional politeness.** Step 6 above deliberately leaves the
phase uncommitted, and §2 of this very skill refuses to build the next phase on
top of an uncommitted one — so a `Next` that names only `/spec-next` sends the
reader straight into that refusal. The two halves are four hundred lines apart,
which is exactly how they drifted.

**Step 5's offer lands in one of two shapes, and never both.** Waiting on a
verdict → the **banner** after the block, and no `Review` row. Not waiting → the
`Review` row, and no banner. Neither is a paragraph: the ban on prose after the
block is untouched, and the banner is a control the contract names
(`.claude/rules/spec-reports.md`). Step 5 renders before the commit and this
step is where its offer lands, so the two must not disagree about which shape it
takes.

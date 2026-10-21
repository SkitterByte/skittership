# Spec Reports

Every lifecycle skill ends with the same block. This file is its whole
definition — a skill's `## Report` section names only which fields it emits and
any behaviour that was always there.

Two things it buys: a run's outcome is scannable in one shape rather than
composed fresh each time, and "nothing happened" becomes a reported outcome
instead of an absent one.

## Silence during the run

**Do not narrate.** Not what you are about to do, not why, not which step you
are on. The tool calls are already on screen, so a line per step re-states the
transcript in words that never vary.

Speak mid-run for exactly two reasons:

- **A question you cannot answer yourself** — a decision the spec left open, a
  confirmation a guard demands, an ambiguity with more than one defensible
  answer.
- **A failure, at the moment it happens** — a red test, a refused command, a
  conflict. Say it where it occurs; do not hold it back for the block.

Everything else waits.

## The block

A verdict sentence, a blank line, then a two-column table:

✅ **Phase 2 built** — `feat-foo`, 2 of 4

| | |
|---|---|
| **Tracker** | [ABC-88](https://example.invalid/ABC-88) · `feat-foo` · phase 2 moved |
| **Branch** | `spec/feat-foo` · 3 commits, clean |
| **Built** | POST /orders handler, orders schema |
| **Tests** | 128 passed · dotnet test |
| **Review** | 7 files, +212 −18 · **local** [http://127.0.0.1:7760/…](http://127.0.0.1:7760/…) · **network** [http://192.168.0.136:7760/…](http://192.168.0.136:7760/…) · **remote** off |
| **Follow-ups** | none |
| **Next** | `/spec-next` → phase 3 (Auth) |

**A table, and never a fenced block.** An aligned label column is only
achievable inside a fence, because markdown collapses runs of spaces outside
one — so alignment and being recognised as a report are mutually exclusive, and
the report wins. A fence renders as the same grey box as a code sample, and a
reader who has been shown code all session reads one more box as code: the first
person to receive one of these did not register it as output at all, and missed
the `Next` row inside it. That is the exact scanning failure this contract exists
to fix, so producing it in the contract's own format is not a cosmetic mistake.

**The verdict sentence** is `<state> **<one clause>** — <spec>, <where it got
to>`. The clause says what happened; the tail says to what, and how far. Name
the skill in the clause when the run's identity is not obvious from the
conversation — a refusal, or a skill invoked by another. A run with no spec to
name drops that segment rather than inventing one.

**The header row is empty.** The labels are the left column, and a header over
them would only be able to say "field", which no one needs told.

**The block is the last thing in the message.** Nothing follows it — not a
closing line, not a next step, not the offer. Everything the reader must act on
is a row, which is what earns the block its position.

**And that is a rule about the destination, not only the prohibition.** It was
stated plainly and broken repeatedly, by runs that had something worth saying
and nowhere in the block to say it — so the paragraph went after the table,
where it buried the rows it was meant to sit beside. A missing destination reads
as a rule that does not fit the work, and a rule that does not fit gets ignored.
So: **if it is worth telling the reader, it is a row.**
**If it is not a row, it is not worth telling them.**
`Notes` is the row most of that content belongs in.

**Two controls may follow the block, and nothing else ever.** The ban exists
because *prose* after the block competes with it for the reader's attention and
loses them the rows. A control does not compete: it is a row made actionable, in
the place the reader's eye already finishes. Prose after either of them is the
same violation wearing a control's clothes.

**The first is a picker.** Where the run ends in a choice the reader must make,
the options may be offered after the table.

**The second is the review call-to-action**, and only where the run is actually
**waiting** on a verdict. It is a banner, not a sentence:

---

## ⏸ Review ready — 7 files, +212 −18

- **local** — [http://127.0.0.1:7760/7e9e123e7540/feat-orders](http://127.0.0.1:7760/7e9e123e7540/feat-orders)
- **network** — [http://192.168.0.136:7760/7e9e123e7540/feat-orders](http://192.168.0.136:7760/7e9e123e7540/feat-orders)
- **remote** — off · `/spec-remote-review` turns it on

live: off — /spec-live to put it live

I'm holding here until you send a verdict — the wait covers local and network.

`/spec-reviewed` picks it up · `spec-env review skip "<reason>"` moves on

---

A rule, a heading naming the state and the size, **the stack**, the `live:`
line, one line saying the run is stopped and which tiers it covers, and the two
exits. Nothing else, and never a paragraph explaining it.

**The `live:` line, and why a rigid contract took a second amendment.** Reading
a diff is not the only way to judge a change — often the question is whether it
*works* — and the answer to that lives at the running URL. A reader deciding
whether to open the page at all wants to know whether it is already running
somewhere, and finding that out any other way is a trip to a terminal in the
middle of a review.

**Each line names a command a person types**, rather than describing a
capability. `live: off — the page can put it live` told the reader that a page
somewhere could do it and left them to find the verb — and the verb is what they
need when they are in a terminal rather than on the page. So the lines say
`/spec-live`, `/spec-live main`, `/spec-remote-review`. Making them *clickable*
was considered and rejected: the only clickable thing markdown has is a URL, and
a URL that acts when it is **fetched** is one a link previewer or a prefetcher
fires with nobody involved.

It is the engine's line, copied like the stack: `spec-env review` prints it and
`--json` carries the same answer as `live`, from one function, so the report and
the command cannot disagree. Four states, and only three of them are a line —
`on` (with the URL when the project configured one), `off`, `held` (naming the
spec holding the workbench). The fourth, `unavailable`,
**prints nothing at all**:
a project with no isolation and a spec with no worktree both land there,
and a line about a surface that does not exist is an accusation against a
healthy repo.

**This is the second amendment to this section in two specs**, which is worth
naming rather than letting pass. The contract earns its rigidity from real
failures, and two amendments in a row is how a rigid contract quietly becomes a
negotiable one. Both have carried their reason and both replaced a line rather
than adding a paragraph.
**A third should have to argue harder than either did.**

**The stack is the engine's, copied rather than composed.** `spec-env review`
prints one line per tier and `--json` carries the same thing as `tiers`, so take
it from there in the order it comes — and do not decide which tiers are worth
mentioning. The whole reason the stack exists is that the engine was being asked
to guess where the reader was sitting, and it guessed wrong three separate ways
in one day; a skill re-deciding that in prose is the same guess one layer up.

**Three tiers, always all three, in this order.**

| Tier | Is | Off when |
|------|----|----------|
| `local` | the loopback URL — the machine the run is on | never. With nothing served it is the `file://` page, and says it cannot send a verdict |
| `network` | the LAN URL — a phone on the same wifi | `review.allowNetwork` is false, or this machine has no network address |
| `remote` | a published page, for a reader off the network | `review.allowRemote` is false, or nothing has been published |

A tier that is off **keeps its line** and names the one command that turns it
on. Dropping the line is what left a reader who had walked out of the house with
nothing on screen to tell them a remote page was even possible — they could not
ask for what they could not see.

**Only promise a wait the transport can deliver.** The wait itself is real in
every case; what varies is what carries it back, not whether the run is
stopped. Three transports, three true sentences:

- **A page the engine SERVES** hands its pass to the local store, and
  `spec-env review wait` returns when it lands. The run is woken by the press:
  *"I'm holding here until you send a verdict."*

  **That sentence is only true for as long as the wait is actually running**, so
  the wait is the engine's and never one composed for the occasion. A watcher
  written per run is proven by nothing: one was written
  `until [ -f "$P" ] && [ "$x" \> "$y" ]` — valid bash, a syntax error in zsh,
  a predicate that could never be true — and it spun for five minutes while the
  report underneath it said the run was holding.
  **Silence is what made that expensive**:
  a wait that cannot fire and one patiently working look identical,
  so nothing seemed wrong until the reader asked. Give the wait no timeout
  either; it lasts as long as the session, because a reader who walks away from
  a diff is the normal case and a bounded watch once lost a verdict to a lunch
  break.
- **A `file://` page** has no server to POST to, so the pass is copied and
  pasted — the reader's next message is what carries it. The run is stopped just
  the same, and says so:
  *"I'm holding here — paste the pass when you have it."*
  This is the same wait, carried by the conversation instead of a watch. It is
  not a lesser one, and it is not an excuse to ask without waiting.
- **A PUBLISHED page** writes to the artifact's own store, and nothing pushes
  from there into the conversation. That is the one case where a verdict is
  genuinely invisible until someone asks for it, so its line in the stack says
  that rather than letting the holding line speak for it:

- **remote** — [https://…](https://…) · a verdict here needs `/spec-reviewed`

  Where `remote` is the only tier a reader can reach, the holding line says so
  too: *press a verdict, then type `/spec-reviewed` — I cannot see it until you
  do.* Where a served tier is reachable as well, the holding line keeps naming
  the tiers the wait covers, and `remote`'s own caveat sits on `remote`'s line
  where it belongs.

**A harness with no file-watch does not get an exemption.** It once read
"change nothing" — keep the row, keep the question, do not wait — and that
escape hatch is what let a whole class of runs go on asking questions nobody was
listening for. Where a watch is unavailable the wait is the turn ending, which
every harness can do.

**Run it under a persistent watch primitive where the harness has one** — one
that lives for the whole session and whose deliberate stop is an explicit act
(Claude Code: the `Monitor` tool with `persistent: true`, ended by `TaskStop`).
A backgrounded shell is reclaimed on a long idle — that is the death the next
paragraph recovers from — where a session-length primitive is designed to
survive it. Where the harness has none, background the command exactly as
before. The engine's wait stays the one watcher either way: its heartbeat goes
to stderr, so stdout carries only the start line and the arrival, and the exit
ends the watch.

**A watch that dies is re-armed, silently, on the same window.** A backgrounded
wait does not always survive a long idle: three sessions lost theirs over one
lunch break, and two in another were killed at 43 and 30 minutes. So a wait that
ends **without a verdict** and **was not stopped by the operator** is started
again on the **same** `--since`. Not a fresh one — a pass that arrived during
the gap is still inside the original window, and re-arming on a new timestamp
would strand exactly that pass.

**Say nothing when you do it.** Nothing happened and the window is unchanged; a
line on every death turns a working loop into a stream of non-events.

**An operator who stopped it is not a death** — re-arming over a deliberate
stop makes the wait unstoppable, which is worse than a wait that stops. But a
deliberate stop is an **explicit act with positive evidence**: this session
called TaskStop, or the operator said to stop waiting. A bare killed-task
notification carries neither and is read as a **death**. This clause once said
to treat the ambiguous kill as deliberate, and that safe branch ate the
recovery whole: every observed kill was the harness reclaiming an idle shell
and none was a person, so the case it protected against does not occur — while
the `/spec-reviewed` it charged was paid on every idle review. The deliberate
stop is the positive signal, so its absence is what a death looks like
(`.claude/rules/negative-checks.md` rule 1).

**It is bounded by the age of the window, not by a count of retries.** Keep
re-arming while the window is younger than **12 hours**, then stop. A count means
something different depending on whether deaths come five minutes or forty-five
apart, and the observed interval already varies that much. Twelve hours
deliberately does not cover an overnight gap — the pass is never lost, and
`/spec-reviewed` is the designed recovery — because the alternative is waking
the session every half hour all night for a review nobody is returning to
before morning.

**Past the bound the banner degrades**, to the sentence this file already
defines for a transport that cannot push into the conversation:

*press a verdict, then type `/spec-reviewed` — I cannot see it until you do.*

That is a new **state** for an existing sentence, not a new sentence. The
holding line is only ever printed while a wait is actually running, which is the
rule this section has always carried: *only promise a wait the transport can
deliver.*

**The `Continue` ending, and why the banner's exits differ mid-run.** A page
rendered part-way through a run offers `Continue` — *I have read it, carry on* —
in place of the committing verdicts, because "commit" is the wrong verb for
unfinished work. Its banner names the same state and the same stack, and
different exits:

…the stack, unchanged…

I'm holding here until you send a verdict — the wait covers local and network.

`Continue` carries on · `Request changes` works them now

The stack is written out once, above, and referred to everywhere else. Two
copies of it is how the two come to disagree about which tiers exist.

**It is not the `none` verdict that was removed.** `none` recorded itself and
did nothing, which is the record-and-do-nothing ending this contract exists
against. `Continue` **resumes the run** — it names an action, which is the bar
every verdict has to clear. What it does not do is commit, and it can never
clear the gate a finished phase armed: that gate is discharged by a committing
verdict or a recorded skip, and by nothing else.

**So waiting and arming are separate**, and only one of them is about this
block. *Waiting* is what any offer does, and it is what this section governs.
*Arming* asserts an obligation that outlives the turn, and belongs only to work
that is finished. A mid-run render waits without arming — walking away from it
costs nothing, which is exactly why `Continue` is safe to offer there.

**One link per reachable store, each labelled.** This amends
*"exactly one link, never two"*, and the evidence that rule was written on is
the reason it still reads the way it does. Two links were handed over, the wait
stood behind only one of them, and a verdict was pressed on the published page
three times while each one sat unread under a line claiming the run was waiting.
Two links was not a convenience with a caveat; the caveat existing was the bug.

**What that evidence is about is the store, not the count.** A served page hands
its pass to the local pending store, which `spec-env review wait` watches; a
published page writes to the artifact's own store, which nothing here can see.
Two links into two stores asks the reader to know which door the run is standing
behind, and they cannot.

**Local and network are two doors into one room.** The page POSTs with
`fetch(location.pathname, …)`, so a page opened at `127.0.0.1:7760/…` and one
opened at `192.168.0.136:7760/…` reach the same server process and the same
pending store. One wait covers both, and a verdict pressed on either wakes the
same run. Between those two the objection does not apply — which is why both are
offered, and why offering them gives nothing up.

**So two things are required, and the second is what the old rule lacked.**
Every link is **labelled** with its tier, and one line says
**which tiers the wait covers**.
Two *unlabelled* links stay forbidden exactly as before, because
the reader still cannot tell them apart.

**`remote` keeps the caveat it always had.** It is listed so a reader off the
network knows the surface exists and what turns it on — never as a door the wait
is claimed to cover. Where it is on and published, its line says what is true of
it: *a verdict here needs `/spec-reviewed`*.

**Still forbidden**, in the words of the rule this amends: offering two links
into **different** stores without saying which one the wait is watching. That is
the failure that cost three unread verdicts, and nothing here touches it.

**This is not the old failure returning**, and the difference is the whole
justification. The offer used to be two quoted lines in the tail of a long
report, addressed to nobody, under a closing line that told the reader to move
on — and it was never once taken. It was moved into a labelled row to make it
findable, and that worked. What changed since is that the run now *waits*: the
reader is not being offered something optional, they are being told the work has
stopped until they answer. A row cannot carry that, because a row is scanned at
the same weight as every other row. So the state gets the loudest shape on
screen, at the end, where reading finishes.

**ASKING IMPLIES WAITING — one rule, and the two shapes follow from it.** Any
render that asks the reader for a verdict ends the turn watching for one. A run
that does not intend to wait does not ask: its `Review` row keeps the counts and
the link and **loses the question**.

So there are two shapes and no third:

- **Asking** → the banner above, and the run waits.
- **Not asking** → the `Review` row: counts and link, no question.

**What this guards against is a reader taught that the button is decorative.**
`/spec-bug` and `/spec-hotfix` used to render the page, emit a row
asking *"want a written review before you commit?"*, and finish — with nothing
watching. A verdict pressed on that page landed in the holding area and stayed
there, because the run had told the reader the page was **ready** rather than
that it was **waiting**. It happened twice on one spec, and the second press
existed only because the first appeared to do nothing. An offer that cannot be
answered costs more than never having offered.

**Rejected: keeping the question and adding a caveat** — *"press a verdict, but
I will not see it until you ask"*. That is exactly the shape that stranded those
two passes, and a truthful caveat does not make an unanswerable question worth
asking. Either watch for the answer, or do not ask.

**A render nobody is being held for is still worth reporting** — a mid-phase
`/spec-diff`, a page produced alongside other work. It gets the row, because
giving it a banner teaches the reader to scroll past banners. The shape marks
the difference between *here is a page* and *nothing proceeds until you answer*.

**Never fence a message to the reader.** A fenced block is for a command to
run, code, or engine output quoted verbatim — things the reader copies or
compares. A question, an offer, a hand-off is prose. The same mechanism that
made the old report unreadable applies to anything else in a grey box: it is
read as an artefact to skim rather than as something addressed to someone, so a
question inside one goes unanswered and an instruction inside one goes unread.

**It reports this run and nothing else.** Not what else is in flight, not the
other worktrees, not the backlog, not the state of the repo at large. A reader
finishing one piece of work cannot tell whether a line about some other spec is
a consequence of what just happened or an unrelated aside, and has to stop and
work it out — which is the cost this block exists to remove. If they want the
wider picture there is a skill that answers it; volunteering it here muddies the
one thing they asked about.

`Next` is the single next action **for this work**, not a menu of what else
could be done.

**And it must be runnable from the state the run actually leaves behind.** Most
of these skills deliberately do not commit — they finish, verify, and wait — so
the tree they hand back is dirty, and several of the commands they would name
next refuse on a dirty tree. A `Next` that omits the commit therefore sends the
reader to a refusal: `/spec-next` leaves a phase uncommitted and its own §2
refuses on exactly that, and `/spec-bug` leaves a fix uncommitted where
`/spec-complete` refuses the same way. Where the skill does not commit, the row
says `/commit, then <the thing>`.

This is not a style rule. `Next` is the one row a reader is meant to act on, and
it closes the block because the closing row should be the one that moves the
work on. A row that cannot be run spends the trust the position was designed to
earn — and the two skills that got it wrong got it wrong independently, which is
what makes it a missing constraint rather than two slips.

## Field vocabulary, in this order

A skill emits only the fields it declares, in this order, skipping the rest.
`Follow-ups` is the exception: always present, second to last.

`Tracker` is the conditional one: a skill may declare it and still never emit
it, because no ticketing provider is installed. That is an absence with nothing
behind it — say nothing rather than reporting that there was nothing to report.

| Field | Carries |
|-------|---------|
| `Tracker` | **First.** The ticket id, linked where the spec has a url, the spec's folder name beside it, and what changed there. |
| `Why` | **Non-`✅` only.** What stopped it, in one clause. |
| `Branch` | Branch name, commit count, clean or dirty. |
| `Spec` | The spec document's own state: status, bucket, phase. |
| `Cause` | The root cause, for work that diagnosed one. |
| `Built` | What the run produced — the code, the edits, the spec written. |
| `Tests` | The result and the command that produced it. |
| `Notes` | What this run hit and handled — one short paragraph. Named `Snags` once, which announced a problem before the reader had read one; most of what belongs here is neither good nor bad, just worth knowing. A wrong turn, a guard that fired, a check of yours that turned out to be a false negative. Not a caveat on the outcome (`⚠️` and `Why` carry those) and not future work (`Follow-ups` carries that): this is what happened on the way. |
| `Landed` | A fast-forward, a tag, a cherry-pick. |
| `Worktree` | A worktree provisioned, entered, or torn down. |
| `Untouched` | Uncommitted work the run deliberately left alone — whose, and how much. |
| `Review` | The rendered diff page: files, `+`/`−`, and the stack — the same tiers the banner lists, labelled, run together with `·` because a row is one cell, plus `live` where the engine reported one. **No question** — a row cannot be waited on, so a question in one is unanswerable by construction (see *asking implies waiting*). **Omitted entirely when the run is waiting on a verdict**: the banner after the block carries it instead, and a row saying the same thing beside it splits the reader's attention across two places. |
| `Follow-ups` | **Always.** `none`, or one line each. |
| `Next` | **Last.** The single next action for this work — runnable from the state the run leaves behind. |

The order runs identity → context → what happened → where it went → what to do.
**`Tracker` is first** because the id is what addresses this work outside the
repo, and **`Next` is last** because it is the only row the reader acts on: the
closing row should be the one that moves the work on.

**`Untouched` is a fact, not a caveat.** A run that provisions beside another
spec's uncommitted work has done nothing wrong and nothing partial — it left
alone something that was never its business — so it stays `✅` with a row, and
does not become `⚠️`. Several specs in flight at once is what the worktree mode
is *for*; spending the "something is worth knowing" verdict on the normal case
is how that verdict stops meaning anything. It is still reported rather than
silent, because "I provisioned, and your four files are still sitting there" is
a different sentence from "I provisioned".

**`Review` is one row, not two** — and where the run is waiting, it is no rows
at all. The page and what to do with it are the same subject, and splitting them
made the reader resolve a distinction before acting on either. A waiting run
promotes the whole subject into the banner; keeping the row as well would
recreate that split with the two halves further apart than ever.

**The row carries no question, and that is the rule above applied here.** It
once ended *"want a written review before you commit?"* — a question addressed
to a reader the run was not waiting for. Putting it in a findable row fixed
where it was; it did not fix that nothing was listening. A run that wants that
question answered waits for it, and waiting means the banner.

## The four verdicts

| State | Means |
|-------|-------|
| `✅` | Done. Everything the skill set out to do happened. |
| `⚠️` | Done with caveats — it finished, but something is worth knowing. |
| `❌` | Failed part-way. It acted, and the repo is mid-something. |
| `⏸` | Refused before acting. Nothing changed. |

**`❌` and `⏸` are different facts about the repo**, and the difference decides
what happens next. A failed landing leaves a conflicted rebase and a standing
worktree — there is a mess to clear. A refusal leaves nothing at all, and the
only thing to do is supply what was missing. Collapsing them sends people
looking for wreckage that is not there, or past wreckage that is.

**A refusal still emits the block.** That is the point of having four states:
every invocation ends the same way, so an outcome is never inferred from
silence.

## Where the block may grow

One place only. A non-`✅` verdict adds a `Why` row, and quotes the output that
justifies it — the failing assertion, the conflict, the engine's refusal — in a
fenced block **above** the table, where a fence means what a fence should mean:

```
✖ rejects a negative quantity
  expected 422, got 500
```

❌ **Phase 2 stopped — tests red** — `feat-foo`, 2 of 4

| | |
|---|---|
| **Why** | 3 assertions fail in `test_orders.py`; nothing committed |
| **Branch** | `spec/feat-foo` · 2 commits, dirty |
| **Built** | POST /orders handler, orders schema |
| **Tests** | 125 passed, 3 failed · pytest |
| **Follow-ups** | none |
| **Next** | fix the failures, then `/spec-next` to finish phase 2 |

Everywhere else the block stays the size it is. Prose after it, an extra row of
your own invention, a second block — all three are the shape drifting back to
what this replaced.

## Follow-ups

**Always present.** A recorded `none` is a decision; a missing line is an
oversight — the same logic as the `Gating` header.

The bar is deliberately high. A follow-up is something *this* work surfaced
that *this* spec will not fix — a wrong assumption, a missing guard, a decision
the spec deferred and the code then leaned on. It is **not** "could be tidier",
and it is **not** anything already sitting in the spec's Open questions.

When there is one, **offer to `/spec` it on the spot**. If the user does not
take the offer, write one dated line into the spec's Changelog before you
finish, so it outlives the session:

```
- 2026-01-09 — Follow-up surfaced: connect's port picker assumes a free
  canonical port; not in scope here.
```

**The offer needs no caveat about where.** These skills run inside the spec's own
worktree, and a follow-up spec authored *there* would physically live on that
branch — invisible from the base branch, and cancelled along with its host. That
used to make the offer name the primary checkout as the place to write it.
It no longer does: `/spec` provisions the **new** spec's own worktree before it
writes anything and moves the session there, so the follow-up lands on its own
branch and its own ticket without anyone naming a location. Take the offer and
let `/spec` handle it. Where isolation is absent there is no worktree to move to,
and the old caveat applies — `spec-planning.md` and `commit-trailers.md` carry
the reasoning.

## Worked examples

**`⚠️` — it finished, with something worth knowing.**

⚠️ **Phase 3 built; tracker not updated** — `feat-foo`, 3 of 4

| | |
|---|---|
| **Branch** | `spec/feat-foo` · 4 commits, clean |
| **Built** | Auth middleware, session table |
| **Tests** | 140 passed · go test ./... |
| **Follow-ups** | Session expiry is read from two places; phase 4 leans on one |
| **Next** | `/spec-next` → phase 4 (Docs) |

**`⏸` — refused, nothing changed.**

⏸ **`/spec-next` refused — no spec in flight**

| | |
|---|---|
| **Why** | Not standing in a worktree, and 2 specs are provisioned |
| **Follow-ups** | none |
| **Next** | `/spec-start <name>`, or `cd` into `../repo-wt/feat-orders` or `../repo-wt/feat-auth` |

**`✅` — a spec finished and landed.**

✅ **Landed and torn down** — `feat-foo`, complete

| | |
|---|---|
| **Tracker** | [ABC-88](https://example.invalid/ABC-88) · `feat-foo` · moved to its done state |
| **Spec** | Complete · `specs/complete/feat-foo` |
| **Tests** | 131 passed · npm test |
| **Landed** | base fast-forwarded to 4a1c9e2 |
| **Worktree** | removed · `../repo-wt/feat-foo` |
| **Follow-ups** | none |
| **Next** | pick the next spec from `specs/backlog/` |

The `❌` example is in **Where the block may grow** above, since the failing
output it quotes is the thing that example exists to show.

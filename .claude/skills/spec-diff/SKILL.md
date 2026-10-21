---
name: spec-diff
description: See what a spec's worktree changed — render its diff as a page you can mark up, take that review pass back, and act on it. Answers at any point, including half-way through a phase, and takes --reviewers to run the project's configured code reviewers. Use when the user says "/spec-diff", "show me the diff", "what did this phase change", "review this spec's work", "run the reviewers", or hands back what the review page produced — a six-digit claim code, a bare verdict word, or the pasted JSON.
---

# /spec-diff — see the phase before you commit it

> Stay silent while this runs — speak only to ask something you cannot answer
> yourself, or to report a failure at the moment it happens. Read
> `.claude/rules/spec-reports.md` before reporting; it defines the block this
> skill ends with.

A phase is built in its own worktree, and the terminal is somewhere else — so
`git diff` answers about the wrong branch and a 350-line diff read as terminal
text is scrolling, not review. This renders the diff as a page instead: the
engine collects it with `git -C`, writes a self-contained HTML file, and you open
it locally or publish it and read it on a phone.

**The diff never passes through the model.** git writes the patches and the
engine splices them into the page. A 266KB patch costs **zero** context tokens,
and a 289KB page costs the same to publish as a 5KB one. Do not "simplify" this
by reading the diff and emitting HTML — that is the one change that would undo
the whole design.

## 1. Resolve the spec — three rules, in order

1. **The name argument**, when given. An unknown name **refuses** and says so:
   falling back would review a different spec's work under the name you typed,
   which looks exactly like a correct answer.
2. **The spec in flight for this session** — `skitterspec spec-env live status`
   names the spec whose branch is checked out in the primary checkout.
3. **The worktree this session is standing in** — if cwd is inside a spec's
   worktree, that is the spec.

If none answers and several specs have worktrees, **list them and stop**. The
engine does this for you: run the verb with no name and it either resolves the
sole candidate or prints the candidates.

## 2. Were you handed a review pass? Then that is the job

The page has marks on it — `✓ accept` per file, notes against a line or a whole
file, answers to the checks a written review asked — and it
**ends in a decision**: `✓ Approve`, `↺ Request changes` or `… Discuss first`.
A review comes back to you one of three ways, and **all three are ordinary**:

- **A six-digit code** — `418207`, on its own. A *served* page hands its pass
  straight to the engine, which holds it until someone reads the code out. This
  is the usual way on a phone.
- **A verdict word** — `commit`, `commit-continue`, `continue`, `changes` or
  `discuss`. A `file://` page cannot send anything, so where the reader marked
  nothing it copies a command carrying the conclusion on its own. Send it with
  `skitterspec spec-env review <spec> --verdict <word>`; it joins the same merge
  a claimed pass does, so everything below is unchanged.
- **A pasted JSON blob** — the same `file://` page, once the reader has marked
  something up: accepts and notes do not fit on a command line, so the whole
  pass travels. Not legacy: it is the whole story for a local reader.

Either way, **this is not a request to render anything**: it is a review coming
back, and these steps replace §3–§5 below.

0. **Never claim a pass you were not asked to claim.** And never go looking
   for one.

   A device that reaches the page can POST all day. What decides whether one of
   those passes reaches the operator's review is this rule, and — since the wait
   in §4b — two mechanical facts beside it: the **serve token**, 48 unguessable
   bits minted per server, which decides who can POST at all; and the wait
   **window**, which decides which pass a watch may claim. There is exactly one
   way a pass is taken without a person naming it, `--claim-since`, it is
   described in §4b, and it acts on nothing unless precisely one pass arrived
   while this session was waiting for it.

   Everything else here is unchanged. A pass that was already sitting there when
   you arrived is never yours to take.

   **Do not read the code out of `.spec-env/reviews/<spec>.pending.json`.** The
   store is a file you can open, so nothing stops you; that is precisely why the
   rule has to be stated rather than assumed. It has already happened once — an
   agent found a waiting approval, read its code off disk, claimed it, and
   reported the round-trip working. The operator had pressed the button, so the
   outcome was harmless and the reasoning was wrong.

   The render tells you everything a decision needs, so there is nothing to go
   looking for:

   ```
   pending: 1 waiting
     792969 · commit · 1 min ago
   ```

   **Offer it, naming the code**, and wait: *"an approval is waiting, code
   792969, sent a minute ago — does that match your phone?"* The digits travel
   **to** the operator, not from them — they verify rather than transcribe, and
   the code is the only part they can check, so
   **name it rather than describing the pass** (a stranger's approval and theirs
   read identically otherwise).

   **Two or more waiting is a refusal to guess.** Name them all and ask which.
   Never take the newest, the oldest, or the only `commit` — that is exactly
   the case where someone else's pass is sitting beside the operator's, and it
   is the only case where reading six digits out is worth anyone's time.

   **On "that isn't mine"**, leave it and offer to drop it:

   ```
   skitterspec spec-env review <spec> --drop <code>
   ```

   A pass that stays is reported on every render until the operator stops
   reading the line — which is how the real one gets missed.

1. **Take it in through the engine**, whichever way it arrived.

   **A code** — claim it, once the operator has confirmed it is theirs (step 0):

   ```
   skitterspec spec-env review <spec> --claim <code>
   ```

   **A pasted blob** — write the JSON to a scratch file
   verbatim — never retype it, never "tidy" it — and merge it:

   ```
   skitterspec spec-env review <spec> --notes <file>
   ```

   Both validate wholesale and write nothing if the blob is malformed or names a
   different spec; a claim additionally refuses a code that matches nothing, and
   **names nothing when it does** — listing the waiting codes would hand a
   guesser the answer. **Relay a refusal as it is written** and stop; every
   message says which entry was wrong, so there is nothing to guess.

   **A claim is a delivery mechanism, not a second kind of review.** Everything
   below reads the same merged pass and the same verdict; nothing may behave
   differently because of how it arrived.

2. **Read the verdict the engine judged.** The pass says what it CONCLUDED, and
   the engine prints it — `committing with <skill>`, `committing with <skill>,
   then the next phase`, `changes requested`, `discuss first`, or
   `commit refused — <reason>`. It is judged, not taken on trust: a committing
   verdict arriving with an open comment is refused and routed to discuss,
   because you asked for something and it therefore cannot also be fine.
   **Never re-judge it yourself, and never count anything** — read the engine's
   answer and route on it.

   Three routes, and every pass takes exactly one:

   | Verdict | What it means | Where to go |
   |---------|---------------|-------------|
   | `commit` (honoured) | this is fine, commit it | §2a — commit, then stop |
   | `commit-continue` (honoured) | this is fine, keep going | §2a — commit, then `/spec-next` |
   | `changes` | do these, now | step 4 — **skip the wait**, this is the go-ahead |
   | `discuss` | I have a question | step 3 — report, then **ask what's up** |

   **A refused commit and a pass with no verdict both mean `discuss`.**
   Neither is a special case: the engine routes the refusal there itself, and an
   absent verdict has always meant "report it and wait" — which is why that is
   what it still means.

   **A pass may carry an `action:` instead**, and then none of the above
   applies: it concluded nothing. Go to **§2b**. The engine refuses a pass
   carrying both, so there is never a choice to make between them.

   **It is on the `claimed:` line** — `· action: live-on` at the end of it, and
   `claimed.action` under `--json`. Read it there rather than inferring one
   from a pass that merged nothing: a claim reporting no verdict and no counts
   used to be the only trace a press left, which made every action look like a
   reader who had concluded nothing. If the line carries no action, there was
   none.

3. **Say what you read, then ask what's up.** Report the accepted count, then
   each open comment as `file:line — note`, then the files you would touch.
   **Wait — unless the verdict already said otherwise.** Pasting on its own is
   not a go-ahead: this skill is read-only everywhere else, a misread comment
   costs a revert, and the operator may only have wanted it recorded. A `changes`
   verdict **is** that go-ahead, given deliberately on the page, so asking again
   is asking someone to decide twice. The reasoning is unchanged; what changed is
   that the page can now answer it in advance.

   **`discuss` means "ask me what's up"** — an opening move, not a stopping
   place. A reader who pressed it has a question, and a summary that ends in
   silence leaves them to ask it themselves. Report what you read and then
   **open the conversation**: name what you would do next and ask whether that
   is what they wanted. The same wording has to work for a pass that chose
   nothing at all, since an absent verdict means this too — so ask about the
   review, never about the button.

4. **On the go-ahead, work only the commented files.** Read those; do **not**
   open the accepted ones. That is the whole saving the marks buy, and it is
   only worth anything if it is true — so say plainly which files you did not
   open. Make the changes, then run the project's typecheck and test commands.

   **First, compare the worktree against where you are standing.** This is the
   one step here that writes, and §1's first rule resolves by **name** — so
   editing a tree this session is not standing in is the ordinary case, not an
   edge one. Take the `worktree:` line from
   `skitterspec spec-env resolve <spec>` and compare it with cwd, resolving both
   paths first so a symlinked or trailing-slash spelling of one tree does not
   read as two. Same tree, and everything below is inert.

   **Different trees, and the discipline applies.** Record the baseline before
   the first edit:

   ```
   skitterspec spec-env resolve <spec> --record-primary
   ```

   Then every write takes an absolute path under the worktree and every command
   is prefixed `cd "<worktreePath>" &&` — typecheck and tests included. A single
   relative path lands the fix in the primary checkout, on the base branch, and
   nothing about it looks wrong at the time.

   **This is a write discipline, not a precondition.** It changes *how* this
   step writes, never *whether* it runs — §3 below still holds in full, and a
   later edit reading this as a gate would undo the rule it exists beside.

5. **Write back what you did**, one entry per comment you acted on:

   ```json
   [{ "id": "2026-01-01T00:00:00.000Z-1", "note": "keyed the accept on the blob sha" }]
   ```

   ```
   skitterspec spec-env review <spec> --resolve <file>
   ```

   The note is the load-bearing half: it is what lets the next read **verify**
   the fix rather than trust it. An id that matches nothing is reported and
   skipped, so one bad id never costs you the rest. Then re-render (§4) so the
   page shows each note struck through with its account.

6. **Before the re-render, prove nothing leaked** — only when step 4 found two
   trees. Nothing should be reported fixed before it is known to be fixed in the
   right one:

   ```
   skitterspec spec-env resolve <spec> --assert-primary-clean
   ```

   - **Exit 0, "primary checkout clean"** — carry on.
   - **Non-zero** — stop and relay the engine's message unchanged. It names the
     paths and both readings: this run wrote them and they belong in the
     worktree, or something else did and the baseline wants re-recording.
     **Do not guess which, and do not delete anything.** A path that appeared is
     not proof of who put it there.
   - **"cannot tell"** — no baseline, or one from another spec. It exits 0 and
     claims nothing; say so in one line and carry on. An absence is not evidence.

   WHAT WOULD FOOL THIS CHECK: it watches the **primary checkout** and nothing
   else, so a fix written into *another* spec's worktree would leak there unseen.
   Left unhandled deliberately — the cost of the gap is a missed leak, never a
   false accusation.

**Never commit on a `changes` pass.** It authorises the work, not a commit —
only `commit` and `commit-continue` reach §2a. The fixes sit in the worktree
where the operator can read them on the next render, which is the whole point of
sending them back rather than approving.

## 2a. A committing pass commits — through the project's own skill

Only on an **honoured** `commit` or `commit-continue`. A refused one did not
happen.

The engine names the skill to use on the verdict's `commitWith` — the
`review.commitWith` config key, `/commit` by default. Do not read the config
yourself; one answer, from the engine that owns it. **There is no off switch:**
`"none"` existed and was removed, because a verdict that records itself and does
nothing is the one thing a review page must not offer.

- **A skill you have** — invoke it, and say which one. **Never vendor it.**
  `/commit` ships with **skittership**, a different package: it stages the
  task's files, runs the project's checks, and writes the release-note footers
  this repo's changelog is built from. A copy of it living here would be a fork
  of someone else's skill that drifts silently.
- **A skill you do not have** — commit it yourself: stage only the files this
  work touched, run the project's typecheck and test commands, and write a
  conventional commit. **Say that you did, every time.** A commit made under
  rules nobody configured must never be reported as one made under `/commit`.

**Decide availability from the skill list you already have**, never by testing
for a file. A skill can legitimately live in several places, so `.claude/skills/
commit/SKILL.md` missing is an absence that proves nothing
(`.claude/rules/negative-checks.md` rule 1) — and being wrong about it means
committing by hand while reporting a hand-off. You are told which skills you
have; that list is the answer.

**Let the commit's own failure be the answer.** If typecheck or the tests fail,
there is no commit — report the failure and stop. Do not fix the tests to get
the commit through, and do not commit around them.
**An approval judges the change; it never promises that it builds**, and the two
must not be conflated by a skill acting on someone's behalf.

**Then record what it produced**, so the page shows the outcome rather than the
intent:

```
skitterspec spec-env review <spec> --outcome "committed <sha> via <skill|by hand>"
```

That writes the outcome onto the decision the engine already logged and
re-renders the page, where it reads as history beneath the verdict bar. On a
failed commit there is no outcome to record — say what failed instead.

**Nothing is pushed.** The commit is local, exactly as `/commit` leaves it.

### `commit-continue` — then the next phase, and no further

On `commit-continue`, once the commit is in, carry on into **`/spec-next`**.
That is the whole of the chaining, and both halves of that sentence matter:

- **A failed commit is the end of the chain.** If typecheck or the tests fail
  there is no commit, and therefore no continue — report where it broke and
  stop. The continue is downstream of the commit, not beside it.
- **Never `/spec-complete`.** When there is no unfinished phase left, say the
  spec has none and stop. Completing
  **lands the branch and tears the worktree down**, and that must not fall out
  of a button labelled *continue* — the
  distance between "build the next phase" and "delete the worktree" is one skill
  name, and a person pressing a button on a phone cannot see which one you
  picked.

**This overturns a recorded Non-goal, and cites it rather than contradicting it.**
`feat-review-verdict` ruled chaining out: *"'Commit what I just read' and
'go build the next thing unattended' are different sizes of decision, and the
second stays a keystroke."* That conflated two meanings of unattended — nobody
choosing, and nobody watching. A distinctly-labelled fourth button is chosen,
deliberately, by the person who just read the diff. The ban was right about an
*automatic* chain and caught a chosen one by accident.

**Passes waiting are information — and worth raising.** A render lists them
when the holding area is not empty: code, verdict, age, one per line. Nothing
counts them and nothing refuses over them; a pass nobody claims simply sits
there. But **say so** — an operator who pressed a button on their phone and hears
nothing has no way to tell a pass that never arrived from one waiting to be
confirmed, and both look like silence. Raising it is step 0's offer; never
treating it as a task is the rule that survives.

**A mark is information, never a gate.** Nothing counts the ticks or requires
them: a phase may end with comments open, `/spec-complete` never learns about
them, and this skill refuses nothing on their account. If a project ever wants
otherwise that is a config key defaulting to off — not a tidy-up here.

**What the intake costs, and why a code costs less.** A pasted blob is file
paths and the operator's own words, which you need in context to act on them —
so the paste is not overhead. But it does scale with the review: a marked-up
60-file pass is kilobytes of context before any work starts.

**A claimed pass never enters the context at all.** The engine holds it, merges
it and reports the counts; six digits is what reaches you. That is the same rule
the diff already follows — git writes it, the engine splices it, you never read
it — and the paste was the one place it broke. The *work* either authorises is
ordinary phase-sized cost, and step 3 is where the operator decides whether to
spend it.

## 2b. An action changes something, then hands the page back

Only on a pass carrying an **action**. Three of them, and
**all three end the same way**:
do the thing, re-render (§4), and wait again (§4b) — because the reader
still has a decision in front of them and has not made it.

| Action | Do | Then |
|--------|----|------|
| `live-on` | commit first (below), then `skitterspec spec-env live take <spec>` | re-render `--branch`, wait again |
| `allow-network` | `skitterspec spec-env review allow network` | re-render, wait again |
| `allow-remote` | `skitterspec spec-env review allow remote <spec> --set on` | publish (§6), re-render, wait again |

**THERE IS NO `live-off`, and its absence is deliberate.** Putting *this* change
live is about the diff on screen; handing the whole instance back to `main` is a
workspace decision with nothing to do with this review. The `live:` line names
`/spec-live main` for it — a command the operator types, which is also why no
skill runs it.

**AN ACTION IS NOT A VERDICT, and the gate is untouched by all three.** A phase
that ended armed the gate, and it is discharged by a committing verdict or a
recorded skip and by nothing else — so after any of these the phase still owes
an answer, and that is exactly why the run waits again rather than finishing.
The engine enforces this rather than trusting it: `ACTIONS` is disjoint from
`VERDICTS` and `COMMITTING`, so nothing that routes on a verdict can see one.

**`live-on` commits first, and the commit is a precondition rather than an answer.**
`live take` refuses a dirty worktree, and even without that guard
uncommitted work stays behind in the worktree — so what went live would be the
*previous* commit while the page claimed to be showing this one. Hand off to
`review.commitWith` exactly as §2a does (do not restate its rules here), then
take the instance. The reader has not approved anything by pressing it.

**The gate permits that one commit, and nothing more.** A phase that ended
armed the gate, so the commit this action needs is the very commit the gate
refuses — which made the press unachievable in the only state it is offered in.
Claiming a `live-on` pass therefore records a **permit** on the gate, bound to
the worktree's HEAD, and the commit hook honours it. It dies the moment that
commit lands, so a second one is refused exactly as before, and the gate stays
**armed** throughout: the phase still owes a verdict and `/spec-next` still
refuses to build the next one. Nothing is typed to get it — if a commit here is
still refused, that is the ordinary gate and the exits are the ordinary three.

**It re-renders `--branch` afterwards**, because the working view is now empty:
the commit just happened, and the branch range is what still answers "what am I
looking at". §4's clean-tree fallback reaches the same place on its own, so
passing `--branch` is belt and braces rather than a separate rule.

**A mid-phase page does not get the commit.** Where the render took
`--buttons midrun`, the work is half a phase — committing it to look at it
running splits one phase across two commits and leaves a mess nobody asked for.
Say the phase needs to land first, re-render, and wait.

**Relay every refusal, and work around none of them.** `live take` refuses a
workbench another spec holds, a hotfix, a stateful spec, a branch touching
migrations, and a tree with no dev server listening. Each refusal names its own
way out. **Never park another spec's live session** to make room — that is
someone else's work, and freeing it is their decision. Re-render and wait, so
the reader can choose something else.

**A refusal may declare the way out of itself.** Ask with
`skitterspec spec-env live take <spec> --json` and read its `offer` field:
where one is present, relay the refusal and **then** offer it, exactly as
`.claude/rules/offered-unblocks.md` describes. Do not re-decide from the reason
text, and do not infer an offer that is not there — the boundary that keeps
another spec's workbench out of this lives in that field rather than in prose
here.

**`allow network` writes a committed file, and that is worth a sentence.** It
edits `specs/.core/env.config.json` in the **primary checkout**, so it changes
behaviour for everyone who pulls and leaves that tree dirty — one server binds
for every spec, so the bind cannot be narrower. The engine prints the absolute
path; relay that rather than letting a shared setting change land silently.
**`allow remote` is per spec** and writes only a gitignored sidecar beside the
page, so the base branch stays clean and no other spec may publish. And it is **enable-only**: there is no
action that turns a tier off, because turning `network` off from a page reached
over the network kills the page doing the turning.

**`allow remote` permits publishing. It does not publish by itself.**
Publishing stays an explicit ask (§6), because the page it leaves behind is one
this tooling cannot remove. A reader who presses `Allow remote` on the page, or
types `/spec-remote-review` beside a waiting review, **has** asked: the engine
names the page on its `review:`/`publish:` lines, and that page is published
and the stack re-shown. Nothing it does not name is published.

## 3. Gate it on nothing

**This skill has no preconditions and must never grow one.** Not tests passing,
not the phase being finished, not the spec being this session's, not a clean
tree. Reviewing work in progress is the *common* case — half a phase, a hand
edit, a colleague's branch — and a gate would refuse at exactly the moment
someone wants to look.

If a later edit is tempted to add "only when the phase is complete", the answer
is no. The page is free to produce and changes nothing. The same goes for the
marks: a spec with unread files or open comments is an ordinary spec, and
nothing here may start counting them.

**And this skill never arms the gate.** Arming is `/spec-next`'s, at the one
moment that means something: a phase ended. Rendering mid-phase — the common
case this skill exists for — must not create an obligation, because then
looking at your own work halfway through would owe you a verdict on it. Reading
is free; ending a phase is what is answerable.

An **already-armed** gate is a different matter, and it is not this skill's to
enforce either: `/spec-next` §2 is where that refusal lives. Here it is only
context — the render says a verdict is owed, and this skill's whole job is to
help someone give one.

## 4. Render the page — or serve it

```
skitterspec spec-env review <spec>              # uncommitted work (the default)
skitterspec spec-env review <spec> --branch     # everything since the base branch
skitterspec spec-env review <spec> --run-reviewers   # …and run review.reviewers
skitterspec spec-env review serve               # every spec, on localhost
```

**`--run-reviewers` is opt-in here, and a BARE `/spec-diff` MUST NOT PASS IT.**
`/spec-next` runs the project's configured reviewers once per phase, where the
cost is paid against work that is finished. This skill answers at any point,
including several times in one phase — and each run spends a review against
whatever hourly limit the reviewer has, which on the tiers this was built for is
measured in single figures.

So pass it when the operator asked for it: `/spec-diff --reviewers`, or they said
in words that they want the second opinion. Otherwise render without it. The
cached findings from the phase-end run still show on the page whenever the diff
has not moved, so the usual mid-phase read loses nothing by not asking.

Where it does run, say what it cost — a reviewer takes 30s–3min — and nothing
else. The page's own strip reports each reviewer's outcome, and a reviewer that
could not run is that strip's business rather than yours.

**There is no switch left to handle.** The engine serves and prints a **stack** —
one line per tier, `local`, `network`, `remote`, each either a URL or the one
command that turns it on. All of it is free and none of it publishes anything.
You are not choosing between them; you are relaying every line it printed.
`.claude/rules/spec-reports.md` carries the shape and why.

The operator who does not want a LAN listener sets `review.allowNetwork: false`
in `env.config.json` — `network` then reads `off` with the command that turns it
back on, and `local` is the loopback page. Turning serving off entirely is
`review.serve: "never"`, and then `local` is the `file://` page, which says on
its own line that it cannot send a verdict.

`serve` renders **per request**, so nothing it shows can be stale, and it lists
every spec with a worktree rather than one. `--host 0.0.0.0` binds beyond
loopback and prints a URL a phone on the same network can open, guarded by an
unguessable path token. Bare, it binds loopback only. It is a process:
`--status` says whether one is up, `--stop` takes it down.

Default to the working tree — "what did this phase just do". Use `--branch` when
the question is about the whole spec.

**You do not have to reach for `--branch` after a commit.** A clean working tree
is the state a phase *ends* in, so the engine falls back to the branch range by
itself and says which it is showing — `(working tree clean — since main)` in the
header line, and `(working tree clean)` on the page. Report that wording as it
came rather than calling it the working tree.

The fallback fires on exactly one state — no `--branch`, and nothing uncommitted
to show. An explicit `--branch` always means what it says, a tree with real
changes is never swapped out from under you, and a branch with no work at all
still reports `nothing to review` exactly as before.

Add `--json` to get the file list, totals and the page path back as data. The
page is written to `.spec-env/reviews/<spec>.html`, which is gitignored — it
leaves no trace in the branch under review.

**Declare the button set when the work is unfinished.** A page rendered part-way
through a run takes `--buttons midrun`, and offers `Continue` — *I have read it,
carry on* — in place of `Commit` and `Commit & Continue`:

```
skitterspec spec-env review <spec> --buttons midrun
```

**It is a statement about the work, never a reading of the gate.** Ask whether
the thing you just rendered is *finished*: a phase that ended, a bug fix that is
green, a spec about to land — committing set, which is the default, so pass
nothing. Half a phase, a hand edit, a colleague's branch mid-flight, anything
the operator asked to look at while it is still moving — `midrun`.

**Do not derive it from whether the gate is armed.** That is tidier and wrong: a
project running `review.required: false` never arms at all, so every one of its
pages would lose the committing buttons and its reader could never commit from
the page. The caller knows what it rendered; the gate only knows whether the
project opted into gating.

`Continue` is not the removed `none` verdict. `none` recorded itself and did
nothing; `Continue` **resumes the run**, so it still names an action. What it
cannot do is commit, or clear a gate a finished phase armed — that takes a
committing verdict or a recorded skip.

**On `--page-only`, stop here** and report the path.

## 4a. Relay the stack — every tier, never one you picked

`spec-env review` prints one line per tier and `--json` carries the same thing
as `tiers`. **Relay all of them, in that order**, whatever the `reader:` line
says:

| Tier | Carries |
|------|---------|
| `local` | the loopback URL — or the `file://` page when nothing served, which says it cannot send a verdict |
| `network` | the LAN URL and any `also:` alternates under it — or `off` with the command that turns it on |
| `remote` | the published URL and *a verdict here needs `/spec-reviewed`* — or `off` with the command that turns it on |

**The `reader:` line decides nothing here any more.** It is still printed and
still the only place that question is answered, but the offer no longer branches
on it — because branching on it is what produced a `file://` page for a session
detected `unknown`, a LAN URL for a phone off the network, and an address that
changed underneath a reader mid-session. A tier that is off keeps its line, so a
reader who has left the house can see the surface exists and ask for it.

**Never read an environment variable to decide anything about the offer.** Not
`SSH_CONNECTION`, not `CLAUDE_CODE_*`, not a tty check — there is nothing left
for a detection to decide, and a second implementation of one could not be
tested and would drift. The ranking and the traps
(`CLAUDE_CODE_ENTRYPOINT` describes the *process*, not the reader; stdin is never
a tty under Claude Code) live in `review.js` beside the code, which is where they
belong.

**It authorises serving, never publishing.** A `remote` reader authorises a
local server — one process, ended by one flag, leaving nothing behind — and
nothing more. Publishing leaves a page this tooling cannot remove, so it is an
ask, in every case, always. The two were once one rule, and lumping them together
is what left a remote reader holding a dead link: see
`specs/complete/bug-remote-reader-gets-a-dead-link/`.

When serving fails — a busy port, or a machine with no network address — the
engine falls back to the `file://` URL with its marker and nothing breaks. That
is the one case where naming publishing is worth doing, because it is the only
answer left.

`review.reader` in `env.config.json` (`local` · `remote` · `detect`) lets the
operator settle where they are reading, and an explicit value is believed without
sniffing. What the engine may *do* is settled by the tier settings instead —
`review.serve` (`always` · `never`), `review.allowNetwork` and
`review.allowRemote` — not by the reader.

## 4b. Wait for the verdict — because asking for one means waiting for it

A served page can hand its pass back the moment it is pressed. Without a wait,
that pass lands in the holding area and stops — nothing happens until someone
types `/spec-reviewed`, so the review and the work carrying on are two separate
acts joined only by the operator remembering.
**This is the step that joins them**, and it is this skill's, so `/spec-next` can point here rather than
keeping a second copy.

**The rule is `.claude/rules/spec-reports.md`'s: asking implies waiting.** If
this render asks the reader for a verdict, it waits for one. If it is not going
to wait, it does not ask — the report names the page and its size and stops
there. There is no third option, and in particular there is no *ask now, notice
later*: that is the shape that stranded two passes on one spec, where the run
said the page was **ready** rather than that it was **waiting**.

**So the question is not "can I watch a file".** It is "am I asking?" — and the
transport only decides what carries the answer back:

- **A served page** posts to the local store; the engine's own wait returns when
  it lands, and the steps below run it.
- **A `file://` page** has nothing to post to, so the reader pastes the pass and
  their next message carries it. Say you are holding and **end the turn** — that
  is the same wait, carried by the conversation. It is not a lesser one.
- **A published page** writes to the artifact's own store, which nothing reaches
  from here. That is the one case where the honest sentence is *press a verdict,
  then type `/spec-reviewed`* — see the published-page paragraph below.

**Do not ask, and therefore do not wait, on a render nobody is waiting behind** —
a bare `--page-only`, a page produced alongside other work, a pass that has
already arrived. Those get the `Review` row, no question, and nothing is owed.

1. **Note the moment**, as an ISO timestamp, before you start. That instant is
   the entire scope of what may be claimed without a person naming it.
2. **Run the engine's wait, and end your turn** — under the harness's
   persistent watch primitive where one exists, else in the background
   (`.claude/rules/spec-reports.md` carries the preference):

   ```
   skitterspec spec-env review wait <spec> --since <timestamp>
   ```

   **Never a watcher of your own, and never a timeout.** It lasts as long as the
   session, because a reader who walks away from a diff is the normal case — and
   a loop composed here would be proven by nothing, which is how one written as
   `[ "$x" \> "$y" ]` spun for five minutes in zsh and looked exactly like
   patience. `/spec-next` §5 carries the full account.

   Not a poll and not a held-open turn: the operator has their terminal back,
   and the session costs nothing while they read.
3. **On waking, let the engine choose:**

   ```
   skitterspec spec-env review <spec> --claim-since <timestamp> --json
   ```

   Three answers, and only one of them acts. One pass in the window — that is
   the pass, claimed and merged exactly as `--claim` would. **None** — ordinary;
   the file changed for some other reason, so say nothing and wait again or
   stop. **Two or more** — it refuses and names the count, never the codes; that
   is §2 step 0's two-passes case, so offer them from the render and ask.
4. **Route on the verdict** through §2 step 2 onward. A claim is a delivery
   mechanism; nothing downstream may behave differently because a watch woke
   you rather than a person typing.

**What holds this up.** Not "the page cannot reach the conversation" — after
this step it can, deliberately. Two things replace it. The **serve token** is
48 bits of `crypto` randomness in the URL path, minted per server, and it
decides who can POST at all. The **window** decides which pass is yours: a pass
sitting there before you started waiting is never swept up, which is precisely
the stranger's pass the old rule was written about, and two arrivals refuse
rather than pick. What is left of the old rule is unchanged and still absolute —
outside this window, a pass is claimed because a person named it.

**The wait covers the SERVED page and nothing else.** It watches the engine's
local store, which is where a served page POSTs. A **published** page writes to
the artifact's own store instead, and no watch of any kind reaches that — so a
verdict pressed there is invisible until someone asks for it. Never start a
wait and then hand over a published link under it: that reads as a promise to
notice, and it was made three times in a row while three verdicts sat unread.
Where the page is published, say plainly that `/spec-reviewed` is what picks it
up.

**`/spec-reviewed` is not replaced by this.** It stays the way in for a pass
that arrived when nobody was waiting, for the two-passes case, and for every
published page. It is user-only, and that is still the
enforcement that makes a named claim a person's decision.

**A harness with no file-watch is no longer on that list**, and that is the
change. It used to be — the row and `/spec-reviewed` were "the whole story",
which read as permission to ask without waiting. Now the turn ending is the
wait, and every harness can end a turn; `/spec-reviewed` remains available
there, as it is everywhere, for a pass nobody was holding for.

## 5. Offer the written review — say what it costs first

The page is free. The **written review is not**, and it costs in two separate
ways. Quote the one that actually applies rather than a single number:

- **Writing it: ~700 output tokens.** The review JSON, near enough regardless of
  how big the diff is. This is unavoidable and it is what was measured.
- **Reading the diff: input, and it scales.** Only paid when the diff is not
  already in front of you. A 350-line diff is easily 10–15k input tokens.

**If you just built this phase, you already have the diff — do not re-read it.**
That is the common case (`/spec-next` offers this skill the moment a phase ends)
and the one the ~700 was measured in. Running `git diff` over code you wrote
three tool calls ago buys nothing and is not free.

**When you genuinely do not have it** — a fresh session, half a phase from
yesterday, a colleague's branch — read *selectively*. `--json` returns the file
list with each file's `+`/`−`, `status` and `noise` flag and **no patches**, so
use it to choose: skip everything marked `noise: true`, and skip files the review
will not have anything to say about. Pulling the whole diff in when three files
matter is the avoidable half of this cost.

Say what it will cost, then let the operator decide. Do not write it unasked when
the diff is large.

When asked, write JSON to a scratch file:

```json
{
  "summary": "Two or three sentences on what this phase actually did, read from the diff.",
  "checks": [
    { "level": "flag",    "file": "src/env/review.js", "note": "…" },
    { "level": "confirm", "file": "test/env-review.test.js", "note": "…" },
    { "level": "good",    "file": "src/cli.js", "note": "…" }
  ]
}
```

- **`flag`** — something you believe is wrong. **`confirm`** — something only the
  author can settle. **`good`** — a decision worth keeping, said once.
- Every check names the file it is about.
- **Review the diff, not the spec.** Keep to what the change shows; do not
  re-derive the plan or restate the spec's reasoning back at its author.

Then re-render with it spliced in — the engine renders it, you never emit HTML:

```
skitterspec spec-env review <spec> --review <file>
```

## 6. Publish only when asked

**Never publish unprompted.** Publishing leaves something behind that this
tooling cannot remove, and the page already works as a local file. Offer it;
do not assume it.

When the user asks:

- **One spec is one page.** `--json` reports `url` when this spec has been
  published before. If it has, **update that URL** rather than creating a
  second entry, and label the new version for the phase (`phase-3`).
- **On the first publish**, write the returned URL to the path `--json` reports
  as `urlFile` — one line, no formatting. That file is how every later phase
  finds the same page. Never construct the path yourself.
- **Say, once, that it is theirs now.** When you report a URL, say in the same
  breath that skitterspec cannot remove the page and that `/artifacts` (or the
  gallery at `claude.ai/code/artifacts`) is where it goes. This is the moment the
  decision is being made, so it is the moment worth saying it — `spec-env down`
  repeats it at teardown, by which point the page has outlived the spec.
- **Degrade in one line.** If the harness cannot publish — no capability, an
  error — say so, report the local file path, and carry on. That is a working
  outcome, not a failure.
- **Reach for `--publish-copy`, never a hand transform.** The engine writes the
  page as a complete HTML document and an artifact host wraps page *content*, so
  publishing the page as-written nests two documents. `spec-env review <spec>
  --publish-copy` emits the body-only copy and names its path on a `publish:`
  line. Do not split the document yourself: a rendered page contains the diff,
  and a diff of this project contains `<!doctype html>` as ordinary patch text.

The engine knows nothing about publishing and cannot do it. It writes a file and
reads a URL back as an opaque string; everything about what that string means
lives here.

### Publish it so the buttons still work

A published page is the answer for a reader **no local server can reach** — a
phone on mobile data, anyone away from the LAN the engine serves on. It is also
the one surface where the verdict buttons have nowhere to POST: the page's own
URL is on claude.ai, so a POST fails and the reader gets "could not reach the
server" after pressing a verdict they meant.

So **publish it with a store**, and the page uses it:

- Declare `capabilities: {db: {}}`. The page checks for `window.claude.use` and
  writes the pass into the artifact's own `passes` collection instead of
  POSTing. Nothing else about it changes — same marks, same verdicts, same
  refusal to commit over an open comment.
- **Do not declare `user`.** The pass is not per-viewer private state, a shared
  collection is what it wants, and a declaration nothing uses is a grant asked
  for nothing.
- **Same file path every time**, so a redeploy reuses the URL. That is what
  answers the clear-down worry: one page per spec, replaced at each render,
  rather than an artifact per phase accumulating in the gallery.
- **Send a push notification with the URL** when you publish. The reader is by
  definition somewhere else — that is why it was published.

### Taking a stored pass back

A pass in the store is claimed the same way in spirit and a different way in
mechanism, because the engine cannot see it:

1. Read the `passes` collection with the Artifact tool's `read_db`.
2. **Apply step 0 unchanged.** One waiting pass, offered by what it says and
   when it was sent; two is a refusal to guess. Nothing here is automatic —
   there is no wait window on this transport, because nothing pushes from the
   store to this conversation.
3. Write the pass's `blob` to a scratch file **verbatim** and merge it with
   `spec-env review <spec> --notes <file>`. It rejoins the ordinary path at §2
   step 1, so the verdict is judged and routed exactly as any other.
4. **Delete the document** with `write_db` once it is merged. A claim consumes:
   a pass left in the store is claimable twice, which is the one property the
   six-digit code has always had and this transport must not lose.

## 7. Report

End with the block defined in `.claude/rules/spec-reports.md`. That file carries
the shape; this section carries only what is specific here.

**Verdicts**

- `✅` — the page is rendered, and any review pass handed back was stored and
  acted on.
- `⚠️` — rendered, with something worth knowing: accepts that lapsed because the
  file changed, comments left unworked because the operator did not say go.
- `❌` — a render or a fix failed part-way. Quote it.
- `⏸` — the spec has no worktree. Say that plainly: a spec that has not been
  started has nothing to diff, which is an ordinary state and not an error.

**Fields:** `Built` · `Tests` · `Notes` · `Review` · `Follow-ups` · `Next`

## 7a. End in a picker

Offer the same four endings `/spec-next` §6a defines — `Reviewed` · `Commit` ·
`Commit & Continue` · `Discuss` — under the same conditions, including
`Reviewed` only when a pass is waiting, and the rule that nothing claims a pass
without a pick. That section owns the wording; do not restate it.

**This is where changing your mind is handled, and that is why it belongs here.**
`/spec-diff` renders the page, so it is the command someone runs when they look
again — often at a review they have already voted on. A pass they sent is still
sitting **unclaimed**, so a pick made here **supersedes** it:

- act on the pick,
- drop the waiting pass (`--drop <code>`),
- and say both happened, naming the verdict that was dropped.

**Never carry both.** A stored verdict alongside a fresh one is two standing
conclusions about one review, and whichever a later run picked up would be a
coin toss. One ending, most recently chosen — the same rule that makes a verdict
consumed rather than stored.

**Say what was dropped rather than dropping it quietly.** Someone who pressed
`Commit` on their phone and then picks `Discuss` here has changed their mind on
purpose; someone who forgot they had voted has not, and only the report tells
them apart.

`Review` carries the files and `+`/`−`, and the tier stack — labelled, run
together with `·` because a row is one cell. Where the page holds a review pass, it also
carries the three totals — files accepted, comments open, comments answered.
`--json` reports those under `notes.totals`; read that, never the diff.

`Built` appears only when this run actually changed code — the commented files
it worked on your go-ahead. A render on its own built nothing, and an empty
`Built` line claiming otherwise is worse than no field.

`Tests` and a commit appear only on a committing verdict (§2a).
**Say which path made the commit** — the configured skill by name, or by hand —
in the same row as the sha. A reader cannot tell a `/commit` from a hand-rolled one after the
fact, so the run that made it is the only place that distinction can be
recorded.

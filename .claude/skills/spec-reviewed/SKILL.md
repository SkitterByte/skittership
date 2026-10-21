---
name: spec-reviewed
description: Pick up the review you approved on the page — run it bare to pick up the single waiting pass, paste the six-digit code off the page ("/spec-reviewed 608223") to name one exactly, or pass the verdict itself ("/spec-reviewed commit") when the page could not send and copied you a command instead. Use when the user says "/spec-reviewed", "I approved it", "I've reviewed it", "pick up my review", "I pressed approve", or otherwise says they have finished reviewing a rendered diff.
disable-model-invocation: true
---

# /spec-reviewed — pick up the review you just approved

> Stay silent while this runs — speak only to ask something you cannot answer
> yourself, or to report a failure at the moment it happens. Read
> `.claude/rules/spec-reports.md` before reporting; it defines the block this
> skill ends with.

You read the diff somewhere else, pressed a verdict, and the engine is holding
the pass. This is how it gets picked up.

## What this is for, now that the picker exists

`/spec-next` and `/spec-diff` both end in a picker carrying these same endings,
so the usual way to pick a review up is to choose one there. This command is
what covers the case that picker cannot.

**A picker is consumed when the turn ends.** Nobody scrolls back and answers one
an hour later. So a review read over lunch, a session cleared, a fresh terminal
tomorrow morning — in every one of those the control is gone and the pass is
still waiting, and this is the way in. That is a narrower job than it once had,
and not an absent one.

**It is also the only claim path the harness itself enforces** — see below.
Deleting this skill as redundant with the picker would leave no path that has
the mechanism at all, only paths that have the property.

## Why this is user-only, and why that is the whole point

`disable-model-invocation: true` is not ergonomics here — it is the enforcement
of `/spec-diff` step 0's central rule:
**never claim a pass you were not asked to claim**.

That rule exists because a review pass can be POSTed by anything that reaches
the page. So a stranger's pass sits in the holding area — unless an agent goes
and fetches it, which is exactly what happened once: an agent found a waiting
approval, read its code off disk, claimed it, and reported the round-trip
working.

Prose alone did not prevent that. The harness does —
**the model cannot invoke this skill** — so a pass picked up *this way* is only
ever picked up because a person typed the command. Typing it *is* the human
signal. A later edit that makes this skill model-invocable does not make it more
convenient — it removes the only thing standing between a stray approval and
someone's repo.

**There is exactly one other way in, and it is bounded rather than trusting.**
A phase that ends waits on its page, and a pass arriving *during that wait* is
claimed by the engine (`--claim-since`, `/spec-diff` §4b): scoped to the window,
acting on nothing when no pass arrived, refusing when two did. A pass already
sitting there when the wait began is never swept up by it — which is the
stranger's pass this whole rule was written about. Everything outside that
window still comes through here.

## 1. Resolve the spec

Bare, exactly as every other bare command in this workflow: the worktree you are
standing in, else the sole provisioned spec. Ask the engine rather than guessing:

```
skitterspec spec-env resolve
```

Several provisioned and none resolved is a refusal — relay its list and stop,
never pick from it. See `.claude/rules/spec-planning.md`; do not restate the
rule here.

**Four argument shapes, and they cannot collide.** A **six-digit code**
matches `^\d{6}$`; a **verdict** is one of a closed list of six words;
a **tracker id** carries a letter and a hyphen;
a **spec name** is none of them and always carries a lifecycle prefix
(`feat-`, `bug-`, `hotfix-`), which no verdict does. So the parse needs no flag,
and nothing has to be guessed at from context.

A **six-digit code** is a pass the operator read off their own page. It says
**which pass**, not which spec — so resolve the spec exactly as a bare
invocation does, above, and claim the code *there*. Then go to step 4 — a named
pass has nothing to disambiguate.

A **verdict word** — `commit`, `commit-continue`, `commit-start`,
`commit-land`, `continue`, `changes`, `discuss` — is the conclusion itself,
arriving without a pass behind it. It is
what a **`file://` page** hands over: that page has no server to POST to and no
store to write to, so it copies a command instead of sending anything, and this
is the command. Resolve the spec as a bare invocation does, then send the word
through the engine:

```
skitterspec spec-env review <spec> --verdict <word>
```

It joins the same merge a claimed pass goes through, so the routing in step 4
is unchanged: a commit over open notes is refused exactly as it would be, the
outcome log records it, and the gate a phase armed is cleared. Then go to step
4 — there is nothing to disambiguate.

**A word carries a verdict and nothing else**, and that is a property of the
transport, not a shortcut. Accepts and comments do not fit on a command line,
so the page only ever offers the words while the reader has marked nothing —
the moment they tick an accept or write a note it goes back to handing over the
blob. If someone tells you they marked things up *and* gives you a word, ask
for the pass: the word would land a verdict with their notes silently dropped.

A **name** targets that spec instead. A **tracker id** does too, but only
through a **provider seam**: the base knows nothing about tracker ids, so
resolve one by asking whichever provider is installed for its listing —

```
skitterspec spec-sync linked --json
```

— which answers `[{ spec, bucket, identifier }]`, and match on `identifier`.
**With no provider installed an id resolves to nothing**, and that is the right
answer rather than a guess: a `SKS-227`-shaped string is not evidence that a
tracker exists. Say the id matched no spec and stop.

## 1a. Targeting another spec? Get into its worktree first

**Only when the resolved spec's worktree is not where this session stands.**
Compare the `worktree:` line from `skitterspec spec-env resolve <spec>` against
cwd, resolving both paths first so a symlinked or trailing-slash spelling of one
tree does not read as two. **Same tree — say nothing and carry on.** That is the
ordinary case, and a line about it is narration.

**Different trees, and it matters for what comes after, not for the claim.**
Claiming is harmless from anywhere: the sidecar lives in the primary checkout.
But an honoured `commit` verdict **commits**, and `changes` **edits files**, and
both must land in *that spec's* worktree — done from here they would land in
this one, on the wrong branch, looking entirely normal at the time.

So **ask, then move**:

*"`feat-orders` lives in `../repo-wt/orders`, and picking its review up means
committing there — move this session over to carry on?"*

- **On a yes**, move with a plain `cd "<worktreePath>"`. That is the whole
  mechanism, exactly as `/spec-start` does it — not a tool call, because an
  approval prompt is unusable on a phone.
  Then **confirm the move landed** rather than assuming it
  (`.claude/rules/negative-checks.md` rule 1): run `skitterspec spec-env resolve`
  with no argument and check its `spec:` line names the target. If it does not,
  stop — do not claim a pass you are about to act on from a tree you could not
  confirm.
- **On a no, stop without claiming.** A pass claimed here and acted on there is
  exactly the split this guard exists to prevent, and claiming first would spend
  the code for nothing.

**A target with no worktree is a refusal.** There is nowhere for a commit to
land. Name it, suggest `/spec-start <name>`, and stop.

**Why not simply refuse unless you are on the base branch?** Because that bans a
legitimate case — standing in one spec, picking up another's review — while
*still* leaving the work to be done in a tree you are not in. The relocation is
needed either way, so the relocation is the guard.

## 2. Read what is waiting

```
skitterspec spec-env review <spec>
```

Its `pending:` block lists each waiting pass — code, verdict, age:

```
pending: 1 waiting
  792969 · commit · 1 min ago
```

**Never open `.spec-env/reviews/<spec>.pending.json`.** The render carries
everything a decision needs, so there is nothing to go looking for, and going
looking is the bypass step 0 forbids. The file is right there and readable; that
is precisely why the rule is written down rather than assumed.

**Check the store before concluding nothing is waiting.** Only when this spec
has a published page (`--json` reports a `url`): a reader off the LAN sent their
pass to the artifact's own `passes` collection rather than to the engine, so an
empty holding area is not an empty answer yet. Read it with the Artifact tool's
`read_db`, merge the `blob` through `--notes`, and **delete the document** —
`/spec-diff` §6 owns the whole sequence, including that a claim consumes.

**Nothing waiting in either is an ordinary answer.** Say so and stop. Do not hunt
through other specs, and do not treat an empty holding area as a problem — a
`file://` page copies to the clipboard instead of sending, so mention that the
pass may be on their clipboard waiting to be pasted, and finish.

## 3. One pass waiting? Act on it

**Claim it and go to step 4.** Do not read the code out, and do not ask whether
it is theirs. The operator typed this command, which is the whole signal — and
this skill is the one place in the workflow where that signal cannot be
manufactured, because the model cannot invoke it.

**The code was never an authorisation.** A later edit must not restore it as
one. It earned its keep when the *page* pushed: the agent went looking, found
a pass, and had to prove which one it had. What stops a stranger's approval
reaching your repo is not those six digits — it is that this command cannot be
typed by anything but a person, and that the one automatic path (`--claim-since`)
is bounded by a window a stranger's pass falls outside of. The confirmation step
added nothing to either, and cost a round-trip on every review.

So the code has exactly one job left: **telling two passes apart**. That is
disambiguation, not a gate.

**Two or more waiting is a refusal to guess.** Name them all — code, verdict,
age — and ask which. Never take the newest, the oldest, or the only `commit`:
this is the one case where a stranger's pass really is sitting beside theirs,
and the six digits are the only thing that separates them.

*"Two are waiting — 792969 (commit, 1 min ago) and 324199 (commit-continue,
just now). Which is yours?"*

**A pasted code skips even that.** `/spec-reviewed 324199` names the pass
outright, so there is nothing to disambiguate and nothing to ask — claim it and
act.

**On "that isn't mine"**, leave it and offer to drop it:

```
skitterspec spec-env review <spec> --drop <code>
```

A pass that stays is reported on every render until the operator stops reading
the line — which is how the real one gets missed.

## 4. Claim it and act

```
skitterspec spec-env review <spec> --claim <code>
```

Then **route on the verdict exactly as `/spec-diff` §2 does** — its steps 2, 2a
and 4 own that routing, including the commit hand-off through
`review.commitWith` and what `commit-continue` does after it. Follow it; do not
restate it here, because two copies of a routing rule is how the two come to
disagree.

That includes the one rule worth knowing before you invoke anything:
`commit-continue` runs `/spec-next` and **stops there**. It never completes,
lands or tears anything down.

**A code that matches nothing refuses, and names nothing.** The engine answers
that way and you relay it unchanged: do not list what *is* waiting, and never
fall back to "the only one". Both would hand a guesser the answer, and the
second is exactly the fallback that would let an unread pass through. A mistyped
digit is the ordinary cause — say the code matched nothing and let the operator
look again.

That holds whichever door the code came through, the paste included. A wrong
code is a wrong code.

A claim is a **delivery mechanism, not a second kind of review**: a pass that
arrived this way means exactly what the same pass pasted into the chat would
mean — or picked from `/spec-next`'s picker, which is the same conclusion
reached by a third route.

## 5. Report

End with the block defined in `.claude/rules/spec-reports.md`. That file carries
the shape; this section carries only what is specific here.

**Verdicts**

- `✅` — a pass was claimed and its verdict acted on.
- `⚠️` — claimed and acted on, with something worth knowing.
- `❌` — it acted and stopped part-way; the commit failed, or the work did.
  Quote it.
- `⏸` — nothing was waiting, the operator said the waiting pass was not theirs,
  they declined the move to another spec's worktree, or the target has no
  worktree at all. Nothing changed, and none of those is a failure.

**Fields:** `Tracker` · `Branch` · `Built` · `Tests` · `Worktree` ·
`Follow-ups` · `Next`

`Worktree` appears only when this run **moved the session** — the path it moved
to, because the operator's next command depends on knowing where they now are.
A run that stayed put omits it.

`Built` is what the verdict produced — the commit, or the commented files
worked. A run that claimed nothing built nothing and omits it.

# Offered Unblocks

A refusal says what is wrong. Some refusals can also say **what would fix it**,
and where the engine declares that, a skill may offer it rather than leaving the
operator at a dead end.

This file is the whole contract. A skill's own text says only *that* it acts on
an offer, never how.

## The engine declares; the skill relays

An offer is a field on a refusal, never a judgement a caller makes from the
reason text:

```json
{
  "blocked": true,
  "reason": "feat-x's worktree has uncommitted changes — commit or stash them…",
  "offer": { "kind": "satisfy", "label": "Commit first, then go live", "command": "/commit" }
}
```

**Absent stays absent.** Most refusals carry no `offer` at all, and that is the
correct, common answer. Where there is none, relay the refusal and stop.

**Never infer one.** If the engine did not declare an offer, there is not one —
however obviously the reason seems to name a fix. The boundary that matters most
lives in that decision, and it must not be re-litigated per skill:
**work that is not the operator's is never offered up.** A live workbench another
spec holds is that spec's operator's to free, so it declares nothing, and a
helpful picker is exactly how that would creep back in.

## Two kinds

| `kind` | Means | Recorded |
|--------|-------|----------|
| `satisfy` | do what the guard asked for | no — nothing was weakened |
| `bypass` | step past a guard still unsatisfied | **yes** |

## Relay first, then offer

In that order, and never instead. A picker that replaced the refusal would hide
what is wrong behind a choice about what to do next — and the refusal text is
where every exit is named, including the ones the picker does not offer.

Then, only where `offer` is present, put **two** options to the operator: the
offer's `label`, and Cancel.

- **`satisfy`** — run the command, then retry the original operation.
- **`bypass`** — run the command, then carry on.
- **Cancel** — stop. Record nothing: declining to bypass is not a decision
  anyone needs to audit.

**The label is the engine's, shown verbatim.** Never reword a bypass into
something easier-sounding, never pre-select it, and never add a third option. A
bypass that arrives pre-selected is a bypass by default wearing a question mark.

## A bypass is offered once per obligation

The engine enforces this; a skill does not count anything. Spend the offer by
recording it **when you raise the picker**:

```
skitterspec spec-env review gate <spec> --offered
```

After that the gate declares no offer for the same arming, so the next refused
commit is a plain refusal with its exits named in the text. A new phase ending
arms the gate again and is asked in its own right.

**Spent by being made, not by being taken.** An operator who declines still saw
it, and re-offering on every attempt is how a deliberate step becomes the
default.

**Do not spend it by reading.** `review gate --json` is asked on every
`/spec-next` run; only raising the picker spends the offer.

## What this is not

**Not a `--force`.** One was asked for and rejected: a reasonless lift is
indistinguishable from nobody having looked, where
`none: additive, nothing to revert` is a decision a reviewer can argue with. The
gate's exits are unchanged — a committing verdict, or a recorded skip — and a
bypass is the second of those at an address a person will reach.

**Not a replacement for the refusal.** A picker exists only in a harness. The
engine and the `PreToolUse` hook keep refusing regardless, so this is a layer on
top of a guard and never the guard itself.

**Not Claude lifting a guard aimed at Claude.** `spec-planning.md` draws that
line for `/allow-main` and `/spec-skip`, and a bypass offer survives it because
three things hold at once, where a `--force` had none of them:

1. **The operator answers.** Claude may raise the question and cannot answer it.
2. **The choice is recorded** — a fixed reason, distinct from anything typed,
   which shows on the next render as history.
3. **It is offered once**, held by the sidecar rather than by prose, so it
   survives a `/clear`, a compaction and a fresh session.

Remove any one of those and the objection returns.

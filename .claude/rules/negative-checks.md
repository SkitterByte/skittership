# Checks That Accuse

A check **accuses** when being wrong costs something: it deletes, it exits
non-zero, or it tells the user their code is broken. Those checks earn the four
rules below. An ordinary conditional does not — this is about the ones that act
on what they conclude.

Almost every accusation begins as an **absence**: a name not in a list, a
directory not on disk, a version not in a response. An absence is evidence only
once you have established that the lookup could have seen the thing. Three
times in one day, in unrelated code, we established nothing and acted anyway:

| Absence observed | Concluded | What had blinded the lookup |
|------------------|-----------|-----------------------------|
| ref not in the issue list | "it does not exist" | the query excluded archived issues, and capped at 250 |
| version not in the registry's list | "the publish failed" | the registry is eventually consistent |
| lifecycle folder not on disk | "half-installed" | git does not store an empty directory |

The bills: 146 healthy refs accused, a valid release tag deleted, a non-zero
exit on a healthy repo. Each blind spot was knowable in advance.

## 1. Prefer a positive signal to an absence

Assert something that must be **present**, not something that must not be
missing. A positive signal fails loudly when you are wrong about it; an absence
fails silently whenever the lookup was narrower than you assumed.

The scaffold check above stopped asking "is the lifecycle folder there?" — a
folder git drops as soon as it empties — and started asking whether the config
folder the installer always writes into is there. Same intent, and the new
question has an answer.

Where no positive signal exists, widen the lookup until absence means
something (include the archived rows, ask the API for the one id rather than
scanning a page) — or do not conclude.

## 2. Name the blind spot beside the check

A comment naming what could make this lookup lie is what makes the next reader
check it. Not what the code does — what would fool it:

```js
// A LIFECYCLE FOLDER IS NOT CHECKED, deliberately. git does not track empty
// directories, so it disappears whenever the bucket empties and returns the
// moment something lands in it.
```

Write it when you write the check, while you still know why it is safe.

## 3. Pair every accusation with a stays-silent test

For each accusing check, a test that feeds it a **healthy but unusual** input
and asserts it says nothing: the empty bucket, the archived record, the
just-published version, the file the user edited on purpose. The positive test
proves the check can fire; only this one proves it does not fire at everyone
else. All three incidents would have been caught by it, and prose alone had
already failed to prevent them.

## 4. Bias the unknown case toward inaction

Three states, not two: yes, no, and *cannot tell*. Route the third to the
harmless branch — skip, warn, keep, retry — never to the destructive one.

The install manifest classifies a file whose hash it does not recognise as
`customized` rather than stale, so a resync **keeps** it (`managedState`,
`packages/common/src/init.js`). An unrecognised hash could mean a user's edit or
a lost manifest; only one of those readings is safe to act on, so it takes that
one. Being wrong there costs a redundant file on disk. The opposite default
costs the user their work.

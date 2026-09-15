# Phase 2 — Fix the walk

**Goal:** turn phase 1's failing cases green by correcting the neighbour index
and the fallback guard, without disturbing the path every release takes.

## The change

`assets/scripts/lib/git-commits.cjs`, in `getCommitsSinceLastTag`:

```js
const currentIndex = allTags.indexOf(currentTag)
if (currentIndex < allTags.length - 1) {
  // allTags is newest-first, so the OLDER neighbour is at +1
  previousTag = allTags[currentIndex + 1]
} else {
  // This IS the oldest tag — fall back to the whole history
  ...unchanged...
}
```

Verified against the repro on an otherwise untouched 2.0.2 copy:

```
case 1  between releases : 1 -> [feat: three]   want 1 -> [feat: three]
case 2  HEAD at v1.1.0   : 1 -> [feat: two]     want 1 -> [feat: two]
```

## Tasks

- [ ] Apply the index fix above.
- [ ] Leave the `else` branch that runs when `currentTag` is null
      (`previousTag = allTags[0]`) **exactly as it is** — it depends on
      newest-first ordering and is the `npm version` path.
- [ ] Add a comment naming the blind spot beside the lookup: the list is
      newest-first, so `-1` is the newer neighbour and index 0 is the newest tag,
      not the first. Per `.claude/rules/negative-checks.md`, write it while the
      reason is fresh — the inverted reading is the trap, and it is invisible at
      the call site.
- [ ] Check the same inverted assumption has not been copied elsewhere:
      `grep -n "allTags\[" assets/scripts/lib/git-commits.cjs` and review each
      hit. `getAllVersionTags` consumers in the retro paths compute their
      neighbour at `idx + 1` and are already correct — confirm, don't assume.
- [ ] Run `pnpm test` — every case from phase 1 green, including case E.
- [ ] Re-run the repro from the handoff document against the working tree and
      paste both lines into the spec changelog.
- [ ] Sanity-check against a real repo with many tags: regenerate in a scratch
      clone and confirm the newest section covers one release, not the history.

## Release note

This is user-visible for consumers, and it has an aftermath worth stating: a
project that ran `npm run changelog` or `npm run releases` outside `npm version`
has a polluted file that regenerating will not silently repair. Draft:

```
Release-Note: Regenerating notes on demand (`npm run changelog` /
`npm run releases`) now covers just the release being generated, instead of
rewriting the section with the project's entire history. If you ran either
command between releases and kept the result, regenerate that version's
section — it was written from the wrong commit range.
```

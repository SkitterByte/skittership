# Every release gets a RELEASES.md section

> **Type:** Feature
> **Name:** feat-empty-release-notes
> **Status:** Ready — not started
> **Author:** Reuben Greaves
> **Developer:** —
> **Raised:** 2026-10-21
> **Area:** assets/scripts/generate-releases.cjs, assets/scripts/lib/config.cjs, scripts/ (dogfood copies), README.md
> **Stack:** worktree

## Problem

`generate-releases.cjs` writes nothing when a release has no `Release-Note:`
footers — `updateReleases` logs "skipping" and `--retro` deletes or skips the
section. So after a devops-only release the app shows `36.0.4` while
`RELEASES.md` tops out at `36.0.3`, which reads as "the release didn't update
the doc". The newest section should always be the shipped version.

## Decisions

1. **A release with no notes gets a section anyway**, under the usual
   `## <version> — <date>` heading, body `No user-facing changes in this
   release.` — plain and honest; "maintenance / improvements" was rejected
   because it over-claims for a pure CI change.
2. **New config key `releases.emptyRelease`** in `skittership.config.json`:
   a non-empty string overrides the text; `false` restores today's skip;
   absent/`true` means the built-in text. **On by default**, so the fix reaches
   every project on upgrade — opt-in was rejected because the people caught out
   are exactly the ones who would never turn it on.
3. **`--retro` follows the same rule**: a tag with no notes is written with the
   placeholder instead of having its section removed or skipped. With
   `emptyRelease: false`, retro keeps today's remove-stale/skip behaviour.
4. **"No notes" means after filtering** — commits marked `Release-Note: none`,
   or footers on non-user-facing types, count as empty.
5. A placeholder section is an ordinary section: a later run that finds notes
   for that version replaces it via the existing upsert, and re-running over an
   unchanged tagged version reports "unchanged" exactly as it does today.

## Solution overview

- `config.cjs` normalises `releases.emptyRelease` to either a string (the text)
  or `null` (disabled); anything malformed falls back to the default text.
- `renderReleasesSection(version, date, notes, emptyText)` renders the heading +
  `emptyText` when `notes` is empty.
- `updateReleases` / `retroFillReleases` only take the old skip/remove branch
  when `emptyText` is `null`; otherwise they render and upsert as usual.

```
## 2.0.8 — 21 Oct 2026

No user-facing changes in this release.
```

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Config key | add | `releases.emptyRelease` (string \| `false`, default built-in text) |
| CLI command | update | `generate-releases.cjs` (live + `--retro`) writes a section for note-less releases |
| Business rule | update | RELEASES.md's newest section always matches the released version |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Live releases write a placeholder section, behind the new config key | ⬜ | [01-live-placeholder.md](01-live-placeholder.md) |
| 2 | `--retro` writes placeholders; docs updated | ⬜ | [02-retro-and-docs.md](02-retro-and-docs.md) |

## Open questions

- [ ] None

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-10-21 | Ready | backlog | Reuben Greaves |

## Changelog

- 2026-10-21 — Spec created.

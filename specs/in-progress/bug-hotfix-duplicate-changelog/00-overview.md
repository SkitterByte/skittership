# Bug: Cherry-picked hotfix commits listed twice in release notes

> **Type:** Bug
> **Name:** bug-hotfix-duplicate-changelog
> **Status:** In Progress — fixing (red test added)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-10-12
> **Area:** assets/scripts/lib/git-commits.cjs, assets/scripts/check-release-index.cjs

## Symptom

After a hotfix (tag `vX.Y.Z+1` cut on a branch from `vX.Y.Z`, fix commits
cherry-picked onto `main`), the next release from `main` lists the
cherry-picked copies again in `CHANGELOG.md` and `RELEASES.md`. Separately,
`npm version patch` on `main` computes the hotfix's version, regenerates and
commits, and only then fails on the existing tag.

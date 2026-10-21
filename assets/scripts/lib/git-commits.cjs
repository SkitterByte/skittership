'use strict'

/**
 * Shared git-history plumbing for the release artifact generators.
 *
 * Both `generate-changelog.cjs` (dev-facing CHANGELOG, from commit subjects) and
 * `generate-releases.cjs` (user-facing RELEASES, from `Release-Note:` footers)
 * walk the same tag ranges and parse the same conventional-commit format. This
 * module is the single source of that logic so the two generators cannot drift.
 *
 * Commit serialisation: git log emits `hash\0subject\0body\0` per commit (NUL
 * delimiters so multi-line bodies survive). `reconstructCommits` regroups the
 * flat NUL-split array back into per-commit `hash\0subject\0body` strings.
 *
 * A parsed commit is a plain object:
 *   { type, scope?, message, body?, hash, breaking }
 */

const { execSync } = require('node:child_process')

function getCommitsSinceLastTag(currentVersion, { onRange } = {}) {
  // The range is reported through a callback rather than a new return shape:
  // a wrong range and a right range both printed the same success line, which
  // is how an inverted index lived in a released package across versions.
  const report = (range) => {
    if (typeof onRange === 'function') onRange(range)
  }
  try {
    // Fetch tags to ensure they're available (important in CI)
    try {
      execSync('git fetch --tags --force', { encoding: 'utf-8', stdio: 'pipe' })
    } catch {
      // If fetch fails, continue - tags might already be available
    }

    // Get all tags sorted by version (newest first)
    const allTags = execSync('git tag --sort=-version:refname', {
      encoding: 'utf-8',
      stdio: 'pipe',
    })
      .trim()
      .split('\n')
      .filter((tag) => tag.trim().length > 0)

    // Determine the previous tag to compare against
    let previousTag = null
    let currentTag = null

    if (allTags.length === 0) {
      // No tags exist, get all commits
      const output = execSync('git log --pretty=format:"%h%x00%s%x00%b%x00" --no-merges', {
        encoding: 'utf-8',
        stdio: 'pipe',
      }).trim()

      report('all history — no tags')
      return reconstructCommits(output)
    }

    // Check if HEAD is at a tag
    try {
      currentTag = execSync('git describe --tags --exact-match HEAD', {
        encoding: 'utf-8',
        stdio: 'pipe',
      }).trim()
    } catch {
      // HEAD is not at a tag - try to get current branch/tag from environment
      // In CI, Build.SourceBranchName might be available
      const sourceBranch = process.env.BUILD_SOURCEBRANCHNAME || process.env.BUILD_SOURCEBRANCH
      if (sourceBranch && sourceBranch.startsWith('v')) {
        currentTag = sourceBranch
      } else if (currentVersion) {
        // Use the version parameter as fallback (e.g., "8.0.0" -> "v8.0.0")
        const versionTag = `v${currentVersion}`
        if (allTags.includes(versionTag)) {
          currentTag = versionTag
        }
      }
    }

    // The base is the nearest ANCESTOR release tag, never the newest tag by
    // sort. A hotfix branch has diverged from main, so the newest tag by sort
    // can be on a line this release never contained: on a second hotfix that
    // re-listed the first hotfix's commits, and on main after a suffix hotfix
    // (v1.0.0-hotfix.1 sorts above v1.0.0) it based the release on a tag
    // outside main's history. The ancestor is the release this one actually
    // builds on, so a fix cherry-picked to main is listed again in main's next
    // section — deliberately: environments that deploy main get it only then.
    //
    // RELEASE_BASE_TAG overrides it (the hotfix script passes it, and so did
    // consumers' local hotfix wrappers before this existed).
    const override = (process.env.RELEASE_BASE_TAG || '').trim()
    const overridden = override.length > 0
    if (currentTag && !allTags.includes(currentTag)) currentTag = null

    if (overridden) {
      if (!tagExists(override)) {
        throw baseTagError(`RELEASE_BASE_TAG=${override} is not a tag in this repository.`)
      }
      previousTag = override
    } else if (currentTag) {
      // HEAD is at a tag (or past it, via the version fallback): the base is
      // the nearest release tag BEFORE it.
      //
      // `npm version` never reaches this branch — the version being released
      // has no tag yet — so it is the manual path (`npm run changelog`
      // between releases) that depends on it.
      previousTag = nearestAncestorTag(`${currentTag}^`)
      if (!previousTag) {
        // This is the FIRST release in its history: everything up to and
        // including it. Bound by the tag, NOT bare `git log` — when currentTag
        // came from the version fallback, HEAD is past the tag, and an
        // unbounded log folds work done AFTER the release into the released
        // section.
        const output = execSync(
          `git log ${currentTag} --pretty=format:"%h%x00%s%x00%b%x00" --no-merges`,
          { encoding: 'utf-8', stdio: 'pipe' },
        ).trim()

        report(`all history through ${currentTag} — no earlier tag`)
        return reconstructCommits(output)
      }
    } else {
      previousTag = nearestAncestorTag('HEAD')
      if (!previousTag) {
        // Tags exist, yet none is an ancestor even after unshallowing. That
        // is either a first release on a branch cut before any tag, or a
        // history git cannot fully see — and the two cannot be told apart
        // from here. Listing all history would rewrite the changelog on a
        // guess, so refuse and let a person name the base.
        throw baseTagError(
          `No release tag is an ancestor of HEAD (${allTags.length} tag(s) exist elsewhere).`,
        )
      }
    }

    // When HEAD is at a tag, use the tag explicitly instead of HEAD
    // This ensures we get commits up to and including the tag commit
    const rangeEnd = currentTag || 'HEAD'
    report(describeRange(previousTag, rangeEnd) + (overridden ? ' (RELEASE_BASE_TAG)' : ''))

    // Get commits since previous tag (inclusive of rangeEnd)
    // Use null character as delimiter to handle multi-line bodies
    // Format: hash\0subject\0body\0hash2\0subject2\0body2\0...
    // NOTE: do NOT pass --all here — it traverses every ref (branches,
    // remotes, tags) and leaks commits from unmerged branches into the
    // range. Shallow-clone fallback below uses git fetch --unshallow.
    const output = execSync(`git log ${rangeSince(previousTag, rangeEnd)} ${FORMAT}`, {
      encoding: 'utf-8',
      stdio: 'pipe',
    }).trim()

    const commits = reconstructCommits(output)

    // If no commits found and we're in CI, try unshallow the repo
    if (commits.length === 0) {
      try {
        execSync('git fetch --unshallow', { encoding: 'utf-8', stdio: 'pipe' })
        // Try again after unshallow
        const retryOutput = execSync(`git log ${rangeSince(previousTag, rangeEnd)} ${FORMAT}`, {
          encoding: 'utf-8',
          stdio: 'pipe',
        }).trim()
        return reconstructCommits(retryOutput)
      } catch {
        // Unshallow failed or not a shallow clone, return empty
      }
    }

    return commits
  } catch (error) {
    // An undecidable base is a refusal, not a git failure: falling back to all
    // history here would write exactly what the refusal exists to prevent.
    if (error.code === 'NO_BASE_TAG') throw error
    // If git commands fail, try to get all commits as fallback
    try {
      const output = execSync('git log --pretty=format:"%h%x00%s%x00%b%x00" --no-merges', {
        encoding: 'utf-8',
        stdio: 'pipe',
      }).trim()

      // Worth naming loudly: this is the whole history because git ERRORED,
      // not because the range said so.
      report('all history — git failed, fell back')
      return reconstructCommits(output)
    } catch {
      console.error('Failed to get git commits:', error)
      return []
    }
  }
}

const FORMAT = '--pretty=format:"%h%x00%s%x00%b%x00" --no-merges'

// Release tags `git describe` may answer with: `v1.2.3`, `1.2.3`, and their
// `-suffix` forms. A glob, so it also admits `v1.2.3-anything`.
const DESCRIBE_MATCH = '--match "v[0-9]*.[0-9]*.[0-9]*" --match "[0-9]*.[0-9]*.[0-9]*"'

/**
 * The nearest release tag reachable from `ref` (including `ref` itself), or
 * null when there is none.
 *
 * WHAT WOULD FOOL THIS: a shallow clone. Its history stops short, so an
 * ancestor tag can be out of sight and "none" would be a lie — exactly the
 * CI checkout this runs in. On a miss in a shallow repo, unshallow and ask
 * again before answering null.
 */
function nearestAncestorTag(ref) {
  const describe = () => {
    try {
      return execSync(`git describe --tags --abbrev=0 ${DESCRIBE_MATCH} ${ref}`, {
        encoding: 'utf-8',
        stdio: 'pipe',
      }).trim()
    } catch {
      return null
    }
  }
  const found = describe()
  if (found) return found
  let shallow = false
  try {
    shallow =
      execSync('git rev-parse --is-shallow-repository', { encoding: 'utf-8', stdio: 'pipe' }).trim() ===
      'true'
  } catch {
    // cannot tell — answer from what is visible
  }
  if (!shallow) return null
  try {
    execSync('git fetch --unshallow --tags', { encoding: 'utf-8', stdio: 'pipe' })
  } catch {
    return null
  }
  return describe()
}

function baseTagError(reason) {
  const error = new Error(
    `${reason}\n` +
      '  Cannot tell which release this one builds on, so nothing was written.\n' +
      '  Set RELEASE_BASE_TAG to the intended base tag and re-run.',
  )
  error.code = 'NO_BASE_TAG'
  return error
}

/**
 * The commits in `to` that `from` does not already carry — as a `git log`
 * range argument.
 *
 * Not `from..to`. That excludes only commits REACHABLE from `from`, and after a
 * hotfix the previous tag is not: it was cut on a branch from an older release,
 * and its fixes reached main as cherry-picks with different SHAs. `from..to`
 * listed those copies a second time, Release-Note footers and all.
 *
 * `--cherry-pick --right-only from...to` drops right-side commits whose patch
 * matches one on the left. When `from` is an ancestor of `to` — every ordinary
 * release — the left side is empty and the result is the same as `from..to`.
 *
 * Its blind spot: a cherry-pick that needed conflict resolution has a
 * different patch, so it is not recognised and is still listed. That fails
 * toward listing a commit twice, never toward dropping one.
 */
function rangeSince(from, to) {
  return `--cherry-pick --right-only ${from}...${to}`
}

/**
 * The range as a reader should see it. The linear case keeps the familiar
 * `from..to`, which is exactly what it computes; the hotfix case says that it
 * is different, so a dropped commit is never silent.
 */
function describeRange(from, to) {
  try {
    execSync(`git merge-base --is-ancestor ${from} ${to}`, { stdio: 'pipe' })
    return `${from}..${to}`
  } catch {
    // Not an ancestor — or git could not tell. Either way the three-dot form
    // is what actually ran, so name it.
    return `${from}...${to} (cherry-picks already in ${from} dropped)`
  }
}

function reconstructCommits(output) {
  if (!output.trim()) {
    return []
  }

  // Split by null character - DO NOT filter empty parts yet
  // Empty bodies are valid and needed to maintain correct grouping
  const parts = output.split('\0')

  const commits = []

  // Group parts into commits: each commit has hash, subject, body
  // Parts array: [hash1, subject1, body1, hash2, subject2, body2, ...]
  // Trailing empty string from final \0 is expected and ignored
  for (let i = 0; i < parts.length - 1; i += 3) {
    const hash = parts[i] || ''
    const subject = parts[i + 1] || ''
    const body = parts[i + 2] || ''

    // Only add commit if we have hash and subject (body can be empty)
    if (hash.trim() && subject.trim()) {
      // Reconstruct commit string with null delimiters
      commits.push(`${hash}\0${subject}\0${body}`)
    }
  }

  return commits
}

function parseCommit(commitLine) {
  // Split by null character (used as delimiter in git log format)
  const parts = commitLine.split('\0')

  // Need at least hash and subject (body is optional)
  if (parts.length < 2) {
    return null // Invalid format, skip
  }

  const hash = parts[0].trim()
  const subject = parts[1].trim()
  const body = (parts[2] && parts[2].trim()) || undefined

  // Parse conventional commit format: type(scope)!: description
  // The optional `!` marks a breaking change per the Conventional Commits spec.
  const conventionalCommitRegex = /^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/
  const match = subject.match(conventionalCommitRegex)

  if (!match) {
    return null // Skip non-conventional commits
  }

  const [, type, scope, bang, message] = match

  // Breaking change markers:
  //   1. `!` suffix on type/scope (e.g. `feat!:` or `feat(api)!:`)
  //   2. A `BREAKING CHANGE:` or `BREAKING-CHANGE:` footer in the body
  const breakingFooterRegex = /(^|\n)BREAKING[- ]CHANGE:/i
  const breaking = Boolean(bang) || (body ? breakingFooterRegex.test(body) : false)

  return {
    type: type.toLowerCase(),
    scope: scope || undefined,
    message: message.trim(),
    body: body,
    hash: hash.trim(),
    breaking,
  }
}

function getAllVersionTags() {
  try {
    execSync('git fetch --tags --force', { encoding: 'utf-8', stdio: 'pipe' })
  } catch {
    // fetch is best-effort
  }

  return execSync('git tag --sort=-version:refname', { encoding: 'utf-8', stdio: 'pipe' })
    .trim()
    .split('\n')
    .map((t) => t.trim())
    .filter((t) => /^v?\d+\.\d+\.\d+/.test(t))
}

function getCommitsBetween(fromTag, toTag) {
  const range = fromTag ? rangeSince(fromTag, toTag) : toTag
  const output = execSync(`git log ${range} ${FORMAT}`, {
    encoding: 'utf-8',
    stdio: 'pipe',
  }).trim()
  return reconstructCommits(output)
}

/** Does this tag exist? Used to tell "already released" from "being released". */
function tagExists(tag) {
  try {
    execSync(`git rev-parse --verify --quiet ${tag}^{commit}`, { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

/**
 * Commits after `tag` up to HEAD — the work a release would cover NEXT.
 *
 * Reported when a generator declines to include them, so "nothing changed" does
 * not read as "there is nothing pending". Returns 0 rather than throwing on a
 * tag that is not there; the caller has already established it exists.
 */
function countCommitsSince(tag) {
  try {
    const out = execSync(`git rev-list --count --no-merges ${rangeSince(tag, 'HEAD')}`, {
      encoding: 'utf-8',
      stdio: 'pipe',
    }).trim()
    return Number.parseInt(out, 10) || 0
  } catch {
    return 0
  }
}

function getTagDate(tag) {
  try {
    return execSync(`git log -1 --format=%cs ${tag}`, { encoding: 'utf-8', stdio: 'pipe' }).trim()
  } catch {
    return new Date().toISOString().split('T')[0]
  }
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * A version as it appears in a section heading: dotted numbers plus an
 * optional `-suffix` (`36.4.0`, `36.4.0-hotfix.2`, `2.0.0-rc.1`). A regex
 * SOURCE, for embedding in the generators' heading patterns.
 */
const VERSION_PATTERN = '\\d+(?:\\.\\d+)*(?:-[0-9A-Za-z.-]+)?'

/**
 * Compare two version strings: >0 when `a` is newer.
 *
 * Ordering, for a given `X.Y.Z`:
 *
 *   X.Y.Z-rc.1 < X.Y.Z < X.Y.Z-hotfix.1 < X.Y.Z-hotfix.2 < X.Y.(Z+1)
 *
 * A `-hotfix.N` suffix sorts AFTER its base — deliberately the opposite of
 * semver, because a hotfix is cut after the release it patches and must list
 * above it. This matches `git tag --sort=-version:refname` with no
 * `versionsort.suffix` configured. Every other suffix is a pre-release and
 * sorts BEFORE its base, as semver says. Build metadata (`+…`) is ignored.
 */
function compareVersions(a, b) {
  const va = splitVersion(a)
  const vb = splitVersion(b)
  for (let i = 0; i < Math.max(va.core.length, vb.core.length); i += 1) {
    const diff = (va.core[i] || 0) - (vb.core[i] || 0)
    if (diff !== 0) return diff
  }
  if (va.rank !== vb.rank) return va.rank - vb.rank
  return compareIdentifiers(va.ids, vb.ids)
}

// rank: -1 pre-release, 0 plain release, 1 hotfix. `ids` are the suffix's
// identifiers after the `hotfix` marker (or all of them for a pre-release).
function splitVersion(version) {
  const [main] = String(version).replace(/^v/, '').split('+')
  const dash = main.indexOf('-')
  const coreText = dash === -1 ? main : main.slice(0, dash)
  const suffix = dash === -1 ? '' : main.slice(dash + 1)
  const core = coreText.split('.').map((n) => Number.parseInt(n, 10) || 0)
  if (!suffix) return { core, rank: 0, ids: [] }
  const ids = suffix.split('.')
  if (ids[0] === 'hotfix') return { core, rank: 1, ids: ids.slice(1) }
  return { core, rank: -1, ids }
}

// Semver identifier precedence: numeric ids compare numerically and sort
// below alphanumeric ones; otherwise lexically; a longer list wins a tie.
function compareIdentifiers(ia, ib) {
  for (let i = 0; i < Math.max(ia.length, ib.length); i += 1) {
    if (ia[i] === undefined) return -1
    if (ib[i] === undefined) return 1
    const na = /^\d+$/.test(ia[i])
    const nb = /^\d+$/.test(ib[i])
    if (na && nb) {
      const diff = Number(ia[i]) - Number(ib[i])
      if (diff !== 0) return diff
    } else if (na !== nb) {
      return na ? -1 : 1
    } else if (ia[i] !== ib[i]) {
      return ia[i] < ib[i] ? -1 : 1
    }
  }
  return 0
}

/**
 * Index of the `\n` preceding the first section OLDER than `version`, or -1
 * when every existing section is newer (i.e. this one belongs at the end).
 *
 * `headingRegex` must capture the version as group 1.
 */
function indexOfOlderSection(content, version, headingRegex) {
  const re = new RegExp(headingRegex.source, 'g')
  let match
  while ((match = re.exec(content)) !== null) {
    if (compareVersions(match[1], version) < 0) return match.index
  }
  return -1
}

module.exports = {
  VERSION_PATTERN,
  compareVersions,
  countCommitsSince,
  tagExists,
  indexOfOlderSection,
  nearestAncestorTag,
  getCommitsSinceLastTag,
  reconstructCommits,
  parseCommit,
  getAllVersionTags,
  getCommitsBetween,
  getTagDate,
  escapeRegex,
}

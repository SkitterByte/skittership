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

    if (currentTag && allTags.includes(currentTag)) {
      // HEAD is at a tag - find the next OLDER tag.
      //
      // allTags is NEWEST-first (`--sort=-version:refname`), so the older
      // neighbour is at +1. This read -1, which is the NEWER tag, and broke
      // two ways at once: `git log newer..older` is a backwards range that
      // returns nothing, and the newest tag (index 0) failed the `> 0` guard
      // and fell through to "first tag", returning all history.
      //
      // `npm version` never reaches this branch — the version being released
      // has no tag yet, so it takes the else below — which is why it survived.
      // The documented manual path (`npm run changelog` between releases) is
      // what it broke, silently and with exit 0.
      const currentIndex = allTags.indexOf(currentTag)
      if (currentIndex + 1 < allTags.length) {
        previousTag = allTags[currentIndex + 1]
      } else {
        // This is the OLDEST tag: everything up to and including it. Bound by
        // the tag, NOT bare `git log` — when currentTag came from the version
        // fallback, HEAD is past the tag, and an unbounded log folds work done
        // AFTER the release into the released section. That is the same defect
        // as the inverted walk, surviving in the single-tag case.
        const output = execSync(
          `git log ${currentTag} --pretty=format:"%h%x00%s%x00%b%x00" --no-merges`,
          { encoding: 'utf-8', stdio: 'pipe' },
        ).trim()

        report(`all history — no earlier tag (through ${currentTag})`)
        return reconstructCommits(output)
      }
    } else {
      // HEAD is not at a tag, use the most recent tag
      previousTag = allTags[0]
    }

    if (!previousTag) {
      // No previous tag found, get all commits
      const output = execSync('git log --pretty=format:"%h%x00%s%x00%b%x00" --no-merges', {
        encoding: 'utf-8',
        stdio: 'pipe',
      }).trim()

      report('all history — no earlier tag')
      return reconstructCommits(output)
    }

    // When HEAD is at a tag, use the tag explicitly instead of HEAD
    // This ensures we get commits up to and including the tag commit
    const rangeEnd = currentTag || 'HEAD'
    report(`${previousTag}..${rangeEnd}`)

    // Get commits since previous tag (inclusive of rangeEnd)
    // Use null character as delimiter to handle multi-line bodies
    // Format: hash\0subject\0body\0hash2\0subject2\0body2\0...
    // NOTE: do NOT pass --all here — it traverses every ref (branches,
    // remotes, tags) and leaks commits from unmerged branches into the
    // range. Shallow-clone fallback below uses git fetch --unshallow.
    const output = execSync(
      `git log ${previousTag}..${rangeEnd} --pretty=format:"%h%x00%s%x00%b%x00" --no-merges`,
      { encoding: 'utf-8', stdio: 'pipe' },
    ).trim()

    const commits = reconstructCommits(output)

    // If no commits found and we're in CI, try unshallow the repo
    if (commits.length === 0) {
      try {
        execSync('git fetch --unshallow', { encoding: 'utf-8', stdio: 'pipe' })
        // Try again after unshallow
        const retryOutput = execSync(
          `git log ${previousTag}..${rangeEnd} --pretty=format:"%h%x00%s%x00%b%x00" --no-merges`,
          { encoding: 'utf-8', stdio: 'pipe' },
        ).trim()
        return reconstructCommits(retryOutput)
      } catch {
        // Unshallow failed or not a shallow clone, return empty
      }
    }

    return commits
  } catch (error) {
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
  const range = fromTag ? `${fromTag}..${toTag}` : toTag
  const output = execSync(`git log ${range} --pretty=format:"%h%x00%s%x00%b%x00" --no-merges`, {
    encoding: 'utf-8',
    stdio: 'pipe',
  }).trim()
  return reconstructCommits(output)
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
 * Compare two dotted version strings numerically: >0 when `a` is newer.
 *
 * Deliberately not a full semver implementation — this project's tags are
 * plain `major.minor.patch`, and the only job here is keeping generated
 * sections in descending order. Pre-release suffixes are not handled.
 */
function compareVersions(a, b) {
  const pa = String(a).split('.').map((n) => Number.parseInt(n, 10) || 0)
  const pb = String(b).split('.').map((n) => Number.parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const diff = (pa[i] || 0) - (pb[i] || 0)
    if (diff !== 0) return diff
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
  compareVersions,
  indexOfOlderSection,
  getCommitsSinceLastTag,
  reconstructCommits,
  parseCommit,
  getAllVersionTags,
  getCommitsBetween,
  getTagDate,
  escapeRegex,
}

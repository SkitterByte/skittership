'use strict'

/**
 * Shared git-history plumbing for the release artifact generators.
 *
 * Both `generate-changelog.js` (dev-facing CHANGELOG, from commit subjects) and
 * `generate-releases.js` (user-facing RELEASES, from `Release-Note:` footers)
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

function getCommitsSinceLastTag(currentVersion) {
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
      // HEAD is at a tag - find the previous tag
      const currentIndex = allTags.indexOf(currentTag)
      if (currentIndex > 0) {
        // There is a previous tag
        previousTag = allTags[currentIndex - 1]
      } else {
        // This is the first tag, get all commits
        const output = execSync('git log --pretty=format:"%h%x00%s%x00%b%x00" --no-merges', {
          encoding: 'utf-8',
          stdio: 'pipe',
        }).trim()

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

      return reconstructCommits(output)
    }

    // When HEAD is at a tag, use the tag explicitly instead of HEAD
    // This ensures we get commits up to and including the tag commit
    const rangeEnd = currentTag || 'HEAD'

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

module.exports = {
  getCommitsSinceLastTag,
  reconstructCommits,
  parseCommit,
  getAllVersionTags,
  getCommitsBetween,
  getTagDate,
  escapeRegex,
}

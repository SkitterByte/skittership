#!/usr/bin/env node
'use strict'

/**
 * Fail the `npm version` run if anything unexpected is staged.
 *
 * Runs as the LAST step of the npm `version` script, after the generators have
 * written and staged the changelog / release-notes files.
 *
 * Why a post-check and not a pre-check: npm already refuses to start when the
 * working directory is dirty ("Git working directory not clean"), so a file
 * another session staged BEFORE the release aborts it for us. What npm does not
 * cover is the window during the version script itself — the seconds our
 * generators run. Anything staged in that window is swept into npm's commit,
 * because npm commits with a bare `git commit` and no pathspec (verified: a
 * file staged mid-script lands in the version commit).
 *
 * We cannot bound npm's commit. We can refuse to reach it: a non-zero exit here
 * aborts the run before the commit and the tag are created.
 */

const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const { loadConfig } = require(path.join(__dirname, 'lib', 'config.cjs'))

// Lockfiles a package manager updates and stages for itself during a version
// bump. Listing only npm's meant a pnpm or yarn project had its own lockfile
// reported as a stray, so the guard aborted every release on those projects —
// the one file that is guaranteed to be staged is not evidence of a concurrent
// session. Kept broad on purpose: a lockfile here is always the release's own.
const LOCKFILES = [
  'package-lock.json',
  'npm-shrinkwrap.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb',
  'bun.lock',
]

// Files the release itself is expected to stage. package.json (and its
// lockfiles) are the package manager's own — it bumps the version and stages
// them around us.
function expectedPaths(dir) {
  const config = loadConfig(dir)
  const expected = new Set(['package.json', ...LOCKFILES])
  if (config.changelog.enabled) expected.add(config.changelog.file)
  if (config.releases.enabled) expected.add(config.releases.file)
  return expected
}

function stagedPaths(dir) {
  const out = execFileSync('git', ['diff', '--cached', '--name-only'], {
    cwd: dir,
    encoding: 'utf8',
  })
  return out.split('\n').map((s) => s.trim()).filter(Boolean)
}

function findStrays(dir) {
  const expected = expectedPaths(dir)
  return stagedPaths(dir).filter((p) => !expected.has(p))
}

/**
 * The tag `npm version` is about to create, when it already exists.
 *
 * After a hotfix, main's package.json still names the pre-hotfix version, so
 * `npm version patch` there computes the hotfix's own version. npm regenerated
 * both files, committed, and only THEN failed on the tag — leaving a version
 * commit with no tag. This runs before npm commits, so it can refuse first.
 *
 * Only inside the `version` lifecycle. Anywhere else package.json names the
 * version already released, whose tag exists by definition — not a collision.
 *
 * Its blind spot: a tag that exists only on the remote. The generators earlier
 * in the hook fetch tags, but a failed fetch leaves it unseen, and the release
 * fails late exactly as before. An unseen tag never blocks a release.
 */
function existingVersionTag(dir, env = process.env) {
  if (env.npm_lifecycle_event !== 'version') return null
  const prefix = env.npm_config_tag_version_prefix ?? 'v'
  let version
  try {
    ;({ version } = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')))
  } catch {
    return null // cannot tell — let npm's own tag step be the judge
  }
  if (typeof version !== 'string') return null
  const tag = `${prefix}${version}`
  return tagNames(dir).includes(tag) ? { tag, version, prefix } : null
}

function tagNames(dir) {
  return execFileSync('git', ['tag', '--list'], { cwd: dir, encoding: 'utf8' })
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * The lowest patch above `version` in the same major.minor with no tag.
 *
 * A `-hotfix.N` version advances N instead: its next free version is the next
 * hotfix of the same base, never a patch that test/demo may already own.
 */
function nextFreePatch(dir, version, prefix) {
  const taken = new Set(tagNames(dir))
  const hotfix = /^(\d+\.\d+\.\d+)-hotfix\.(\d+)$/.exec(version)
  if (hotfix) {
    let n = Number.parseInt(hotfix[2], 10) + 1
    while (taken.has(`${prefix}${hotfix[1]}-hotfix.${n}`)) n += 1
    return `${hotfix[1]}-hotfix.${n}`
  }
  const root = version.split(/[-+]/)[0]
  const [major, minor, patch] = root.split('.').map((n) => Number.parseInt(n, 10))
  let next = patch + 1
  while (taken.has(`${prefix}${major}.${minor}.${next}`)) next += 1
  return `${major}.${minor}.${next}`
}

function main() {
  const dir = process.cwd()

  const collision = existingVersionTag(dir)
  if (collision) {
    const { tag, version, prefix } = collision
    console.error(`\n✖ Release aborted — tag ${tag} already exists.\n`)
    console.error(
      `  package.json was bumped to ${version}, but that version was already\n` +
        '  released — usually as a hotfix cut from a release branch, which\n' +
        "  leaves this branch's package.json behind. Nothing has been committed\n" +
        '  or tagged.\n' +
        '\n  Undo the bump and release the next free version instead:\n' +
        `\n    git checkout HEAD -- ${[...expectedPaths(dir)].filter((p) => fs.existsSync(path.join(dir, p))).join(' ')}\n` +
        `    npm version ${nextFreePatch(dir, version, prefix)}\n`,
    )
    process.exit(1)
  }

  const strays = findStrays(dir)
  if (strays.length === 0) return

  console.error('\n✖ Release aborted — unexpected files are staged:\n')
  for (const p of strays) console.error(`    ${p}`)
  console.error(
    '\n  These were staged during the version script, so npm would have swept\n' +
      '  them into the version commit (npm commits the whole index, with no\n' +
      '  pathspec). Nothing has been committed or tagged.\n' +
      '\n  Unstage them and re-run. Note npm already bumped package.json on disk;\n' +
      '  `git checkout -- package.json` undoes that if you are not re-running.\n',
  )
  process.exit(1)
}

if (require.main === module) main()

module.exports = { expectedPaths, stagedPaths, findStrays, existingVersionTag, nextFreePatch, LOCKFILES }

#!/usr/bin/env node
'use strict'

/**
 * Cut a hotfix release: `v<root>-hotfix.<N+1>` on a hotfix branch.
 *
 * A hotfix must be exactly the prod tag plus the fix. Taking the next patch
 * number only works while no other environment uses patch numbers; once
 * test/demo have taken v1.2.4..10, "v1.2.4" is already something else. So the
 * version is the base release with a `-hotfix.N` suffix, which sorts after its
 * base and before the next patch (see compareVersions in lib/git-commits.cjs).
 *
 * The project's own `<pm> version` does the work, so its preversion/version
 * hooks (validation, CHANGELOG, RELEASES, the release-index guard) run
 * unchanged. RELEASE_BASE_TAG tells the generators which release this builds
 * on.
 *
 * Never pushes unless --push is given: a caller (skitterspec's /spec-hotfix)
 * sequences the push and the carry to main itself.
 *
 *   node scripts/release-hotfix.cjs [--dry-run] [--json] [--push] [--allow-postversion]
 *
 * --json prints {tag, version, baseTag, versionCommit, branch, pushed} on
 * stdout; everything else — including the package manager's own output — goes
 * to stderr, so stdout stays parseable. Every refusal is one line on stderr
 * and a non-zero exit.
 */

const { execFileSync, spawnSync } = require('node:child_process')
const { existsSync, readFileSync } = require('node:fs')
const { join } = require('node:path')

const { loadConfig } = require('./lib/config.cjs')
const { nearestAncestorTag, escapeRegex } = require('./lib/git-commits.cjs')

const TAG_PREFIX = 'v'
// A base this can patch: a release, or an earlier hotfix of one.
const BASE_TAG = /^v?(\d+\.\d+\.\d+)(?:-hotfix\.\d+)?$/

/** `v36.4.0-hotfix.2` → `36.4.0`; null for anything that is not a base. */
function rootOf(tag) {
  const match = BASE_TAG.exec(String(tag))
  return match ? match[1] : null
}

/**
 * The next hotfix of `baseTag`'s root, given every tag in the repo.
 *
 * N is one above the highest `-hotfix.*` tag for that root ANYWHERE — a tag on
 * another branch still owns its number, because the tag is what deploys. A
 * later release (v1.0.1) is irrelevant: it neither blocks nor is used.
 */
function nextHotfixVersion(baseTag, tags) {
  const root = rootOf(baseTag)
  if (!root) return null
  const re = new RegExp(`^v?${escapeRegex(root)}-hotfix\\.(\\d+)$`)
  let highest = 0
  for (const tag of tags) {
    const match = re.exec(tag)
    if (match) highest = Math.max(highest, Number.parseInt(match[1], 10))
  }
  const version = `${root}-hotfix.${highest + 1}`
  return { version, tag: `${TAG_PREFIX}${version}` }
}

/**
 * Which package manager runs `version` here. Only pnpm is distinguished: npm's
 * `version` works in any package.json project, and yarn/bun do not commit and
 * tag the same way, so they get npm.
 */
function detectPackageManager(dir) {
  try {
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    if (typeof pkg.packageManager === 'string') {
      return pkg.packageManager.startsWith('pnpm@') ? 'pnpm' : 'npm'
    }
  } catch {
    // no readable package.json — fall through to lockfiles
  }
  return existsSync(join(dir, 'pnpm-lock.yaml')) ? 'pnpm' : 'npm'
}

function parseArgs(argv) {
  const opts = { dryRun: false, json: false, push: false, allowPostversion: false }
  for (const arg of argv) {
    if (arg === '--dry-run') opts.dryRun = true
    else if (arg === '--json') opts.json = true
    else if (arg === '--push') opts.push = true
    else if (arg === '--allow-postversion') opts.allowPostversion = true
    else throw new Refusal(`unknown option ${arg}`)
  }
  return opts
}

class Refusal extends Error {}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: 'pipe' }).trim()

function tryGit(...args) {
  try {
    return git(...args)
  } catch {
    return null
  }
}

function plan(dir, opts) {
  const config = loadConfig(dir)
  const prefix = config.hotfix.branchPrefix

  const branch = tryGit('symbolic-ref', '--quiet', '--short', 'HEAD')
  if (!branch) throw new Refusal('HEAD is detached — check out a hotfix branch first')
  if (!branch.startsWith(prefix)) {
    throw new Refusal(`must run on a ${prefix}* branch (current: ${branch})`)
  }
  if (git('status', '--porcelain') !== '') {
    throw new Refusal('the working tree is not clean — commit or discard changes first')
  }

  // A postversion hook runs inside `<pm> version`, and it may push — which
  // would break "never pushes by default" for every caller sequencing the push
  // itself. Whether a given script pushes cannot be told from here, so the
  // unknown case refuses and names the opt-out.
  let scripts = {}
  try {
    scripts = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).scripts || {}
  } catch {
    throw new Refusal('no readable package.json here')
  }
  if (scripts.postversion && !opts.allowPostversion) {
    throw new Refusal(
      `package.json has a postversion script ("${scripts.postversion}") that may push — ` +
        'pass --allow-postversion to run it anyway',
    )
  }

  // Best-effort. A hotfix tag that exists only on the remote is invisible to a
  // failed fetch; then N may repeat it, and `<pm> version` (or the push) fails
  // on the collision rather than anything being overwritten.
  tryGit('fetch', '--tags', '--quiet')

  const releasedHere = (tryGit('tag', '--points-at', 'HEAD') || '')
    .split('\n')
    .filter((t) => rootOf(t))
  if (releasedHere.length > 0) {
    throw new Refusal(`HEAD is already released as ${releasedHere[0]} — commit the fix first`)
  }

  const baseTag = nearestAncestorTag('HEAD')
  if (!baseTag) throw new Refusal('no release tag is an ancestor of HEAD — branch from a release tag')
  const next = nextHotfixVersion(baseTag, (tryGit('tag', '--list') || '').split('\n'))
  if (!next) {
    throw new Refusal(`base tag ${baseTag} is not a release (X.Y.Z) or a hotfix of one`)
  }

  return { branch, baseTag, ...next, packageManager: detectPackageManager(dir) }
}

function cut(p, opts) {
  const result = spawnSync(p.packageManager, ['version', p.version], {
    // stdout → our stderr, so --json's stdout carries only the result.
    stdio: ['inherit', 2, 2],
    env: { ...process.env, RELEASE_BASE_TAG: p.baseTag },
  })
  if (result.error) throw new Refusal(`could not run ${p.packageManager}: ${result.error.message}`)
  if (result.status !== 0) {
    throw new Refusal(`${p.packageManager} version ${p.version} failed (exit ${result.status})`)
  }

  const versionCommit = git('rev-parse', 'HEAD')
  const tagged = tryGit('rev-parse', `${p.tag}^{commit}`)
  if (tagged !== versionCommit) {
    throw new Refusal(
      `${p.packageManager} version finished, but ${p.tag} does not point at HEAD — ` +
        'check its tag-version-prefix and git-tag-version settings',
    )
  }

  let pushed = false
  if (opts.push) {
    // Branch first: the tag push is what starts the deploy, and it should find
    // the branch already there.
    for (const ref of [p.branch, p.tag]) {
      try {
        execFileSync('git', ['push', 'origin', ref], { stdio: ['ignore', 2, 2] })
      } catch {
        throw new Refusal(`git push origin ${ref} failed — ${p.tag} is cut locally; push by hand`)
      }
    }
    pushed = true
  }
  return { versionCommit, pushed }
}

function nextSteps(p, versionCommit) {
  return [
    'Next:',
    `  git push origin ${p.branch}`,
    `  git push origin ${p.tag}        # starts the deploy`,
    '  then carry the fix to main, leaving the version commit behind:',
    `  git switch main && git cherry-pick ${p.baseTag}..${versionCommit}~1`,
  ].join('\n')
}

function main(argv) {
  const dir = process.cwd()
  try {
    const opts = parseArgs(argv)
    const p = plan(dir, opts)
    const summary = { tag: p.tag, version: p.version, baseTag: p.baseTag, branch: p.branch }

    if (opts.dryRun) {
      if (opts.json) console.log(JSON.stringify({ ...summary, versionCommit: null, pushed: false }))
      else console.log(`Would cut ${p.tag} on ${p.branch} (base ${p.baseTag}) via ${p.packageManager} version`)
      return 0
    }

    const { versionCommit, pushed } = cut(p, opts)
    if (opts.json) {
      console.log(JSON.stringify({ ...summary, versionCommit, pushed }))
    } else {
      console.log(`✅ Cut ${p.tag} on ${p.branch} (base ${p.baseTag}, commit ${versionCommit.slice(0, 7)})`)
      console.log(pushed ? `Pushed ${p.branch}, then ${p.tag}.` : nextSteps(p, versionCommit))
    }
    return 0
  } catch (error) {
    if (!(error instanceof Refusal)) throw error
    console.error(`✖ release-hotfix: ${error.message}`)
    return 1
  }
}

if (require.main === module) process.exitCode = main(process.argv.slice(2))

module.exports = { rootOf, nextHotfixVersion, detectPackageManager, main }

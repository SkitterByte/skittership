#!/usr/bin/env node
'use strict'

/**
 * Approve (or reject) a staged npm release.
 *
 * CI stages a build with `npm stage publish` but cannot make it live — the
 * trusted publisher is stage-only, so a maintainer has to approve it with 2FA.
 * That gate is the point; this script only shortens the typing around it.
 *
 *   npm run approve                  approve the version in package.json
 *   npm run approve 2.0.1            approve a specific version
 *   npm run approve <uuid>           approve a specific stage-id directly
 *   npm run approve api              a monorepo package (`packages.api`)
 *   npm run approve api 2.0.1        …at a specific version
 *   npm run approve -- --reject      reject instead of approving
 *
 * `npm stage approve|reject|view|download` all take a STAGE-ID (a UUID), not a
 * package spec — only `npm stage list` accepts a spec. So the version you pass
 * has to be resolved to an id via the listing first, which is the bulk of the
 * work here.
 *
 * In a monorepo the first argument may name a package from
 * `skittership.config.json` → `packages`. Its npm name is `packages.<name>.npm`,
 * else the `name` in `<dir>/package.json`; its version, when none is passed,
 * is that package.json's. Installed only when `release.staged` is true.
 */

const { execFileSync } = require('node:child_process')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const { loadConfig, resolvePackage } = require('./lib/config.cjs')

const ROOT = join(__dirname, '..')

// `npm stage` landed in 11.15.0; older npm fails with an opaque "unknown
// command", which reads as a broken script rather than a stale toolchain.
const MIN_NPM = [11, 15, 0]

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function readManifest(dir) {
  try {
    return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  } catch {
    return null
  }
}

class Refusal extends Error {}

/**
 * The npm name and current version to approve: the root package, or the named
 * monorepo package. Throws a Refusal naming what is missing.
 */
function resolveTarget(root, config, packageName) {
  if (!packageName) {
    const pkg = readManifest(root)
    if (pkg && pkg.name && pkg.version) return { name: pkg.name, version: pkg.version }
    const known = Object.keys(config.packages || {})
    throw new Refusal(
      known.length
        ? `the root package.json has no name/version to approve — name a package: ${known.join(', ')}`
        : 'package.json is missing name or version',
    )
  }
  const entry = resolvePackage(config, packageName)
  const pkg = entry && entry.dir ? readManifest(join(root, entry.dir)) : null
  const name = entry.npm || (pkg && pkg.name)
  if (!name) {
    throw new Refusal(
      `no npm name for ${packageName} — set packages.${packageName}.npm, ` +
        `or packages.${packageName}.dir to a folder with a package.json`,
    )
  }
  return { name, version: (pkg && pkg.version) || null }
}

function npmVersion() {
  const out = execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim()
  return out.split('.').map((n) => Number.parseInt(n, 10) || 0)
}

function tooOld(actual, min) {
  for (let i = 0; i < min.length; i += 1) {
    const diff = (actual[i] || 0) - min[i]
    if (diff !== 0) return diff < 0
  }
  return false
}

/**
 * `[<package>] [<version>|<stage-id>] [--reject]`. The first positional is a
 * package only when it is one of `packageNames`, so a single-package project
 * reads exactly as before.
 */
function parseArgs(argv, packageNames = []) {
  const args = argv.slice(2)
  const action = args.includes('--reject') ? 'reject' : 'approve'
  const positional = args.filter((a) => !a.startsWith('-'))
  const pkg = positional.length > 0 && packageNames.includes(positional[0]) ? positional[0] : null
  const target = pkg ? positional[1] : positional[0]
  return { action, package: pkg, target }
}

/**
 * Statuses that are KNOWN to mean "not approvable yet".
 *
 * Deliberately a list of known-bad rather than known-good. npm does not publish
 * the full set, and blocking on an unrecognised status would leave a release
 * that is perfectly ready un-approvable through this script. An unknown status
 * therefore falls through to `npm stage approve`, which is the authority and
 * will refuse if it must — the cost of being wrong that way is one 409, while
 * the other way is a release nobody can ship.
 */
const NOT_READY = {
  validating: 'npm is still running its automated review',
}

/**
 * Normalise `npm stage list --json` into {id, version, status} rows.
 *
 * The real shape (verified against npm 11.x) is a flat array of
 * `{ id, packageName, version, tag, createdAt, actor, access, shasum, status }`.
 * The alternative spellings below are kept because the output is undocumented
 * and cheap to tolerate; the UUID scan is the last resort. A listing we cannot
 * parse is reported as such — never silently treated as "nothing staged".
 */
function normaliseEntries(parsed) {
  let rows = parsed
  if (rows && !Array.isArray(rows)) {
    rows = rows.staged || rows.versions || rows.stages || Object.values(rows)
  }
  if (!Array.isArray(rows)) return []

  return rows
    .filter((row) => row && typeof row === 'object')
    .map((row) => {
      const id =
        [row.id, row.stageId, row.stage_id, row.stageID].find(
          (v) => typeof v === 'string' && UUID.test(v),
        ) || Object.values(row).find((v) => typeof v === 'string' && UUID.test(v))

      let version = row.version
      if (!version) {
        const spec = row.spec || row.package || row._id
        if (typeof spec === 'string' && spec.includes('@')) {
          version = spec.slice(spec.lastIndexOf('@') + 1)
        }
      }
      const status = typeof row.status === 'string' ? row.status : null
      return { id, version, status }
    })
    .filter((row) => row.id)
}

/** The reason this row is not approvable yet, or null if it may be tried. */
function notReadyReason(row) {
  if (!row || typeof row.status !== 'string') return null
  return NOT_READY[row.status.toLowerCase()] || null
}

function listStaged(name) {
  const out = execFileSync('npm', ['stage', 'list', name, '--json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  return normaliseEntries(JSON.parse(out))
}

function main(argv) {
  let config
  let name
  let current
  let action
  let target
  try {
    config = loadConfig(ROOT)
    const args = parseArgs(argv, Object.keys(config.packages || {}))
    ;({ action, target } = args)
    ;({ name, version: current } = resolveTarget(ROOT, config, args.package))
  } catch (error) {
    console.error(`\n✖ ${error.message}\n`)
    process.exit(1)
  }

  const npm = npmVersion()
  if (tooOld(npm, MIN_NPM)) {
    console.error(
      `npm ${npm.join('.')} has no \`npm stage\` — staged publishing needs ` +
        `${MIN_NPM.join('.')} or later.\nUpgrade with: npm install -g npm@latest`,
    )
    process.exit(1)
  }

  // A stage-id can be passed straight through; anything else is a version.
  let stageId = target && UUID.test(target) ? target : null
  const version = stageId ? null : target || current
  if (!stageId && !version) {
    console.error(`\n✖ No version for ${name} — pass one, or the stage-id.\n`)
    process.exit(1)
  }

  if (!stageId) {
    let staged
    try {
      staged = listStaged(name)
    } catch {
      console.error(
        `\n✖ Could not list staged releases for ${name}.\n` +
          `  If that was an auth error, log in first:  npm login\n` +
          `  (staged publishing needs an authenticated, 2FA-capable session)\n`,
      )
      process.exit(1)
    }

    if (staged.length === 0) {
      console.error(
        `\n✖ Nothing is staged for ${name}.\n` +
          `  CI stages a build on a successful publish workflow run; check that\n` +
          `  it completed, then try again.\n`,
      )
      process.exit(1)
    }

    const matches = staged.filter((row) => row.version === version)
    if (matches.length === 0) {
      console.error(`\n✖ No staged release for ${name}@${version}. Staged right now:\n`)
      for (const row of staged) console.error(`    ${row.version || '(unknown)'}  ${row.id}`)
      console.error(`\n  Re-run with the version you want, or pass a stage-id directly.\n`)
      process.exit(1)
    }
    if (matches.length > 1) {
      console.error(`\n✖ ${matches.length} staged entries for ${name}@${version}:\n`)
      for (const row of matches) console.error(`    ${row.id}`)
      console.error(`\n  Pass the stage-id you want:  npm run approve <stage-id>\n`)
      process.exit(1)
    }
    // Check readiness BEFORE approving. `npm stage approve` opens a browser for
    // 2FA and only then asks the registry, so an un-reviewed release sends you
    // off to authenticate and fails afterwards for a reason that had nothing to
    // do with your credentials. Rejecting does not wait on review, so only gate
    // the approve.
    const reason = action === 'approve' ? notReadyReason(matches[0]) : null
    if (reason) {
      console.error(
        `\n⏳ ${name}@${version} is not approvable yet — ${reason}.\n` +
          `   status: ${matches[0].status}\n\n` +
          `   This is normal for a fresh release, not a failure. Try again in a\n` +
          `   few minutes; nothing needs re-staging and CI does not need re-running.\n` +
          `   Check progress with:  npm run staged\n`,
      )
      process.exit(1)
    }

    stageId = matches[0].id
  }

  const what = version ? `${name}@${version}` : `stage ${stageId}`
  console.log(`\n${action === 'approve' ? 'Approving' : 'Rejecting'} ${what}`)
  console.log(`stage-id: ${stageId}`)
  console.log('This prompts for 2FA — it is the release gate, so it cannot be automated.\n')

  try {
    // stdio must be inherited: the 2FA prompt needs the real terminal.
    execFileSync('npm', ['stage', action, stageId], { stdio: 'inherit' })
  } catch {
    // The status check above catches the usual case, but a stage-id passed
    // directly skips it, and the status can go stale between listing and
    // approving. A 409 here means "not yet", not "broken" — say so, because
    // the raw error reads like a failed release.
    console.error(
      `\n✖ \`npm stage ${action} ${stageId}\` failed — see the error above.\n` +
        `  If that was a 409 about automated review, it is not a failure:\n` +
        `  wait a few minutes and re-run. Check with:  npm run staged\n`,
    )
    process.exit(1)
  }

  if (action === 'approve') {
    console.log(`\n✅ ${what} approved. Confirm with:\n    npm view ${name} dist-tags\n`)
  } else {
    console.log(`\n✅ ${what} rejected and discarded.\n`)
  }
}

if (require.main === module) main(process.argv)

module.exports = {
  parseArgs,
  resolveTarget,
  tooOld,
  normaliseEntries,
  notReadyReason,
  NOT_READY,
  UUID,
}

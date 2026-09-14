#!/usr/bin/env node
'use strict'

/**
 * Approve (or reject) the staged release for this package.
 *
 * CI stages a build with `npm stage publish` but cannot make it live — the
 * trusted publisher is stage-only, so a maintainer has to approve it with 2FA.
 * That gate is the point; this script only shortens the typing around it.
 *
 *   npm run approve              approve the version in package.json
 *   npm run approve -- 2.0.1     approve a specific version
 *   npm run approve -- --reject  reject instead of approving
 *
 * REPO-LOCAL. Unlike its siblings in this directory, this file is not mirrored
 * from assets/ and is not shipped to consumers — staged publishing is how THIS
 * package releases, not something skittership installs.
 */

const { execFileSync } = require('node:child_process')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

// `npm stage` landed in 11.15.0; older npm fails with an opaque "unknown
// command", which reads as a broken script rather than a stale toolchain.
const MIN_NPM = [11, 15, 0]

function readPackage() {
  const raw = readFileSync(join(__dirname, '..', 'package.json'), 'utf8')
  const { name, version } = JSON.parse(raw)
  if (!name || !version) throw new Error('package.json is missing name or version')
  return { name, version }
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

/** Local tag for a version, used only to catch a typo'd argument. */
function tagExists(version) {
  try {
    execFileSync('git', ['rev-parse', '--verify', '--quiet', `refs/tags/v${version}`], {
      stdio: 'ignore',
    })
    return true
  } catch {
    return false
  }
}

function parseArgs(argv) {
  const args = argv.slice(2)
  const action = args.includes('--reject') ? 'reject' : 'approve'
  const version = args.find((a) => !a.startsWith('-'))
  return { action, version }
}

function main(argv) {
  const { name, version: current } = readPackage()
  const { action, version: requested } = parseArgs(argv)
  const version = requested || current
  const spec = `${name}@${version}`

  const npm = npmVersion()
  if (tooOld(npm, MIN_NPM)) {
    console.error(
      `npm ${npm.join('.')} has no \`npm stage\` — staged publishing needs ` +
        `${MIN_NPM.join('.')} or later.\nUpgrade with: npm install -g npm@latest`,
    )
    process.exit(1)
  }

  if (requested && requested !== current) {
    console.log(`Note: package.json is on ${current}, you asked for ${version}.`)
  }
  if (!tagExists(version)) {
    console.log(`Note: no local tag v${version} — check the version is right.`)
  }

  console.log(`\nStaged releases:\n`)
  try {
    // Advisory only: a listing failure (not logged in, nothing staged) must not
    // stop the approve itself from running and reporting the real reason.
    execFileSync('npm', ['stage', 'list'], { stdio: 'inherit' })
  } catch {
    console.log('  (could not list staged releases)')
  }

  console.log(`\n${action === 'approve' ? 'Approving' : 'Rejecting'} ${spec} …`)
  console.log('This prompts for 2FA — it is the release gate, so it cannot be automated.\n')

  try {
    // stdio must be inherited: the 2FA prompt needs the real terminal.
    execFileSync('npm', ['stage', action, spec], { stdio: 'inherit' })
  } catch {
    console.error(`\n✖ \`npm stage ${action} ${spec}\` failed — see the error above.`)
    process.exit(1)
  }

  if (action === 'approve') {
    console.log(`\n✅ ${spec} approved. Confirm with:\n    npm view ${name} dist-tags\n`)
  } else {
    console.log(`\n✅ ${spec} rejected and discarded.\n`)
  }
}

if (require.main === module) main(process.argv)

module.exports = { parseArgs, tooOld }

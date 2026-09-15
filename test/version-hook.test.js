'use strict'

// Phase 3 of feat-managed-file-upgrade-safety: the `version` npm script is
// migrated, not replaced.
//
// The motivating case is real. A consumer's hook interposes a step:
//
//   generate-changelog && generate-releases
//     && prettier --write CHANGELOG.md RELEASES.md     <- theirs
//     && git add CHANGELOG.md RELEASES.md
//
// The old code composed the canonical command and assigned it whole, so the
// prettier step vanished on upgrade — and they found out at the next release,
// when a format gate failed on generated files. On the release commit, which is
// the worst possible place to discover it.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { init, planVersionHook, splitSteps } = require('../src/init.js')

const GEN_CL = 'node scripts/generate-changelog.cjs'
const GEN_REL = 'node scripts/generate-releases.cjs'
const ADD = 'git add CHANGELOG.md RELEASES.md'
const GUARD = 'node scripts/check-release-index.cjs'
const CANONICAL = [GEN_CL, GEN_REL, ADD, GUARD]

const tmpProject = () => fs.mkdtempSync(path.join(os.tmpdir(), 'skittership-hook-'))

const release = ({ changelog = true, releases = true, versionHook = true } = {}) => ({
  changelog: { enabled: changelog, file: 'CHANGELOG.md' },
  releases: { enabled: releases, file: 'RELEASES.md', productName: 'Demo', scopeAreas: {} },
  versionHook,
})

function project(versionScript) {
  const dir = tmpProject()
  const pkg = { name: 't', version: '1.0.0', scripts: {} }
  if (versionScript) pkg.scripts.version = versionScript
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2))
  return dir
}

const versionOf = (dir) =>
  JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).scripts.version

async function run(dir, { force = false, rel = release() } = {}) {
  const original = process.stdout.write
  let out = ''
  process.stdout.write = (chunk) => {
    out += chunk
    return true
  }
  try {
    await init({ dir, force, claudeMd: false, mode: 'update', release: rel })
  } finally {
    process.stdout.write = original
  }
  return out
}

// --- the pure plan ----------------------------------------------------------

test('splitSteps splits on && and trims', () => {
  assert.deepStrictEqual(splitSteps(' a  &&  b && c '), ['a', 'b', 'c'])
  assert.deepStrictEqual(splitSteps(''), [])
})

test('no existing script: write the canonical one', () => {
  assert.deepStrictEqual(planVersionHook(undefined, CANONICAL), {
    action: 'write',
    script: CANONICAL.join(' && '),
  })
})

test('every step present and well ordered: leave it alone', () => {
  assert.deepStrictEqual(planVersionHook(CANONICAL.join(' && '), CANONICAL), { action: 'skip' })
})

test('an extra step is preserved and the missing guard appended last', () => {
  const theirs = [GEN_CL, GEN_REL, 'prettier --write CHANGELOG.md RELEASES.md', ADD].join(' && ')
  const plan = planVersionHook(theirs, CANONICAL)

  assert.strictEqual(plan.action, 'append')
  assert.ok(plan.script.includes('prettier --write'), 'their step survived')
  assert.ok(plan.script.endsWith(GUARD), 'the guard is last')
  // Position matters: the guard inspects the index right before npm commits.
  assert.deepStrictEqual(splitSteps(plan.script).slice(-2), [ADD, GUARD])
})

test('a missing generator is warned about, never reinstated', () => {
  // A consumer who deliberately dropped release notes.
  const theirs = [GEN_CL, 'git add CHANGELOG.md', GUARD].join(' && ')
  const plan = planVersionHook(theirs, CANONICAL)

  assert.strictEqual(plan.action, 'warn')
  assert.strictEqual(plan.reason, 'missing')
  assert.ok(plan.missing.includes(GEN_REL))
})

test('a guard that is present but not last is warned about, not reordered', () => {
  const theirs = [GEN_CL, GEN_REL, GUARD, ADD].join(' && ')
  const plan = planVersionHook(theirs, CANONICAL)

  assert.strictEqual(plan.action, 'warn')
  assert.strictEqual(plan.reason, 'order')
})

// --- end to end -------------------------------------------------------------

test('a customised hook keeps its extra step and gains the guard', async () => {
  const theirs = [GEN_CL, GEN_REL, 'prettier --write CHANGELOG.md RELEASES.md', ADD].join(' && ')
  const dir = project(theirs)

  await run(dir)

  const after = versionOf(dir)
  assert.ok(after.includes('prettier --write'), 'the step that used to vanish is still there')
  assert.ok(after.endsWith(GUARD), 'and the guard was added last')
})

test('a complete hook is left byte-identical', async () => {
  const theirs = CANONICAL.join(' && ')
  const dir = project(theirs)

  await run(dir)

  assert.strictEqual(versionOf(dir), theirs)
})

test('a hook missing a generator is warned about, not rewritten', async () => {
  const theirs = [GEN_CL, 'git add CHANGELOG.md', GUARD].join(' && ')
  const dir = project(theirs)

  const out = await run(dir)

  assert.strictEqual(versionOf(dir), theirs, 'unchanged')
  assert.match(out, /missing/)
  assert.match(out, /generate-releases/)
})

test('a project with no version script gets the canonical one', async () => {
  const dir = project(null)
  await run(dir)
  assert.strictEqual(versionOf(dir), CANONICAL.join(' && '))
})

test('--force replaces whatever is there', async () => {
  const theirs = [GEN_CL, 'prettier --write CHANGELOG.md', ADD].join(' && ')
  const dir = project(theirs)

  await run(dir, { force: true })

  assert.strictEqual(versionOf(dir), CANONICAL.join(' && '), '--force is the escape hatch')
})

// --- stays-silent -----------------------------------------------------------

// The helper scripts already had the right shape — skipped when customized
// unless --force. Pinned so the version-hook rework cannot quietly change it.
test('a customised helper script is preserved, and --force takes it back', async () => {
  const dir = project(null)
  const pkgPath = path.join(dir, 'package.json')
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
  pkg.scripts.changelog = 'node scripts/generate-changelog.cjs && prettier --write CHANGELOG.md'
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2))

  await run(dir)
  assert.match(
    JSON.parse(fs.readFileSync(pkgPath, 'utf8')).scripts.changelog,
    /prettier/,
    'their helper survived',
  )

  await run(dir, { force: true })
  assert.doesNotMatch(
    JSON.parse(fs.readFileSync(pkgPath, 'utf8')).scripts.changelog,
    /prettier/,
    '--force still replaces it',
  )
})

test('release generation disabled: no hook and no warning', async () => {
  const dir = project(null)
  const out = await run(dir, {
    rel: release({ changelog: false, releases: false, versionHook: true }),
  })

  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
  assert.strictEqual(pkg.scripts.version, undefined, 'no hook written')
  assert.doesNotMatch(out, /version.*script/i, 'and nothing complained about it')
})

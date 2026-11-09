'use strict'

// The release scripts are opt-in: `release.staged: true` installs the staged
// publish approver and its `approve`/`staged` helpers, and nothing about a
// project without a `release` key changes.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const BIN = path.join(__dirname, '..', 'bin', 'skittership.js')
const { loadConfig, CONFIG_FILE } = require('../src/config.js')

function project({ release, versionHook = true, scripts = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skittership-relinst-'))
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 't', version: '1.0.0', scripts }, null, 2),
  )
  const config = {
    version: 1,
    changelog: { enabled: true, file: 'CHANGELOG.md' },
    releases: { enabled: true, file: 'RELEASES.md', productName: 't', scopeAreas: {} },
    versionHook,
  }
  if (release !== undefined) config.release = release
  fs.writeFileSync(path.join(dir, CONFIG_FILE), JSON.stringify(config))
  return dir
}

const run = (dir, cmd, ...flags) =>
  execFileSync('node', [BIN, cmd, '--yes', '--no-claude-md', ...flags], {
    cwd: dir,
    encoding: 'utf8',
    stdio: 'pipe',
  })

const scriptsOf = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).scripts
const has = (dir, rel) => fs.existsSync(path.join(dir, rel))

test('release.staged installs the approver and its helpers', () => {
  for (const cmd of ['init', 'update']) {
    const dir = project({ release: { staged: true } })
    run(dir, cmd)
    assert.ok(has(dir, 'scripts/approve-release.cjs'), cmd)
    assert.strictEqual(scriptsOf(dir).approve, 'node scripts/approve-release.cjs', cmd)
    assert.strictEqual(scriptsOf(dir).staged, 'npm stage list', cmd)
  }
})

test('the helpers are wired even when the version hook is off', () => {
  // A monorepo root refuses `npm version` and still approves package releases.
  const dir = project({ release: { staged: true }, versionHook: false })
  run(dir, 'init')
  assert.strictEqual(scriptsOf(dir).approve, 'node scripts/approve-release.cjs')
  assert.strictEqual(scriptsOf(dir).version, undefined)
})

test('no release key: no approver, no helpers — stays silent', () => {
  for (const cmd of ['init', 'update']) {
    const dir = project()
    run(dir, cmd)
    assert.ok(!has(dir, 'scripts/approve-release.cjs'), cmd)
    assert.strictEqual(scriptsOf(dir).approve, undefined, cmd)
    assert.strictEqual(scriptsOf(dir).staged, undefined, cmd)
    const cfg = JSON.parse(fs.readFileSync(path.join(dir, CONFIG_FILE), 'utf8'))
    assert.ok(!('release' in cfg), cmd)
  }
})

test('release without staged installs no approver', () => {
  const dir = project({ release: {} })
  run(dir, 'init')
  assert.ok(!has(dir, 'scripts/approve-release.cjs'))
  assert.strictEqual(scriptsOf(dir).approve, undefined)
})

test('a differing approve script of the user’s is kept without --force', () => {
  const dir = project({ release: { staged: true }, scripts: { approve: 'node my-approve.js' } })
  run(dir, 'update')
  assert.strictEqual(scriptsOf(dir).approve, 'node my-approve.js')
  run(dir, 'update', '--force')
  assert.strictEqual(scriptsOf(dir).approve, 'node scripts/approve-release.cjs')
})

test('init writes release back exactly as written', () => {
  const release = { staged: true, somethingLater: ['kept'] }
  const dir = project({ release })
  run(dir, 'init')
  const cfg = JSON.parse(fs.readFileSync(path.join(dir, CONFIG_FILE), 'utf8'))
  assert.deepStrictEqual(cfg.release, release)
})

test('a malformed release refuses on load', () => {
  for (const release of [true, 'yes', [], { staged: 'yes' }]) {
    const dir = project({ release })
    assert.throws(() => loadConfig(dir), /release/, JSON.stringify(release))
  }
})

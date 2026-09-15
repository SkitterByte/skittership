'use strict'

// `update` took no `release` argument, so every release flag was parsed by the
// CLI and then silently dropped: init fell back to the config and wired the
// version hook anyway, with force: true. `update --no-version-hook` therefore
// did the exact opposite of what it was asked — and README documents
// `update --force` as the re-sync command, so this ran on real repos.
//
// The reported case: a monorepo root whose preversion hook exists specifically
// to REFUSE root versioning had the release scripts written into it regardless.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const BIN = path.join(__dirname, '..', 'bin', 'skittership.js')

// versionHook: true in config, so the flag is the only thing that can turn it
// off — which is exactly the case that was broken.
function project({ versionHook = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skittership-flags-'))
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 't', version: '1.0.0', scripts: {} }, null, 2),
  )
  fs.writeFileSync(
    path.join(dir, 'skittership.config.json'),
    JSON.stringify({
      version: 1,
      changelog: { enabled: true, file: 'CHANGELOG.md' },
      releases: { enabled: true, file: 'RELEASES.md', productName: 't', scopeAreas: {} },
      versionHook,
    }),
  )
  return dir
}

const run = (dir, ...args) =>
  execFileSync('node', [BIN, ...args, '--yes'], { cwd: dir, encoding: 'utf8', stdio: 'pipe' })

const scripts = (dir) =>
  JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).scripts || {}

test('update --no-version-hook does not wire the hook', () => {
  const dir = project({ versionHook: true })
  run(dir, 'update', '--no-version-hook')
  assert.strictEqual(scripts(dir).version, undefined, 'version script must not be written')
})

test('update honours the config when no flag is given', () => {
  const dir = project({ versionHook: true })
  run(dir, 'update')
  assert.ok(scripts(dir).version, 'version script is wired from config')
})

test('update --no-version-hook wins over a config that says true', () => {
  const dir = project({ versionHook: true })
  run(dir, 'update', '--no-version-hook')
  const s = scripts(dir)
  assert.strictEqual(s.version, undefined)
  // Pinning current behaviour, not endorsing it: the changelog/releases helper
  // scripts are written INSIDE wireVersionHook, so declining the hook also
  // skips them — even though `npm run changelog` is the documented manual path
  // and does not need the hook. Worth separating; flagged, not changed here.
  assert.strictEqual(s.changelog, undefined, 'helpers are currently gated on the hook too')
})

test('update --version-hook wins over a config that says false', () => {
  const dir = project({ versionHook: false })
  run(dir, 'update', '--version-hook')
  assert.ok(scripts(dir).version, 'flag overrides config in both directions')
})

test('init --no-version-hook still works (was never broken)', () => {
  const dir = project({ versionHook: true })
  run(dir, 'init', '--no-version-hook')
  assert.strictEqual(scripts(dir).version, undefined)
})

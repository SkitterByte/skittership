'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { loadConfig, DEFAULT_CONFIG, SCHEMA_VERSION, CONFIG_FILE } = require('../src/config.js')

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'skittership-cfg-'))
}

function writeConfig(dir, obj) {
  fs.writeFileSync(path.join(dir, CONFIG_FILE), JSON.stringify(obj), 'utf-8')
}

test('returns defaults when no config file is present', () => {
  const dir = tmpDir()
  const cfg = loadConfig(dir)
  assert.strictEqual(cfg.version, SCHEMA_VERSION)
  assert.strictEqual(cfg.changelog.enabled, true)
  assert.strictEqual(cfg.changelog.file, 'CHANGELOG.md')
  assert.strictEqual(cfg.releases.enabled, true)
  assert.strictEqual(cfg.releases.file, 'RELEASES.md')
  assert.deepStrictEqual(cfg.releases.scopeAreas, {})
  assert.strictEqual(cfg.versionHook, true)
})

test('defaults productName to the repo dir basename', () => {
  const dir = tmpDir()
  const cfg = loadConfig(dir)
  assert.strictEqual(cfg.releases.productName, path.basename(dir))
})

test('merges a partial config over defaults', () => {
  const dir = tmpDir()
  writeConfig(dir, { releases: { file: 'NOTES.md', scopeAreas: { api: 'API' } } })
  const cfg = loadConfig(dir)
  // overridden
  assert.strictEqual(cfg.releases.file, 'NOTES.md')
  assert.deepStrictEqual(cfg.releases.scopeAreas, { api: 'API' })
  // untouched defaults
  assert.strictEqual(cfg.releases.enabled, true)
  assert.strictEqual(cfg.changelog.file, 'CHANGELOG.md')
  assert.strictEqual(cfg.releases.productName, path.basename(dir))
})

test('an explicit productName overrides the dir basename', () => {
  const dir = tmpDir()
  writeConfig(dir, { releases: { productName: 'Acme Console' } })
  assert.strictEqual(loadConfig(dir).releases.productName, 'Acme Console')
})

test('respects enabled:false flags', () => {
  const dir = tmpDir()
  writeConfig(dir, { changelog: { enabled: false }, releases: { enabled: false } })
  const cfg = loadConfig(dir)
  assert.strictEqual(cfg.changelog.enabled, false)
  assert.strictEqual(cfg.releases.enabled, false)
})

test('ignores unknown keys for forward-compat', () => {
  const dir = tmpDir()
  writeConfig(dir, { wibble: true, releases: { unknown: 'x', file: 'R.md' } })
  const cfg = loadConfig(dir)
  assert.strictEqual(cfg.releases.file, 'R.md')
  assert.strictEqual(cfg.wibble, undefined)
  assert.strictEqual(cfg.releases.unknown, undefined)
})

test('throws a clear error on malformed JSON', () => {
  const dir = tmpDir()
  fs.writeFileSync(path.join(dir, CONFIG_FILE), '{ not valid json', 'utf-8')
  assert.throws(() => loadConfig(dir), /Invalid skittership\.config\.json/)
})

test('DEFAULT_CONFIG is exported and frozen', () => {
  assert.strictEqual(DEFAULT_CONFIG.version, SCHEMA_VERSION)
  assert.ok(Object.isFrozen(DEFAULT_CONFIG))
})

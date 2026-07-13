'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  init,
  SKILLS,
  RULES,
  migrateLegacyConfig,
  CONFIG_FILE,
  LEGACY_CONFIG_FILE,
} = require('../src/init.js')
const { parse, resolveRelease } = require('../src/cli.js')
const { loadConfig } = require('../src/config.js')

function tmpProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'skittership-'))
}

// Build a release config like the CLI passes into init().
function release({ changelog = true, releases = true, versionHook = false } = {}) {
  return {
    changelog: { enabled: changelog, file: 'CHANGELOG.md' },
    releases: { enabled: releases, file: 'RELEASES.md', productName: 'Demo', scopeAreas: {} },
    versionHook,
  }
}

const exists = (dir, ...p) => fs.existsSync(path.join(dir, ...p))
const readPkg = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))

test('init installs the commit skill and commit-message rule', async () => {
  const dir = tmpProject()
  await init({ dir, force: false, claudeMd: true, mode: 'init', release: release() })

  for (const name of SKILLS) {
    assert.ok(exists(dir, '.claude', 'skills', name, 'SKILL.md'), `skill ${name} installed`)
  }
  for (const r of RULES) {
    assert.ok(exists(dir, '.claude', 'rules', r), `rule ${r} installed`)
  }
  assert.ok(exists(dir, '.claude', 'skills', 'commit', 'SKILL.md'), 'commit skill installed')
  assert.ok(exists(dir, '.claude', 'rules', 'commit-messages.md'), 'commit rule installed')
})

test('init patches CLAUDE.md with the release tooling section', async () => {
  const dir = tmpProject()
  await init({ dir, force: false, claudeMd: true, mode: 'init', release: release() })
  const claude = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8')
  assert.match(claude, /## Release tooling/)
  assert.match(claude, /<!-- skittership:start -->/)
})

test('init does not install spec skills (release-only package)', async () => {
  const dir = tmpProject()
  await init({ dir, force: false, claudeMd: false, mode: 'init', release: release() })
  assert.deepStrictEqual(SKILLS, ['commit'], 'only the commit skill is registered')
  assert.ok(!exists(dir, '.claude', 'skills', 'spec', 'SKILL.md'), 'no /spec skill')
  assert.ok(!exists(dir, 'specs'), 'no specs/ folders')
})

// --- release tooling --------------------------------------------------------

test('writes skittership.config.json with the chosen values', async () => {
  const dir = tmpProject()
  await init({ dir, force: false, claudeMd: false, mode: 'init', release: release() })
  const cfg = JSON.parse(fs.readFileSync(path.join(dir, CONFIG_FILE), 'utf8'))
  assert.strictEqual(cfg.version, 1)
  assert.strictEqual(cfg.changelog.file, 'CHANGELOG.md')
  assert.strictEqual(cfg.releases.productName, 'Demo')
  assert.strictEqual(cfg.versionHook, false)
})

test('copies scripts only for enabled features, with the shared lib', async () => {
  const dir = tmpProject()
  await init({
    dir,
    force: false,
    claudeMd: false,
    mode: 'init',
    release: release({ changelog: true, releases: false }),
  })
  assert.ok(exists(dir, 'scripts', 'generate-changelog.js'), 'changelog script copied')
  assert.ok(!exists(dir, 'scripts', 'generate-releases.js'), 'releases script NOT copied')
  assert.ok(exists(dir, 'scripts', 'lib', 'git-commits.js'), 'shared lib copied')
  assert.ok(exists(dir, 'scripts', 'lib', 'config.js'), 'config lib copied')
})

test('copies no scripts when both features are disabled', async () => {
  const dir = tmpProject()
  await init({
    dir,
    force: false,
    claudeMd: false,
    mode: 'init',
    release: release({ changelog: false, releases: false }),
  })
  assert.ok(!exists(dir, 'scripts'), 'scripts/ not created')
})

test('wires the version hook when package.json exists and is opted in', async () => {
  const dir = tmpProject()
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'demo' }), 'utf8')
  await init({ dir, force: false, claudeMd: false, mode: 'init', release: release({ versionHook: true }) })

  const scripts = readPkg(dir).scripts
  assert.match(scripts.version, /generate-changelog\.js/)
  assert.match(scripts.version, /generate-releases\.js/)
  assert.match(scripts.version, /git add CHANGELOG\.md RELEASES\.md/)
  assert.strictEqual(scripts.changelog, 'node scripts/generate-changelog.js')
  assert.strictEqual(scripts['releases:retro'], 'node scripts/generate-releases.js --retro')
})

test('skips the version hook when no package.json is present', async () => {
  const dir = tmpProject()
  await init({ dir, force: false, claudeMd: false, mode: 'init', release: release({ versionHook: true }) })
  assert.ok(!exists(dir, 'package.json'), 'no package.json was created')
})

test('preserves a custom version script without --force, overwrites with it', async () => {
  const dir = tmpProject()
  const pkgPath = path.join(dir, 'package.json')
  fs.writeFileSync(pkgPath, JSON.stringify({ name: 'demo', scripts: { version: 'my-custom' } }), 'utf8')

  await init({ dir, force: false, claudeMd: false, mode: 'init', release: release({ versionHook: true }) })
  assert.strictEqual(readPkg(dir).scripts.version, 'my-custom', 'custom version kept without --force')
  assert.strictEqual(readPkg(dir).scripts.changelog, 'node scripts/generate-changelog.js')

  await init({ dir, force: true, claudeMd: false, mode: 'init', release: release({ versionHook: true }) })
  assert.match(readPkg(dir).scripts.version, /generate-changelog\.js/, '--force overwrote version')
})

test('update re-syncs scripts without clobbering config', async () => {
  const dir = tmpProject()
  await init({ dir, force: false, claudeMd: false, mode: 'init', release: release() })

  const cfgPath = path.join(dir, CONFIG_FILE)
  const edited = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
  edited.releases.productName = 'Renamed'
  fs.writeFileSync(cfgPath, JSON.stringify(edited), 'utf8')
  const scriptPath = path.join(dir, 'scripts', 'generate-changelog.js')
  fs.writeFileSync(scriptPath, 'EDITED', 'utf8')

  await init({ dir, force: true, claudeMd: false, mode: 'update' })

  assert.strictEqual(loadConfig(dir).releases.productName, 'Renamed', 'config left untouched')
  assert.notStrictEqual(fs.readFileSync(scriptPath, 'utf8'), 'EDITED', 'script re-synced')
})

test('init is idempotent — second run does not clobber edits', async () => {
  const dir = tmpProject()
  await init({ dir, force: false, claudeMd: true, mode: 'init', release: release() })

  const skill = path.join(dir, '.claude', 'skills', 'commit', 'SKILL.md')
  fs.writeFileSync(skill, 'EDITED')
  await init({ dir, force: false, claudeMd: true, mode: 'init', release: release() })
  assert.equal(fs.readFileSync(skill, 'utf8'), 'EDITED', 'edit preserved without --force')
})

test('update --force overwrites skill files', async () => {
  const dir = tmpProject()
  await init({ dir, force: false, claudeMd: true, mode: 'init', release: release() })

  const skill = path.join(dir, '.claude', 'skills', 'commit', 'SKILL.md')
  fs.writeFileSync(skill, 'EDITED')
  await init({ dir, force: true, claudeMd: true, mode: 'update' })
  assert.notEqual(fs.readFileSync(skill, 'utf8'), 'EDITED', 'update overwrote the skill')
})

// --- legacy config migration ------------------------------------------------

test('migrateLegacyConfig renames skitterspec.config.json → skittership.config.json', () => {
  const dir = tmpProject()
  fs.writeFileSync(path.join(dir, LEGACY_CONFIG_FILE), JSON.stringify({ version: 1 }), 'utf8')
  const result = migrateLegacyConfig(dir)
  assert.strictEqual(result.migrated, true)
  assert.ok(exists(dir, CONFIG_FILE), 'new config present')
  assert.ok(!exists(dir, LEGACY_CONFIG_FILE), 'legacy config gone')
})

test('migrateLegacyConfig is a no-op when the new config already exists', () => {
  const dir = tmpProject()
  fs.writeFileSync(path.join(dir, CONFIG_FILE), JSON.stringify({ version: 1 }), 'utf8')
  fs.writeFileSync(path.join(dir, LEGACY_CONFIG_FILE), JSON.stringify({ version: 1 }), 'utf8')
  const result = migrateLegacyConfig(dir)
  assert.strictEqual(result.migrated, false)
  assert.ok(exists(dir, LEGACY_CONFIG_FILE), 'legacy left untouched — new config wins')
})

test('migrateLegacyConfig is a no-op when there is nothing to migrate', () => {
  const dir = tmpProject()
  assert.strictEqual(migrateLegacyConfig(dir).migrated, false)
})

test('init carries values over from a legacy skitterspec.config.json', async () => {
  const dir = tmpProject()
  // an existing skitterspec-era setup with a custom product name + filename
  fs.writeFileSync(
    path.join(dir, LEGACY_CONFIG_FILE),
    JSON.stringify({ version: 1, releases: { productName: 'Legacy App', file: 'NOTES.md' } }),
    'utf8',
  )
  // direct init() (no release arg) falls back to the migrated on-disk config
  await init({ dir, force: false, claudeMd: false, mode: 'init' })

  assert.ok(!exists(dir, LEGACY_CONFIG_FILE), 'legacy config renamed away')
  const cfg = loadConfig(dir)
  assert.strictEqual(cfg.releases.productName, 'Legacy App', 'product name carried over')
  assert.strictEqual(cfg.releases.file, 'NOTES.md', 'releases filename carried over')
})

// --- non-interactive flag resolution (drives the no-TTY / --yes path) -------

test('resolveRelease applies flags over the existing/default config', () => {
  const dir = tmpProject()
  const existing = loadConfig(dir) // all defaults; productName = dir basename
  const { opts } = parse(['--no-changelog', '--releases-file=NOTES.md', '--product-name=Acme'])
  const r = resolveRelease(existing, opts)
  assert.strictEqual(r.changelog.enabled, false, 'flag disabled changelog')
  assert.strictEqual(r.releases.enabled, true, 'releases default kept')
  assert.strictEqual(r.releases.file, 'NOTES.md', 'releases filename from flag')
  assert.strictEqual(r.releases.productName, 'Acme', 'product name from flag')
})

test('resolveRelease falls back to existing values when no flags given', () => {
  const dir = tmpProject()
  const existing = loadConfig(dir)
  const { opts } = parse([])
  const r = resolveRelease(existing, opts)
  assert.strictEqual(r.changelog.enabled, true)
  assert.strictEqual(r.releases.file, 'RELEASES.md')
  assert.strictEqual(r.releases.productName, path.basename(dir))
})

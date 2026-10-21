'use strict'

// Shipping release-hotfix.cjs through init/update, and the upgrade a consumer
// on 2.0.7 takes to get it. The first consumer (ereqs) has EDITED copies of
// three managed files and its own `release:hotfix` script, so the upgrade has
// to add the new file while keeping both — and say so.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { init } = require('../src/init.js')
const { hashContent, readManifest, writeManifest } = require('../src/manifest.js')

const ASSETS = path.join(__dirname, '..', 'assets')
const HOTFIX_REL = 'scripts/release-hotfix.cjs'

const release = (extra = {}) => ({
  changelog: { enabled: true, file: 'CHANGELOG.md' },
  releases: { enabled: true, file: 'RELEASES.md', productName: 'Demo', scopeAreas: {} },
  versionHook: true,
  ...extra,
})

const read = (dir, rel) => fs.readFileSync(path.join(dir, rel), 'utf8')
const write = (dir, rel, body) => fs.writeFileSync(path.join(dir, rel), body)
const pkgScripts = (dir) => JSON.parse(read(dir, 'package.json')).scripts

function project(scripts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skittership-install-hotfix-'))
  write(dir, 'package.json', JSON.stringify({ name: 'demo', version: '1.0.0', scripts }, null, 2))
  return dir
}

async function capture(fn) {
  const original = process.stdout.write
  let out = ''
  process.stdout.write = (chunk) => {
    out += chunk
    return true
  }
  try {
    await fn()
  } finally {
    process.stdout.write = original
  }
  return out
}

const run = (dir, mode, { force = false, rel = release() } = {}) =>
  capture(() => init({ dir, force, claudeMd: false, mode, release: rel }))

test('init installs release-hotfix.cjs, records it, and wires release:hotfix', async () => {
  const dir = project()
  await run(dir, 'init')
  assert.strictEqual(read(dir, HOTFIX_REL), fs.readFileSync(path.join(ASSETS, HOTFIX_REL), 'utf8'))
  assert.strictEqual(readManifest(dir).files[HOTFIX_REL], hashContent(read(dir, HOTFIX_REL)))
  assert.strictEqual(pkgScripts(dir)['release:hotfix'], 'node scripts/release-hotfix.cjs')
})

test('release generation disabled: no hotfix script either', async () => {
  const dir = project()
  const rel = release({
    changelog: { enabled: false, file: 'CHANGELOG.md' },
    releases: { enabled: false, file: 'RELEASES.md', productName: 'Demo', scopeAreas: {} },
  })
  await run(dir, 'init', { rel })
  assert.ok(!fs.existsSync(path.join(dir, HOTFIX_REL)))
})

// The 2.0.7 consumer: a manifest with no entry for the new file, one managed
// file still exactly as 2.0.7 wrote it, and one the consumer edited.
async function on207(scripts) {
  const dir = project(scripts)
  await run(dir, 'init')
  fs.rmSync(path.join(dir, HOTFIX_REL))
  const m = readManifest(dir)
  delete m.files[HOTFIX_REL]
  m.installedVersion = '2.0.7'

  const stale = '// 2.0.7 generate-changelog, untouched\n'
  write(dir, 'scripts/generate-changelog.cjs', stale)
  m.files['scripts/generate-changelog.cjs'] = hashContent(stale)

  const shipped207 = '// 2.0.7 git-commits\n'
  write(dir, 'scripts/lib/git-commits.cjs', `${shipped207}// + RELEASE_BASE_TAG, by hand\n`)
  m.files['scripts/lib/git-commits.cjs'] = hashContent(shipped207)

  writeManifest(dir, m)
  return { dir, stale }
}

test('update from 2.0.7 adds the new script, refreshes untouched files, keeps edited ones', async () => {
  const { dir, stale } = await on207()
  const out = await run(dir, 'update')

  assert.ok(fs.existsSync(path.join(dir, HOTFIX_REL)), 'new script added')
  assert.match(out, /created:[\s\S]*release-hotfix\.cjs/)
  assert.notStrictEqual(read(dir, 'scripts/generate-changelog.cjs'), stale, 'untouched copy refreshed')
  assert.match(read(dir, 'scripts/lib/git-commits.cjs'), /by hand/, 'edited copy kept')
  assert.match(out, /customized — kept[\s\S]*git-commits\.cjs/)
  assert.doesNotMatch(out, /customized — kept[\s\S]*generate-changelog/)
})

// Stays silent: the consumer's own `release:hotfix` survives a plain update.
test('an existing release:hotfix script is kept, and --force takes it', async () => {
  const theirs = 'sh scripts/release-hotfix.sh'
  const { dir } = await on207({ 'release:hotfix': theirs })
  await run(dir, 'update')
  assert.strictEqual(pkgScripts(dir)['release:hotfix'], theirs)
  await run(dir, 'update', { force: true })
  assert.strictEqual(pkgScripts(dir)['release:hotfix'], 'node scripts/release-hotfix.cjs')
})

// --- the hotfix config block survives init's config rewrite ---------------------

test('init keeps a custom hotfix.branchPrefix', async () => {
  const dir = project()
  await run(dir, 'init', { rel: release({ hotfix: { branchPrefix: 'release/' } }) })
  assert.deepStrictEqual(JSON.parse(read(dir, 'skittership.config.json')).hotfix, {
    branchPrefix: 'release/',
  })
})

// Stays silent: the default is not written, so existing configs are unchanged.
test('init writes no hotfix block for the default prefix', async () => {
  const dir = project()
  await run(dir, 'init', { rel: release({ hotfix: { branchPrefix: 'hotfix/' } }) })
  assert.ok(!('hotfix' in JSON.parse(read(dir, 'skittership.config.json'))))
  const again = project()
  await run(again, 'init')
  assert.strictEqual(read(again, 'skittership.config.json'), read(dir, 'skittership.config.json'))
})

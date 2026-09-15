'use strict'

// Phase 1 of feat-managed-file-upgrade-safety: every install and update records
// what it wrote — the installing version, and a hash per managed file.
//
// Nothing here changes install behaviour; it only pins the evidence phase 2
// consumes. The load-bearing assertion is the LAST one: a file the run skipped
// gets no entry, because the manifest must mean "this is what we put there".
// An entry for a file we never opened is exactly the claim phase 2 would act on
// when deciding whether it is safe to overwrite.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { init, SKILLS, RULES, PKG_VERSION } = require('../src/init.js')
const {
  MANIFEST_FILE,
  hashContent,
  readManifest,
  recordedHash,
  writeManifest,
} = require('../src/manifest.js')

const tmpProject = () => fs.mkdtempSync(path.join(os.tmpdir(), 'skittership-manifest-'))

const release = ({ changelog = true, releases = true, versionHook = false } = {}) => ({
  changelog: { enabled: changelog, file: 'CHANGELOG.md' },
  releases: { enabled: releases, file: 'RELEASES.md', productName: 'Demo', scopeAreas: {} },
  versionHook,
})

const manifestOf = (dir) => JSON.parse(fs.readFileSync(path.join(dir, MANIFEST_FILE), 'utf8'))

// --- hashing ----------------------------------------------------------------

test('hashContent is stable, prefixed, and content-sensitive', () => {
  assert.strictEqual(hashContent('abc'), hashContent('abc'))
  assert.match(hashContent('abc'), /^sha256-[0-9a-f]{64}$/)
  assert.notStrictEqual(hashContent('abc'), hashContent('abd'))
  // Line endings matter — that is the point of hashing what we WRITE rather
  // than what a checkout later hands back.
  assert.notStrictEqual(hashContent('a\nb'), hashContent('a\r\nb'))
})

// --- writing ----------------------------------------------------------------

test('a fresh init writes a manifest naming every managed file', async () => {
  const dir = tmpProject()
  await init({ dir, force: false, claudeMd: true, mode: 'init', release: release() })

  const m = manifestOf(dir)
  assert.strictEqual(m.installedVersion, PKG_VERSION)

  const expected = [
    ...SKILLS.map((n) => `.claude/skills/${n}/SKILL.md`),
    ...RULES.map((n) => `.claude/rules/${n}`),
    'scripts/lib/git-commits.cjs',
    'scripts/lib/config.cjs',
    'scripts/generate-changelog.cjs',
    'scripts/generate-releases.cjs',
    'scripts/check-release-index.cjs',
  ]
  for (const key of expected) {
    assert.ok(m.files[key], `${key} is recorded`)
    assert.match(m.files[key], /^sha256-[0-9a-f]{64}$/)
  }
})

test('the recorded hash matches the bytes actually installed', async () => {
  const dir = tmpProject()
  await init({ dir, force: false, claudeMd: true, mode: 'init', release: release() })

  const m = manifestOf(dir)
  for (const [relPath, hash] of Object.entries(m.files)) {
    const onDisk = fs.readFileSync(path.join(dir, relPath), 'utf8')
    assert.strictEqual(hash, hashContent(onDisk), `${relPath} hashes to its recorded value`)
  }
})

test('the manifest is valid JSON with a trailing newline', async () => {
  const dir = tmpProject()
  await init({ dir, force: false, claudeMd: true, mode: 'init', release: release() })

  const raw = fs.readFileSync(path.join(dir, MANIFEST_FILE), 'utf8')
  assert.ok(raw.endsWith('\n'), 'ends with a newline')
  assert.doesNotThrow(() => JSON.parse(raw))
})

test('update refreshes both the hashes and installedVersion', async () => {
  const dir = tmpProject()
  await init({ dir, force: false, claudeMd: true, mode: 'init', release: release() })

  // Simulate a project installed by an older skittership whose files have since
  // drifted from what we ship.
  const target = path.join(dir, 'scripts', 'generate-changelog.cjs')
  fs.writeFileSync(target, '// stale copy from an older release\n')
  writeManifest(dir, {
    installedVersion: '0.0.1',
    files: { 'scripts/generate-changelog.cjs': hashContent('// stale copy from an older release\n') },
  })

  await init({ dir, force: true, claudeMd: true, mode: 'update', release: release() })

  const m = manifestOf(dir)
  assert.strictEqual(m.installedVersion, PKG_VERSION, 'version is refreshed')
  assert.strictEqual(
    m.files['scripts/generate-changelog.cjs'],
    hashContent(fs.readFileSync(target, 'utf8')),
    'hash tracks the refreshed content',
  )
})

// --- the load-bearing case --------------------------------------------------

test('a skipped file gets no manifest entry', async () => {
  const dir = tmpProject()
  // A pre-existing, consumer-authored rule. With force:false the installer
  // leaves it alone and never compares it — so this run establishes nothing
  // about it, and must not claim otherwise.
  const rulePath = path.join(dir, '.claude', 'rules', RULES[0])
  fs.mkdirSync(path.dirname(rulePath), { recursive: true })
  fs.writeFileSync(rulePath, '# my own rule\n')

  await init({ dir, force: false, claudeMd: true, mode: 'init', release: release() })

  const m = manifestOf(dir)
  assert.strictEqual(
    m.files[`.claude/rules/${RULES[0]}`],
    undefined,
    'a file we never opened must not be recorded as ours',
  )
  assert.strictEqual(fs.readFileSync(rulePath, 'utf8'), '# my own rule\n', 'and is left alone')
})

// --- reading ----------------------------------------------------------------

test('an absent or corrupt manifest reads as null, not as a finding', () => {
  const dir = tmpProject()
  assert.strictEqual(readManifest(dir), null, 'absent')

  fs.writeFileSync(path.join(dir, MANIFEST_FILE), '{ not json')
  assert.strictEqual(readManifest(dir), null, 'corrupt is a kind of absent, not a throw')
})

test('recordedHash returns null for anything it cannot vouch for', () => {
  assert.strictEqual(recordedHash(null, 'a.js'), null, 'no manifest')
  assert.strictEqual(recordedHash({ files: {} }, 'a.js'), null, 'no entry')
  assert.strictEqual(recordedHash({ files: { 'a.js': 7 } }, 'a.js'), null, 'non-string entry')
  assert.strictEqual(recordedHash({ files: { 'a.js': 'sha256-x' } }, 'a.js'), 'sha256-x')
})

// --- the report -------------------------------------------------------------

// printReport writes straight to stdout, so intercept there — and always
// restore, or a failure here silences the test runner itself.
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

test('a first install reports the version plainly, with no invented "from"', async () => {
  const dir = tmpProject()
  const out = await capture(() =>
    init({ dir, force: false, claudeMd: true, mode: 'init', release: release() }),
  )
  assert.ok(out.includes(`skittership init ${PKG_VERSION} \u2192`), out.split('\n')[1])
  assert.ok(!out.includes(' \u2192 ' + PKG_VERSION + ' \u2192'), 'no transition when there is none')
})

test('an upgrade reports the transition it made', async () => {
  const dir = tmpProject()
  await init({ dir, force: false, claudeMd: true, mode: 'init', release: release() })
  writeManifest(dir, { installedVersion: '2.0.0', files: {} })

  const out = await capture(() =>
    init({ dir, force: true, claudeMd: true, mode: 'update', release: release() }),
  )
  assert.ok(out.includes(`2.0.0 \u2192 ${PKG_VERSION}`), out.split('\n')[1])
})

test('re-running the same version does not report a transition to itself', async () => {
  const dir = tmpProject()
  await init({ dir, force: false, claudeMd: true, mode: 'init', release: release() })
  const out = await capture(() =>
    init({ dir, force: true, claudeMd: true, mode: 'update', release: release() }),
  )
  assert.ok(!out.includes(`${PKG_VERSION} \u2192 ${PKG_VERSION}`), 'no self-transition')
})

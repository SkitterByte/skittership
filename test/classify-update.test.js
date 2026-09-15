'use strict'

// Phase 2 of feat-managed-file-upgrade-safety: `update` stops overwriting files
// the consumer edited.
//
// Two of these are stays-silent tests and they matter more than the headline
// ones. A feature that keeps files is one bug away from keeping EVERYTHING —
// which would freeze every consumer at their installed version and look like
// "update does nothing" rather than like a failure. So the ordinary upgrade
// path is pinned here just as hard as the protective behaviour.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { init, SKILLS } = require('../src/init.js')
const { MANIFEST_FILE, hashContent, readManifest, writeManifest } = require('../src/manifest.js')

const BIN = path.join(__dirname, '..', 'bin', 'skittership.js')
const tmpProject = () => fs.mkdtempSync(path.join(os.tmpdir(), 'skittership-classify-'))

const release = ({ changelog = true, releases = true, versionHook = false } = {}) => ({
  changelog: { enabled: changelog, file: 'CHANGELOG.md' },
  releases: { enabled: releases, file: 'RELEASES.md', productName: 'Demo', scopeAreas: {} },
  versionHook,
})

const SKILL_REL = path.join('.claude', 'skills', SKILLS[0], 'SKILL.md')
const GEN_REL = path.join('scripts', 'generate-releases.cjs')

const read = (dir, relPath) => fs.readFileSync(path.join(dir, relPath), 'utf8')
const write = (dir, relPath, body) => fs.writeFileSync(path.join(dir, relPath), body)

async function installed() {
  const dir = tmpProject()
  await init({ dir, force: false, claudeMd: true, mode: 'init', release: release() })
  return dir
}

// printReport writes to stdout; intercept and always restore.
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

const update = (dir, force = false) =>
  capture(() => init({ dir, force, claudeMd: true, mode: 'update', release: release() }))

// --- the protective behaviour ----------------------------------------------

test('an edited managed file survives update and is reported customized', async () => {
  const dir = await installed()
  write(dir, SKILL_REL, 'MY OWN VERSION\n')

  const out = await update(dir)

  assert.strictEqual(read(dir, SKILL_REL), 'MY OWN VERSION\n', 'the edit survived')
  assert.match(out, /customized — kept/)
  assert.match(out, /skills\/commit\/SKILL\.md/)
  assert.match(out, /--force/, 'the remedy is on the line')
})

test('an edited generator script survives too — not just skills and rules', async () => {
  const dir = await installed()
  write(dir, GEN_REL, '// our flag-report integration\n')

  await update(dir)

  assert.strictEqual(read(dir, GEN_REL), '// our flag-report integration\n')
})

test('--force overwrites a customized file', async () => {
  const dir = await installed()
  write(dir, SKILL_REL, 'MY OWN VERSION\n')

  await update(dir, true)

  assert.notStrictEqual(read(dir, SKILL_REL), 'MY OWN VERSION\n', '--force took the new version')
})

// --- the ordinary upgrade must still work ----------------------------------

test('an untouched managed file IS overwritten by a plain update', async () => {
  const dir = await installed()
  // Our own older copy: on disk it differs from what we now ship, but its hash
  // is exactly what the manifest says we last wrote.
  const stale = '// an older release of this file\n'
  write(dir, GEN_REL, stale)
  const m = readManifest(dir)
  m.files['scripts/generate-releases.cjs'] = hashContent(stale)
  writeManifest(dir, m)

  const out = await update(dir)

  assert.notStrictEqual(read(dir, GEN_REL), stale, 'our own stale copy was refreshed')
  assert.doesNotMatch(out, /customized — kept[\s\S]*generate-releases/, 'not misreported as an edit')
})

test('a file already equal to the new asset is unchanged, not customized', async () => {
  const dir = await installed()
  const out = await update(dir)
  assert.doesNotMatch(out, /customized — kept/, 'a current install has nothing customized')
})

// --- stays-silent -----------------------------------------------------------

test('no manifest: nothing is overwritten and nothing is called customized', async () => {
  const dir = await installed()
  // The pre-provenance consumer: files that differ from what we ship, and no
  // record of who wrote them. Not knowing is not evidence of an edit.
  write(dir, SKILL_REL, 'FROM AN OLDER SKITTERSHIP\n')
  write(dir, GEN_REL, '// from an older skittership\n')
  fs.rmSync(path.join(dir, MANIFEST_FILE))

  const out = await update(dir)

  assert.strictEqual(read(dir, SKILL_REL), 'FROM AN OLDER SKITTERSHIP\n', 'kept')
  assert.strictEqual(read(dir, GEN_REL), '// from an older skittership\n', 'kept')
  assert.doesNotMatch(out, /customized — kept/, 'absence is not an accusation')
  assert.match(out, /not recorded — kept/)
})

test('a file the consumer deleted is re-created, not reported as an edit', async () => {
  const dir = await installed()
  fs.rmSync(path.join(dir, SKILL_REL))

  const out = await update(dir)

  assert.ok(fs.existsSync(path.join(dir, SKILL_REL)), 're-created')
  assert.doesNotMatch(out, /customized — kept/)
  assert.match(out, /created/)
})

// --- provenance across runs -------------------------------------------------

test('a kept file keeps its prior manifest entry, so it stays customized', async () => {
  const dir = await installed()
  const ours = readManifest(dir).files[`.claude/skills/${SKILLS[0]}/SKILL.md`]
  write(dir, SKILL_REL, 'MY OWN VERSION\n')

  await update(dir)
  const after = readManifest(dir).files[`.claude/skills/${SKILLS[0]}/SKILL.md`]
  assert.strictEqual(after, ours, 'the record of what WE last wrote is carried forward')

  // Without that, the next run would downgrade it to "not recorded" and lose
  // the distinction this feature exists to make.
  const out = await update(dir)
  assert.match(out, /customized — kept/)
  assert.doesNotMatch(out, /not recorded — kept[\s\S]*SKILL\.md/)
})

// --- exit status ------------------------------------------------------------

test('keeping files still exits 0', async () => {
  const dir = await installed()
  write(dir, SKILL_REL, 'MY OWN VERSION\n')

  // execFileSync throws on a non-zero exit; keeping a file is an expected
  // outcome, and a scripted setup step must not break on it.
  const out = execFileSync('node', [BIN, 'update', '--dir', dir], { encoding: 'utf8' })
  assert.match(out, /customized — kept/)
})

// --- first-upgrade guidance -------------------------------------------------

// The moment of confusion is the run itself: a first upgrade keeps everything
// for lack of a manifest, so the report is a list of "not recorded — kept" and
// nothing else. Without an explanation it reads as "update did nothing".

test('a first upgrade explains why nothing was updated', async () => {
  const dir = await installed()
  write(dir, SKILL_REL, 'FROM AN OLDER SKITTERSHIP\n')
  fs.rmSync(path.join(dir, MANIFEST_FILE))

  const out = await update(dir)

  assert.match(out, /Why nothing was updated/)
  assert.match(out, /--force/, 'names the remedy')
  assert.match(out, /on top of the new files/i, 'warns against restoring wholesale')
})

test('no guidance once a manifest exists', async () => {
  const dir = await installed()
  write(dir, SKILL_REL, 'MY OWN VERSION\n')

  const out = await update(dir)

  assert.match(out, /customized — kept/, 'it is customized, not unrecorded')
  assert.doesNotMatch(out, /Why nothing was updated/, 'the explanation does not apply')
})

// Stays-silent: a manifest-less project whose files all already match ours has
// nothing kept, so there is nothing to explain and the notice must not fire.
test('no guidance when nothing was actually kept', async () => {
  const dir = await installed()
  fs.rmSync(path.join(dir, MANIFEST_FILE))

  const out = await update(dir)

  assert.doesNotMatch(out, /Why nothing was updated/)
})

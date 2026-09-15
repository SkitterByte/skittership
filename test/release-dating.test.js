'use strict'

// Re-running a generator over an ALREADY RELEASED version re-stamped its
// heading with today's date, so a shipped release silently claimed to have
// gone out days later than it did. Reported from a consumer repo: a 2.0.0
// section dated 2026-09-09 came back as 2026-09-15.
//
// The fix dates a section by its tag when one exists. getTagDate falls back to
// today when it does not, which is exactly the `npm version` path — the version
// being released has no tag yet — so both cases are pinned here: changing one
// must not move the other.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const ASSETS = path.join(__dirname, '..', 'assets', 'scripts')
const CHANGELOG = path.join(ASSETS, 'generate-changelog.cjs')

const TODAY = new Date().toISOString().split('T')[0]
const TAG_DAY = '2026-01-02'

// A repo whose v2.0.0 tag is deliberately backdated, so "the tag's date" and
// "today" cannot be confused for one another.
function releasedRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skittership-dating-'))
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' })
  git('init', '-q', '.')
  git('config', 'user.email', 't@t')
  git('config', 'user.name', 'T')
  fs.writeFileSync(
    path.join(dir, 'skittership.config.json'),
    JSON.stringify({
      version: 1,
      changelog: { enabled: true, file: 'CHANGELOG.md' },
      releases: { enabled: true, file: 'RELEASES.md', productName: 't', scopeAreas: {} },
    }),
  )
  const setVersion = (v) =>
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 't', version: v }))

  setVersion('1.0.0')
  git('add', '-A')
  git('commit', '-q', '-m', 'chore: init')

  fs.writeFileSync(path.join(dir, 'shipped.txt'), 'x\n')
  setVersion('2.0.0')
  git('add', '-A')
  execFileSync('git', ['commit', '-q', '--date', `${TAG_DAY}T10:00:00`, '-m', 'feat(core): shipped'], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, GIT_COMMITTER_DATE: `${TAG_DAY}T10:00:00` },
  })
  git('tag', 'v2.0.0')

  // Work done after the release, belonging to the NEXT version.
  fs.writeFileSync(path.join(dir, 'later.txt'), 'x\n')
  git('add', '-A')
  git('commit', '-q', '-m', 'feat(core): later')

  return { dir, setVersion }
}

const gen = (dir) => execFileSync('node', [CHANGELOG], { cwd: dir, encoding: 'utf8' })
const headings = (dir) =>
  fs
    .readFileSync(path.join(dir, 'CHANGELOG.md'), 'utf8')
    .split('\n')
    .filter((l) => l.startsWith('## ['))

test('a released version keeps its tag date, not today', () => {
  const { dir } = releasedRepo()
  gen(dir) // package.json still reads 2.0.0 — the bump has not happened
  assert.deepStrictEqual(headings(dir), [`## [2.0.0] - ${TAG_DAY}`])
})

test('re-running is idempotent and never re-dates a shipped release', () => {
  const { dir } = releasedRepo()
  gen(dir)
  const first = fs.readFileSync(path.join(dir, 'CHANGELOG.md'), 'utf8')
  gen(dir)
  assert.strictEqual(fs.readFileSync(path.join(dir, 'CHANGELOG.md'), 'utf8'), first)
})

test('an untagged version being released is dated today', () => {
  const { dir, setVersion } = releasedRepo()
  gen(dir) // write the 2.0.0 section first, so both headings coexist
  setVersion('2.1.0') // the npm version path: bumped, not yet tagged
  gen(dir)
  assert.deepStrictEqual(headings(dir), [`## [2.1.0] - ${TODAY}`, `## [2.0.0] - ${TAG_DAY}`])
})

test('the released section is not polluted by commits made after its tag', () => {
  const { dir } = releasedRepo()
  gen(dir)
  const body = fs.readFileSync(path.join(dir, 'CHANGELOG.md'), 'utf8')
  assert.match(body, /shipped/)
  assert.doesNotMatch(body, /later/, 'post-tag work must not be folded into a released section')
})

// --- honest reporting -------------------------------------------------------

// A run that changed nothing used to print "✅ Updated …", while also silently
// excluding every commit made since the tag. Both halves were invisible: the
// file was not updated, and the work that is actually pending was not covered.

test('a no-op run says so instead of claiming an update', () => {
  const { dir } = releasedRepo()
  gen(dir) // writes the 2.0.0 section
  const out = gen(dir) // same inputs — nothing left to do

  assert.match(out, /v2\.0\.0 is already tagged/)
  assert.match(out, /unchanged/)
  assert.doesNotMatch(out, /✅ Updated/, 'must not claim an update that did not happen')
})

test('a no-op run names the work it is excluding', () => {
  const { dir } = releasedRepo()
  gen(dir)
  const out = gen(dir)

  // The fixture has one commit after the v2.0.0 tag.
  assert.match(out, /1 commit\(s\) since that tag are not included/)
  assert.match(out, /bump the version/, 'and how to release them')
})

test('a real update still reports as one', () => {
  const { dir, setVersion } = releasedRepo()
  gen(dir)
  setVersion('2.1.0')
  const out = gen(dir)

  assert.match(out, /✅ Updated/)
  assert.doesNotMatch(out, /already tagged/)
})

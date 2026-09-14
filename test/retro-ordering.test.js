'use strict'

// Two faults that corrupted this repo's own RELEASES.md / CHANGELOG.md.
//
// 1. Ordering. Both upserts inserted a new section above whatever section
//    happened to be FIRST in the file. Retro-fill walks oldest-first, so
//    backfilling an older tag into a file that already held newer ones put the
//    oldest release on top (observed: 1.0.0, 2.0.0, 1.1.0). Inserting into an
//    empty file happened to come out right, which is why the existing
//    --retro tests never caught it.
//
// 2. Stale sections. When a tag's range yielded nothing, retro-fill logged
//    "skipping" and moved on — leaving behind any section an earlier run had
//    written for that version under a wrong commit range. That is how a note
//    for work that shipped in 2.0.0 stayed pinned under 1.1.0.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const ASSETS = path.join(__dirname, '..', 'assets', 'scripts')
const CHANGELOG = path.join(ASSETS, 'generate-changelog.cjs')
const RELEASES = path.join(ASSETS, 'generate-releases.cjs')

const { upsertReleasesSection, removeReleasesSection } = require(RELEASES)
const { upsertSection, removeSection } = require(CHANGELOG)
const { compareVersions } = require(path.join(ASSETS, 'lib', 'git-commits.cjs'))

const order = (content, regex) =>
  [...content.matchAll(regex)].map((m) => m[1])

// --- version comparison -----------------------------------------------------

test('compareVersions orders numerically, not lexically', () => {
  assert.ok(compareVersions('2.0.0', '1.1.0') > 0)
  assert.ok(compareVersions('1.1.0', '2.0.0') < 0)
  assert.strictEqual(compareVersions('1.0.0', '1.0.0'), 0)
  // The case a string sort gets wrong: '1.9.0' > '1.10.0' lexically.
  assert.ok(compareVersions('1.10.0', '1.9.0') > 0)
})

// --- ordering ---------------------------------------------------------------

test('releases: an older section is inserted below newer ones', () => {
  const existing = [
    '# Release Notes',
    '',
    '## 2.0.0 — 14 Sep 2026',
    '',
    '### Area',
    '- **Fixed** — two.',
    '',
    '## 1.1.0 — 04 Aug 2026',
    '',
    '### Area',
    '- **Fixed** — one-one.',
    '',
  ].join('\n')

  const section = '## 1.0.0 — 13 Jul 2026\n\n### Area\n- **Added** — zero.\n'
  const result = upsertReleasesSection(existing, section, '1.0.0')

  assert.deepStrictEqual(order(result, /## (\d[\d.]*) /g), ['2.0.0', '1.1.0', '1.0.0'])
})

test('releases: a newer section is inserted above older ones', () => {
  const existing = '# Release Notes\n\n## 1.0.0 — 13 Jul 2026\n\n### Area\n- **Added** — zero.\n'
  const section = '## 2.0.0 — 14 Sep 2026\n\n### Area\n- **Fixed** — two.\n'
  const result = upsertReleasesSection(existing, section, '2.0.0')

  assert.deepStrictEqual(order(result, /## (\d[\d.]*) /g), ['2.0.0', '1.0.0'])
})

test('changelog: an older section is inserted below newer ones', () => {
  const existing = [
    '# Changelog',
    '',
    '## [2.0.0] - 2026-09-14',
    '',
    '### Fixed',
    '- two',
    '',
    '## [1.1.0] - 2026-08-04',
    '',
    '### Fixed',
    '- one-one',
    '',
  ].join('\n')

  const section = '## [1.0.0] - 2026-07-13\n\n### Added\n- zero\n'
  const result = upsertSection(existing, section, '1.0.0')

  assert.deepStrictEqual(order(result, /## \[(\d[\d.]*)\]/g), ['2.0.0', '1.1.0', '1.0.0'])
})

// --- stale-section removal --------------------------------------------------

test('releases: removeReleasesSection drops only the named version', () => {
  const existing = [
    '# Release Notes',
    '',
    '## 2.0.0 — 14 Sep 2026',
    '',
    '### Area',
    '- **Fixed** — keep me.',
    '',
    '## 1.1.0 — 04 Aug 2026',
    '',
    '### Area',
    '- **Fixed** — stale, belongs to 2.0.0.',
    '',
  ].join('\n')

  const { content, removed } = removeReleasesSection(existing, '1.1.0')
  assert.strictEqual(removed, true)
  assert.deepStrictEqual(order(content, /## (\d[\d.]*) /g), ['2.0.0'])
  assert.match(content, /keep me\./)
  assert.doesNotMatch(content, /stale/)

  assert.strictEqual(removeReleasesSection(content, '9.9.9').removed, false)
})

test('changelog: removeSection drops only the named version', () => {
  const existing = [
    '# Changelog',
    '',
    '## [2.0.0] - 2026-09-14',
    '',
    '### Fixed',
    '- keep me',
    '',
    '## [1.1.0] - 2026-08-04',
    '',
    '### Fixed',
    '- stale',
    '',
  ].join('\n')

  const { content, removed } = removeSection(existing, '1.1.0')
  assert.strictEqual(removed, true)
  assert.deepStrictEqual(order(content, /## \[(\d[\d.]*)\]/g), ['2.0.0'])
  assert.doesNotMatch(content, /stale/)
})

// --- end to end -------------------------------------------------------------

// v1.1.0's range holds a commit with no Release-Note footer (and a
// non-conventional subject), so neither generator has anything to write for it.
function repoWithAnEmptyRelease() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skittership-order-'))
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' })
  git('init', '-q', '.')
  git('config', 'user.email', 't@t')
  git('config', 'user.name', 'T')
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 't', version: '2.0.0' }))
  git('add', '--', 'package.json')
  git('commit', '-q', '-m', 'chore: init')

  const bump = (file, subject, tag) => {
    fs.writeFileSync(path.join(dir, file), 'x\n')
    git('add', '--', file)
    git('commit', '-q', '-m', subject)
    git('tag', tag)
  }
  bump('a.txt', 'feat(core): first\n\nRelease-Note: You can do the first thing.', 'v1.0.0')
  bump('b.txt', 'wip nothing worth releasing', 'v1.1.0')
  bump('c.txt', 'fix(core): third\n\nRelease-Note: The third thing works now.', 'v2.0.0')
  return dir
}

const run = (script, args, dir) =>
  execFileSync('node', [script, ...args], { cwd: dir, encoding: 'utf8' })

test('releases --retro prunes a stale section and keeps order descending', () => {
  const dir = repoWithAnEmptyRelease()
  // Seed the exact corruption: a note that really belongs to 2.0.0, parked
  // under 1.1.0 by an earlier run made before v1.1.0 was tagged.
  fs.writeFileSync(
    path.join(dir, 'RELEASES.md'),
    [
      '# Release Notes',
      '',
      '## 1.1.0 — 04 Aug 2026',
      '',
      '### Core',
      '- **Fixed** — The third thing works now.',
      '',
    ].join('\n'),
    'utf8',
  )

  run(RELEASES, ['--retro'], dir)
  const written = fs.readFileSync(path.join(dir, 'RELEASES.md'), 'utf8')

  assert.doesNotMatch(written, /## 1\.1\.0/, 'stale 1.1.0 section removed')
  assert.deepStrictEqual(order(written, /## (\d[\d.]*) /g), ['2.0.0', '1.0.0'])
  assert.match(written, /The third thing works now\./)
  assert.match(written, /You can do the first thing\./)
})

test('changelog --retro prunes a stale section and keeps order descending', () => {
  const dir = repoWithAnEmptyRelease()
  fs.writeFileSync(
    path.join(dir, 'CHANGELOG.md'),
    ['# Changelog', '', '## [1.1.0] - 2026-08-04', '', '### Fixed', '- **core**: third', ''].join(
      '\n',
    ),
    'utf8',
  )

  run(CHANGELOG, ['--retro'], dir)
  const written = fs.readFileSync(path.join(dir, 'CHANGELOG.md'), 'utf8')

  assert.doesNotMatch(written, /## \[1\.1\.0\]/, 'stale 1.1.0 section removed')
  assert.deepStrictEqual(order(written, /## \[(\d[\d.]*)\]/g), ['2.0.0', '1.0.0'])
})

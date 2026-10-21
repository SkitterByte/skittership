'use strict'

// Hotfix versions are `<base>-hotfix.<N>`: exactly the prod tag plus the fix,
// never the next patch (test/demo may already own it). They sort AFTER their
// base, the opposite of semver pre-release order.
//
// Reported from a consumer: CHANGELOG.md and RELEASES.md at v36.4.0-hotfix.2
// listed hotfix.1 ABOVE hotfix.2. The heading regexes captured only
// `\d[\d.]*`, so `[36.4.0-hotfix.1]` never matched and hotfix.2 was inserted
// above `[36.4.0]` — below hotfix.1.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const ASSETS = path.join(__dirname, '..', 'assets', 'scripts')
const LIB = path.join(ASSETS, 'lib', 'git-commits.cjs')
const GUARD = path.join(ASSETS, 'check-release-index.cjs')
const { compareVersions, indexOfOlderSection, VERSION_PATTERN } = require(LIB)
const { upsertSection, removeSection } = require(path.join(ASSETS, 'generate-changelog.cjs'))
const {
  upsertReleasesSection,
  removeReleasesSection,
} = require(path.join(ASSETS, 'generate-releases.cjs'))

const order = (content, regex) => [...content.matchAll(regex)].map((m) => m[1])
const CHANGELOG_HEADINGS = new RegExp(`\\n## \\[(${VERSION_PATTERN})\\]`, 'g')
const RELEASES_HEADINGS = new RegExp(`\\n## (${VERSION_PATTERN})\\s`, 'g')

// --- the comparator -----------------------------------------------------------

test('compareVersions: pre-release < base < hotfixes < next patch', () => {
  const ascending = [
    '1.0.0-rc.1',
    '1.0.0-rc.2',
    '1.0.0',
    '1.0.0-hotfix.1',
    '1.0.0-hotfix.2',
    '1.0.0-hotfix.10',
    '1.0.1',
    '1.1.0',
  ]
  for (let i = 0; i < ascending.length; i += 1) {
    for (let j = 0; j < ascending.length; j += 1) {
      const sign = Math.sign(compareVersions(ascending[i], ascending[j]))
      assert.strictEqual(sign, Math.sign(i - j), `${ascending[i]} vs ${ascending[j]}`)
    }
  }
})

// Stays silent: over plain versions the new comparator and heading pattern
// must agree with the old ones exactly, so a project with no suffixed versions
// gets byte-identical CHANGELOG/RELEASES output.
const oldCompare = (a, b) => {
  const pa = String(a).split('.').map((n) => Number.parseInt(n, 10) || 0)
  const pb = String(b).split('.').map((n) => Number.parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const diff = (pa[i] || 0) - (pb[i] || 0)
    if (diff !== 0) return diff
  }
  return 0
}
const PLAIN = ['0.1.0', '1.0.0', '1.0.1', '1.2.0', '1.9.0', '1.10.0', '2.0.0', '10.0.0', '1.0']

test('stays silent: plain versions compare exactly as before', () => {
  for (const a of PLAIN) {
    for (const b of PLAIN) {
      assert.strictEqual(Math.sign(compareVersions(a, b)), Math.sign(oldCompare(a, b)), `${a} vs ${b}`)
    }
  }
})

test('stays silent: plain-version files insert at the same place as before', () => {
  const changelog = '# Changelog\n\n## [2.0.0] - 2026-09-14\n\n## [1.10.0] - 2026-08-01\n\n## [1.0.0] - 2026-01-01\n'
  const releases = '# Release Notes\n\n## 2.0.0 — 14 Sep 2026\n\n## 1.10.0 — 01 Aug 2026\n\n## 1.0.0 — 01 Jan 2026\n'
  for (const v of ['3.0.0', '1.11.0', '1.9.0', '0.1.0']) {
    assert.strictEqual(
      indexOfOlderSection(changelog, v, new RegExp(`\\n## \\[(${VERSION_PATTERN})\\]`)),
      indexOfOlderSection(changelog, v, /\n## \[(\d[\d.]*)\]/),
      `changelog ${v}`,
    )
    assert.strictEqual(
      indexOfOlderSection(releases, v, new RegExp(`\\n## (${VERSION_PATTERN})\\s`)),
      indexOfOlderSection(releases, v, /\n## (\d[\d.]*)\s/),
      `releases ${v}`,
    )
  }
})

// --- section insertion --------------------------------------------------------

test('changelog: hotfix.2 lands above hotfix.1 (the reported repro)', () => {
  const existing = '# Changelog\n\n## [36.4.0-hotfix.1] - 2026-10-15\n\n### Fixed\n\n- one\n\n## [36.4.0] - 2026-10-13\n\n### Added\n\n- base\n'
  const updated = upsertSection(existing, '## [36.4.0-hotfix.2] - 2026-10-16\n\n### Fixed\n\n- two\n', '36.4.0-hotfix.2')
  assert.deepStrictEqual(order(updated, CHANGELOG_HEADINGS), ['36.4.0-hotfix.2', '36.4.0-hotfix.1', '36.4.0'])
})

test('releases: hotfix.2 lands above hotfix.1 (the reported repro)', () => {
  const existing = '# Release Notes\n\n## 36.4.0-hotfix.1 — 15 Oct 2026\n\n### Area\n- **Fixed** — one.\n\n## 36.4.0 — 13 Oct 2026\n\n### Area\n- **New** — base.\n'
  const updated = upsertReleasesSection(
    existing,
    '## 36.4.0-hotfix.2 — 16 Oct 2026\n\n### Area\n- **Fixed** — two.\n',
    '36.4.0-hotfix.2',
  )
  assert.deepStrictEqual(order(updated, RELEASES_HEADINGS), ['36.4.0-hotfix.2', '36.4.0-hotfix.1', '36.4.0'])
})

test('a hotfix inserted after the next release still lands below it', () => {
  const existing = '# Changelog\n\n## [36.5.0] - 2026-10-20\n\n## [36.4.0] - 2026-10-13\n'
  const updated = upsertSection(existing, '## [36.4.0-hotfix.1] - 2026-10-21\n', '36.4.0-hotfix.1')
  assert.deepStrictEqual(order(updated, CHANGELOG_HEADINGS), ['36.5.0', '36.4.0-hotfix.1', '36.4.0'])
})

// The idempotence/remove regexes escape the full version, so a suffixed
// re-run touches its own section only — and never the base's.
test('re-running a suffixed version replaces only its own section', () => {
  let changelog = '# Changelog\n\n## [1.0.0-hotfix.1] - 2026-10-15\n\n- old\n\n## [1.0.0] - 2026-10-13\n\n- base\n'
  changelog = upsertSection(changelog, '## [1.0.0-hotfix.1] - 2026-10-15\n\n- new\n', '1.0.0-hotfix.1')
  assert.match(changelog, /- new/)
  assert.doesNotMatch(changelog, /- old/)
  assert.match(changelog, /- base/)
  assert.strictEqual(removeSection(changelog, '1.0.0').content.includes('- new'), true)

  let releases = '# Release Notes\n\n## 1.0.0-hotfix.1 — 15 Oct 2026\n\n- old\n\n## 1.0.0 — 13 Oct 2026\n\n- base\n'
  releases = upsertReleasesSection(releases, '## 1.0.0-hotfix.1 — 15 Oct 2026\n\n- new\n', '1.0.0-hotfix.1')
  assert.match(releases, /- new/)
  assert.doesNotMatch(releases, /- old/)
  assert.match(releases, /- base/)
  assert.strictEqual(removeReleasesSection(releases, '1.0.0').content.includes('- new'), true)
})

// --- tags in a real repo --------------------------------------------------------

function tmpRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skittership-suffix-'))
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' })
  git('init', '-q', '.')
  git('config', 'user.email', 't@t')
  git('config', 'user.name', 'T')
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 't', version: '1.0.0' }))
  git('add', '--', 'package.json')
  git('commit', '-q', '-m', 'chore: init')
  return { dir, git }
}

test('getAllVersionTags keeps suffixed hotfix tags', () => {
  const { dir, git } = tmpRepo()
  for (const t of ['v1.0.0', 'v1.0.0-hotfix.1', 'v1.1.0', 'not-a-version']) git('tag', t)
  const probe = `console.log(JSON.stringify(require(${JSON.stringify(LIB)}).getAllVersionTags()))`
  const tags = JSON.parse(execFileSync('node', ['-e', probe], { cwd: dir, encoding: 'utf8' }))
  assert.ok(tags.includes('v1.0.0-hotfix.1'))
  assert.ok(!tags.includes('not-a-version'))
})

const runGuard = (dir) => {
  try {
    execFileSync('node', [GUARD], {
      cwd: dir,
      encoding: 'utf8',
      stdio: 'pipe',
      env: { ...process.env, npm_lifecycle_event: 'version' },
    })
    return { code: 0, stderr: '' }
  } catch (err) {
    return { code: err.status, stderr: err.stderr }
  }
}
const bumpTo = (dir, version) =>
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 't', version }))

// Stays silent: main's `npm version minor|patch` never produces a -hotfix
// version, so a hotfix tag can never collide with it.
test('a -hotfix.N tag never trips the collision guard on a mainline bump', () => {
  const { dir, git } = tmpRepo()
  for (const t of ['v1.0.0', 'v1.0.0-hotfix.1', 'v1.0.0-hotfix.2']) git('tag', t)
  for (const v of ['1.0.1', '1.1.0', '2.0.0']) {
    bumpTo(dir, v)
    const { code, stderr } = runGuard(dir)
    assert.strictEqual(code, 0, `${v} passes`)
    assert.strictEqual(stderr, '')
  }
})

test('a colliding hotfix version is told the next free hotfix, not a patch', () => {
  const { dir, git } = tmpRepo()
  for (const t of ['v1.0.0', 'v1.0.0-hotfix.1', 'v1.0.0-hotfix.2', 'v1.0.1']) git('tag', t)
  bumpTo(dir, '1.0.0-hotfix.1')
  const { code, stderr } = runGuard(dir)
  assert.strictEqual(code, 1)
  assert.match(stderr, /npm version 1\.0\.0-hotfix\.3\b/)
})

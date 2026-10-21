'use strict'

// A release with no user-facing notes used to write nothing to RELEASES.md, so
// after a devops-only release the app read 36.0.4 while RELEASES.md topped out
// at 36.0.3 — which reads as "the release didn't update the doc". Every release
// now gets its heading and a placeholder line, unless `releases.emptyRelease`
// is `false`.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { formatReleaseDate, renderReleasesSection } = require('../assets/scripts/generate-releases.cjs')
const { DEFAULT_EMPTY_RELEASE } = require('../src/config.js')

const RELEASES = path.join(__dirname, '..', 'assets', 'scripts', 'generate-releases.cjs')
const TODAY = formatReleaseDate(new Date().toISOString().split('T')[0])

// v1.0.0 is released with one note; 1.0.1 is being cut with nothing a user
// would notice — a chore, and a feat explicitly marked `Release-Note: none`.
function devopsOnlyRepo(releases = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skittership-empty-'))
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' })
  git('init', '-q', '.')
  git('config', 'user.email', 't@t')
  git('config', 'user.name', 'T')
  fs.writeFileSync(
    path.join(dir, 'skittership.config.json'),
    JSON.stringify({
      version: 1,
      releases: { enabled: true, file: 'RELEASES.md', productName: 't', scopeAreas: {}, ...releases },
    }),
  )
  const setVersion = (v) =>
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 't', version: v }))
  const commit = (file, message) => {
    fs.writeFileSync(path.join(dir, file), `${message}\n`)
    git('add', '-A')
    git('commit', '-q', '-m', message)
  }

  setVersion('1.0.0')
  commit('a.txt', 'feat(core): first\n\nRelease-Note: You can now do the first thing.')
  execFileSync('node', [RELEASES], { cwd: dir, encoding: 'utf8' })
  git('add', '-A')
  git('commit', '-q', '-m', '1.0.0')
  git('tag', 'v1.0.0')

  commit('ci.txt', 'chore(ci): bump the runner')
  commit('b.txt', 'feat(core): internal plumbing\n\nRelease-Note: none')
  setVersion('1.0.1')

  const run = () => execFileSync('node', [RELEASES], { cwd: dir, encoding: 'utf8' })
  const read = () => fs.readFileSync(path.join(dir, 'RELEASES.md'), 'utf8')
  return { dir, git, commit, run, read }
}

const sectionOf = (content, version) => {
  const start = content.indexOf(`## ${version} `)
  if (start < 0) return null
  const next = content.indexOf('\n## ', start + 1)
  return content.slice(start, next < 0 ? undefined : next)
}

test('renderReleasesSection renders the heading and the placeholder when there are no notes', () => {
  assert.strictEqual(
    renderReleasesSection('2.0.8', '2026-10-21', []),
    `## 2.0.8 — 21 Oct 2026\n\n${DEFAULT_EMPTY_RELEASE}\n`,
  )
  assert.strictEqual(
    renderReleasesSection('2.0.8', '2026-10-21', [], 'Nothing new.'),
    '## 2.0.8 — 21 Oct 2026\n\nNothing new.\n',
  )
})

test('a release with no user-facing notes still gets a section, newest on top', () => {
  const repo = devopsOnlyRepo()
  repo.run()
  const content = repo.read()
  assert.strictEqual(sectionOf(content, '1.0.1'), `## 1.0.1 — ${TODAY}\n\n${DEFAULT_EMPTY_RELEASE}\n`)
  assert.ok(content.indexOf('## 1.0.1 ') < content.indexOf('## 1.0.0 '))
  assert.ok(sectionOf(content, '1.0.0').includes('You can now do the first thing.'))
})

test('releases.emptyRelease text replaces the built-in placeholder', () => {
  const repo = devopsOnlyRepo({ emptyRelease: 'Maintenance only.' })
  repo.run()
  assert.strictEqual(sectionOf(repo.read(), '1.0.1'), `## 1.0.1 — ${TODAY}\n\nMaintenance only.\n`)
})

test('releases.emptyRelease: false writes nothing, exactly as before', () => {
  const repo = devopsOnlyRepo({ emptyRelease: false })
  const before = repo.read()
  const out = repo.run()
  assert.strictEqual(repo.read(), before)
  assert.match(out, /No Release-Note footers found since last tag — skipping RELEASES\.md update/)
})

test('a note added before the release replaces the placeholder', () => {
  const repo = devopsOnlyRepo()
  repo.run()
  repo.commit('c.txt', 'fix(core): late fix\n\nRelease-Note: The late thing works now.')
  repo.run()
  const content = repo.read()
  const section = sectionOf(content, '1.0.1')
  assert.ok(section.includes('The late thing works now.'))
  assert.ok(!section.includes(DEFAULT_EMPTY_RELEASE))
  assert.strictEqual(content.split('\n## 1.0.1 ').length, 2)
})

test('re-running over a tagged placeholder release changes nothing', () => {
  const repo = devopsOnlyRepo()
  repo.run()
  repo.git('add', '-A')
  repo.git('commit', '-q', '-m', '1.0.1')
  repo.git('tag', 'v1.0.1')
  const before = repo.read()
  const out = repo.run()
  assert.strictEqual(repo.read(), before)
  assert.match(out, /v1\.0\.1 is already tagged — RELEASES\.md unchanged/)
})

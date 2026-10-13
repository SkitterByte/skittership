'use strict'

// A hotfix is cut on a branch from a release tag, tagged there, and its fix
// commits are cherry-picked onto main. The hotfix tag is then NOT an ancestor
// of main, and main carries the same fixes under different SHAs:
//
//   v1.0.0 ── F ── (v1.0.1)            hotfix branch
//      └──── F′ ── M ── HEAD           main
//
// The next release from main took `v1.0.1..HEAD`. A..B excludes only commits
// reachable from A, so F′ was listed again — and its Release-Note: footer
// reached users a second time. Seen in a consumer on 36.2.9 → 36.2.10.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const SCRIPTS = path.join(__dirname, '..', 'assets', 'scripts')
const LIB = path.join(SCRIPTS, 'lib', 'git-commits.cjs')

const PROBE = `
const { getCommitsSinceLastTag, getCommitsBetween, parseCommit } = require(${JSON.stringify(LIB)})
const messages = (lines) => lines.map(parseCommit).filter(Boolean).map((c) => c.message)
let range = 'NOT REPORTED'
const since = messages(getCommitsSinceLastTag(process.argv[2], { onRange: (r) => (range = r) }))
const between = process.argv[3] ? messages(getCommitsBetween(process.argv[3], process.argv[4])) : null
console.log(JSON.stringify({ since, range, between }))
`

function hotfixRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skittership-hotfix-'))
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' })
  git('init', '-q', '-b', 'main', '.')
  git('config', 'user.email', 't@t')
  git('config', 'user.name', 'T')
  const pkg = (version) =>
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 't', version }))
  const commit = (file, message) => {
    fs.writeFileSync(path.join(dir, file), `${file}\n`)
    git('add', '--', file)
    git('commit', '-q', '-m', message)
  }

  pkg('1.0.0')
  git('add', '--', 'package.json')
  git('commit', '-q', '-m', 'chore: init')
  commit('base.txt', 'feat(core): base')
  git('tag', 'v1.0.0')

  git('checkout', '-q', '-b', 'hotfix', 'v1.0.0')
  commit('fix.txt', 'fix(core): count hops\n\nRelease-Note: Hop counts are now correct.')
  git('tag', 'v1.0.1')
  const fixSha = git('rev-parse', 'HEAD').trim()

  // M lands on main before the pick. Picked straight onto v1.0.0 within the
  // same second, F′ would have F's parent, tree and dates — the SAME sha — and
  // the fixture would quietly be the linear case.
  git('checkout', '-q', 'main')
  commit('m.txt', 'feat(core): unrelated\n\nRelease-Note: An unrelated improvement.')
  git('cherry-pick', fixSha)

  fs.writeFileSync(path.join(dir, 'probe.cjs'), PROBE)
  return { dir, git, pkg }
}

const probe = (dir, ...args) =>
  JSON.parse(execFileSync('node', ['probe.cjs', ...args], { cwd: dir, encoding: 'utf8' }))

const runScript = (dir, name, ...args) =>
  execFileSync('node', [path.join(SCRIPTS, name), ...args], { cwd: dir, encoding: 'utf8' })

test('the hotfix fixture really is the non-ancestor case', () => {
  const { dir, git } = hotfixRepo()
  assert.throws(() => git('merge-base', '--is-ancestor', 'v1.0.1', 'main'))
})

test('the next release after a hotfix omits the cherry-picked copy', () => {
  const { dir } = hotfixRepo()
  assert.deepStrictEqual(probe(dir, '1.0.2').since, ['unrelated'])
})

test('the range report says cherry-picks were dropped', () => {
  const { dir } = hotfixRepo()
  assert.match(probe(dir, '1.0.2').range, /^v1\.0\.1\.\.\.HEAD\b.*cherry-pick/)
})

test('a retro range between a hotfix tag and the next omits the copy', () => {
  const { dir, git } = hotfixRepo()
  git('tag', 'v1.0.2')
  assert.deepStrictEqual(probe(dir, '1.0.2', 'v1.0.1', 'v1.0.2').between, ['unrelated'])
})

test('CHANGELOG and RELEASES for the next version list M and not F′', () => {
  const { dir, pkg } = hotfixRepo()
  pkg('1.0.2') // what `npm version` has done to disk before the hook runs
  runScript(dir, 'generate-changelog.cjs')
  runScript(dir, 'generate-releases.cjs')
  const changelog = fs.readFileSync(path.join(dir, 'CHANGELOG.md'), 'utf8')
  const releases = fs.readFileSync(path.join(dir, 'RELEASES.md'), 'utf8')
  assert.match(changelog, /unrelated/)
  assert.doesNotMatch(changelog, /count hops/)
  assert.match(releases, /An unrelated improvement/)
  assert.doesNotMatch(releases, /Hop counts are now correct/)
})

// Stays-silent: when the previous tag IS an ancestor — every ordinary release —
// the commits and the reported range are exactly what they were before.
test('a linear release still lists every commit since the tag', () => {
  const { dir, git } = hotfixRepo()
  git('tag', '-d', 'v1.0.1')
  git('tag', 'v1.0.1', 'main~1') // M is now the release; F′ is the only new work
  assert.deepStrictEqual(probe(dir, '1.0.2').since, ['count hops'])
  assert.strictEqual(probe(dir, '1.0.2').range, 'v1.0.1..HEAD')
})

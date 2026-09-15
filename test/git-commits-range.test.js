'use strict'

// Range resolution in getCommitsSinceLastTag had NO test coverage —
// git-commits.test.js only exercises parseCommit/reconstructCommits — and an
// off-by-one sat in it undetected:
//
//   allTags is newest-first (`git tag --sort=-version:refname`), but the
//   neighbour lookup read allTags[currentIndex - 1] — the NEWER tag. Two
//   failures from one line: the newest tag (index 0) failed the `> 0` guard and
//   fell through to "first tag", returning ALL history; any older tag produced
//   a backwards range (`git log newer..older`) and returned nothing.
//
// It survived because `npm version` never reaches that branch: the version
// being released has no tag yet, so it takes the else. What broke was the
// documented manual path — `npm run changelog` / `npm run releases` between
// releases — silently, with exit 0. Hence the last case here, which pins the
// npm version path so a fix to the others cannot quietly move it.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const LIB = path.join(__dirname, '..', 'assets', 'scripts', 'lib', 'git-commits.cjs')

// getCommitsSinceLastTag shells out with no cwd option, so it reads
// process.cwd(). Probe it in a child process rooted in the fixture repo rather
// than chdir-ing this one.
const PROBE = `
const { getCommitsSinceLastTag, parseCommit } = require(${JSON.stringify(LIB)})
const subs = getCommitsSinceLastTag(process.argv[2])
  .map(parseCommit)
  .filter(Boolean)
  .map((c) => c.message)
console.log(JSON.stringify(subs))
`

function repo({ tagged = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skittership-range-'))
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' })
  git('init', '-q', '.')
  git('config', 'user.email', 't@t')
  git('config', 'user.name', 'T')
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 't', version: '1.0.0' }))
  git('add', '--', 'package.json')
  git('commit', '-q', '-m', 'chore: init')

  const commit = (name, tag) => {
    fs.writeFileSync(path.join(dir, `${name}.txt`), 'x\n')
    git('add', '--', `${name}.txt`)
    git('commit', '-q', '-m', `feat: ${name}`)
    if (tag) git('tag', tag)
  }
  if (tagged) {
    commit('one', 'v1.0.0')
    commit('two', 'v1.1.0')
    commit('three', 'v2.0.0')
    commit('four', 'v3.0.0')
  } else {
    commit('one')
    commit('two')
  }

  fs.writeFileSync(path.join(dir, 'probe.cjs'), PROBE)
  return { dir, git, commit }
}

const at = (dir, version) =>
  JSON.parse(execFileSync('node', ['probe.cjs', version], { cwd: dir, encoding: 'utf8' }))

test('HEAD at the NEWEST tag returns only that release', () => {
  const { dir } = repo()
  // Previously returned all history: index 0 failed the `> 0` guard.
  assert.deepStrictEqual(at(dir, '3.0.0'), ['four'])
})

test('HEAD at a middle tag returns only that release', () => {
  const { dir, git } = repo()
  git('checkout', '-q', 'v1.1.0')
  // Previously returned [] — allTags[i-1] is the newer tag, so the range ran
  // backwards.
  assert.deepStrictEqual(at(dir, '1.1.0'), ['two'])
})

test('HEAD at the OLDEST tag returns all history up to it', () => {
  const { dir, git } = repo()
  git('checkout', '-q', 'v1.0.0')
  assert.deepStrictEqual(at(dir, '1.0.0'), ['one', 'init'])
})

test('a repo with no tags returns all history', () => {
  const { dir } = repo({ tagged: false })
  assert.deepStrictEqual(at(dir, '1.0.0'), ['two', 'one', 'init'])
})

// The `npm version` path: the version being released has no tag yet, so HEAD
// sits past the newest tag. This always worked — pinned so it stays that way.
test('HEAD past the newest tag returns commits since it', () => {
  const { dir, commit } = repo()
  commit('five')
  commit('six')
  assert.deepStrictEqual(at(dir, '4.0.0'), ['six', 'five'])
})

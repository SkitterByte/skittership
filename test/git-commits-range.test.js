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
let range = 'NOT REPORTED'
const commits = getCommitsSinceLastTag(process.argv[2], { onRange: (r) => (range = r) })
  .map(parseCommit)
  .filter(Boolean)
  .map((c) => c.message)
console.log(JSON.stringify({ commits, range }))
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

const probe = (dir, version, env) =>
  JSON.parse(
    execFileSync('node', ['probe.cjs', version], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, ...env },
    }),
  )

const at = (dir, version, env) => probe(dir, version, env).commits
const rangeOf = (dir, version, env) => probe(dir, version, env).range

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

// --- the reported scenario, and the remaining branches ---------------------

// Case A is the one that actually bit a consumer: HEAD is PAST the newest tag
// but package.json still names it, because the bump has not happened. That
// reaches the range code through the `currentVersion` fallback rather than
// `git describe --exact-match`, so it is a different path to the same line —
// and it is exactly what `npm run changelog` does between releases. Measured
// in the wild: a 1,658-line changelog section from 2,977 commits, exit 0.
test('between releases: package.json names the newest tag, HEAD is past it', () => {
  const { dir, commit } = repo()
  commit('five') // untagged: HEAD is past v3.0.0, package.json still says 3.0.0
  assert.deepStrictEqual(at(dir, '3.0.0'), ['four'])
})

test('a repo with exactly one tag returns all history', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skittership-range-one-'))
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' })
  git('init', '-q', '.')
  git('config', 'user.email', 't@t')
  git('config', 'user.name', 'T')
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 't', version: '1.0.0' }))
  git('add', '--', 'package.json')
  git('commit', '-q', '-m', 'chore: init')
  fs.writeFileSync(path.join(dir, 'one.txt'), 'x\n')
  git('add', '--', 'one.txt')
  git('commit', '-q', '-m', 'feat: one')
  git('tag', 'v1.0.0')
  fs.writeFileSync(path.join(dir, 'probe.cjs'), PROBE)
  assert.deepStrictEqual(at(dir, '1.0.0'), ['one', 'init'])
})

// The CI fallback: a tag-triggered job sets BUILD_SOURCEBRANCHNAME, which pins
// currentTag deliberately — so it hits the same branch as a tag checkout.
test('BUILD_SOURCEBRANCHNAME pins the range to that tag', () => {
  const { dir, commit } = repo()
  commit('five') // HEAD untagged, so the env fallback is what resolves the tag
  assert.deepStrictEqual(at(dir, '9.9.9', { BUILD_SOURCEBRANCHNAME: 'v1.1.0' }), ['two'])
})

// --- the reported range ----------------------------------------------------

// A wrong range and a right range printed the same success line, which is how
// this survived. Every path must now name the range it used, and the
// whole-history fallback must say so rather than reporting an empty range.

test('reports the resolved range between releases', () => {
  const { dir, commit } = repo()
  commit('five')
  assert.strictEqual(rangeOf(dir, '3.0.0'), 'v2.0.0..v3.0.0')
})

test('reports the resolved range at a middle tag', () => {
  const { dir, git } = repo()
  git('checkout', '-q', 'v1.1.0')
  assert.strictEqual(rangeOf(dir, '1.1.0'), 'v1.0.0..v1.1.0')
})

test('names the whole-history fallback, and the tag it is bounded by', () => {
  const { dir, git } = repo()
  git('checkout', '-q', 'v1.0.0')
  // Bounded by the tag, not bare `git log`: with currentTag resolved from the
  // version fallback, HEAD can be past the tag, and an unbounded log would
  // fold post-release work into a released section.
  assert.strictEqual(rangeOf(dir, '1.0.0'), 'all history — no earlier tag (through v1.0.0)')
})

test('names the no-tags case distinctly', () => {
  const { dir } = repo({ tagged: false })
  assert.strictEqual(rangeOf(dir, '1.0.0'), 'all history — no tags')
})

test('reports the range on the npm version path', () => {
  const { dir, commit } = repo()
  commit('five')
  commit('six')
  assert.strictEqual(rangeOf(dir, '4.0.0'), 'v3.0.0..HEAD')
})

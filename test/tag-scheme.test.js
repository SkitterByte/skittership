'use strict'

// A tag scheme maps a version to its tag and back. The default is the one the
// generators have always used (`v1.2.3`, or a bare `1.2.3`); a package in a
// monorepo has its own (`pkg@1.2.3`), and its base, dates and listing ignore
// every other series.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const LIB = path.join(__dirname, '..', 'assets', 'scripts', 'lib', 'git-commits.cjs')
const SCRIPTS = path.join(__dirname, '..', 'assets', 'scripts')
const { DEFAULT_SCHEME, tagScheme } = require(LIB)
const { scenarios } = require('./fixtures/golden-scenarios.cjs')

test('the default scheme still writes exactly what it wrote before schemes existed', () => {
  // Captured from the scripts as they stood before this change. If this fails
  // because the OUTPUT was meant to change, regenerate it deliberately:
  //   node test/fixtures/golden-scenarios.cjs assets/scripts > test/fixtures/golden-default-scheme.json
  const expected = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'fixtures', 'golden-default-scheme.json'), 'utf8'),
  )
  assert.deepStrictEqual(scenarios(SCRIPTS), expected)
})

test('default scheme: v-prefixed and bare tags, nothing else', () => {
  assert.strictEqual(DEFAULT_SCHEME.tagFor('1.2.3'), 'v1.2.3')
  assert.strictEqual(DEFAULT_SCHEME.versionOf('v1.2.3'), '1.2.3')
  assert.strictEqual(DEFAULT_SCHEME.versionOf('1.2.3'), '1.2.3')
  assert.strictEqual(DEFAULT_SCHEME.versionOf('v1.2.3-hotfix.1'), '1.2.3-hotfix.1')
  assert.strictEqual(DEFAULT_SCHEME.versionOf('pkg@1.2.3'), null)
  assert.strictEqual(tagScheme('v'), DEFAULT_SCHEME)
  assert.strictEqual(tagScheme(), DEFAULT_SCHEME)
})

test('package scheme: round-trips its own tags, suffixes included', () => {
  const s = tagScheme('pkg@')
  assert.strictEqual(s.tagFor('1.2.3'), 'pkg@1.2.3')
  assert.strictEqual(s.versionOf('pkg@1.2.3'), '1.2.3')
  assert.strictEqual(s.versionOf('pkg@1.2.3-hotfix.1'), '1.2.3-hotfix.1')
  assert.strictEqual(s.versionOf(s.tagFor('4.5.6-rc.2')), '4.5.6-rc.2')
})

test("package scheme: a sibling series' tags are not its own", () => {
  const s = tagScheme('pkg@')
  assert.strictEqual(s.versionOf('pkg-linear@1.2.3'), null)
  assert.strictEqual(s.versionOf('v1.2.3'), null)
  assert.strictEqual(s.versionOf('1.2.3'), null)
})

test('a prefix that does not end in a separator is refused', () => {
  // `pkg[0-9]*` would let describe match `pkg2@1.0.0`, which versionOf rejects.
  assert.throws(() => tagScheme('pkg'), /must .* end in one of/)
  assert.throws(() => tagScheme('pkg2'), /must .* end in one of/)
})

test('a prefix that would need shell quoting is refused', () => {
  assert.throws(() => tagScheme('pkg"; rm -rf /;@'), /must be letters/)
  assert.throws(() => tagScheme('a b@'), /must be letters/)
})

function monorepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skittership-scheme-'))
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: 'pipe' })
  git('init', '-q', '-b', 'main', '.')
  git('config', 'user.email', 't@t')
  git('config', 'user.name', 'T')
  let n = 0
  const commit = (message) => {
    n += 1
    fs.writeFileSync(path.join(dir, `f${n}.txt`), `${n}\n`)
    git('add', '--', `f${n}.txt`)
    git('commit', '-q', '-m', message)
  }
  return { dir, git, commit }
}

const probe = (dir, code) => {
  const { RELEASE_BASE_TAG: _unset, ...env } = process.env
  return JSON.parse(
    execFileSync('node', ['-e', `const g = require(${JSON.stringify(LIB)}); ${code}`], {
      cwd: dir,
      encoding: 'utf8',
      env,
    }),
  )
}

test("a package's base is its own nearest tag, past newer tags of other series", () => {
  const { dir, git, commit } = monorepo()
  commit('feat: legacy')
  git('tag', 'v1.0.1')
  commit('feat: a first')
  git('tag', 'a@1.0.0')
  commit('feat: b first')
  git('tag', 'b@1.0.0')
  commit('feat: next')

  const out = probe(
    dir,
    `const s = g.tagScheme('a@'); let range;
     const since = g.getCommitsSinceLastTag('1.1.0', { scheme: s, onRange: (r) => (range = r) })
       .map(g.parseCommit).map((c) => c.message);
     console.log(JSON.stringify({ range, since, base: g.nearestAncestorTag('HEAD', s), tags: g.getAllVersionTags(s) }))`,
  )
  assert.strictEqual(out.base, 'a@1.0.0')
  assert.strictEqual(out.range, 'a@1.0.0..HEAD')
  assert.deepStrictEqual(out.since, ['next', 'b first'])
  assert.deepStrictEqual(out.tags, ['a@1.0.0'])
})

test('a package with no tags yet is a first release, not a refusal — stays silent', () => {
  // Other series exist, and none is an ancestor of anything this package
  // released, because it has released nothing. That is a positive fact (no tag
  // with this prefix anywhere), so it reads all history rather than refusing.
  const { dir, git, commit } = monorepo()
  commit('feat: legacy')
  git('tag', 'v1.0.1')
  commit('feat: new package')

  const out = probe(
    dir,
    `let range;
     const since = g.getCommitsSinceLastTag('1.0.0', { scheme: g.tagScheme('new@'), onRange: (r) => (range = r) })
       .map(g.parseCommit).map((c) => c.message);
     console.log(JSON.stringify({ range, since }))`,
  )
  assert.strictEqual(out.range, 'all history — no tags')
  assert.deepStrictEqual(out.since, ['new package', 'legacy'])
})

test('a package whose tags exist but none is an ancestor still refuses', () => {
  const { dir, git, commit } = monorepo()
  commit('feat: root')
  git('checkout', '-q', '-b', 'side')
  commit('feat: side')
  git('tag', 'a@1.0.0')
  git('checkout', '-q', 'main')
  commit('feat: main work')

  const out = probe(
    dir,
    `try { g.getCommitsSinceLastTag('1.1.0', { scheme: g.tagScheme('a@') }); console.log('{"code":null}') }
     catch (e) { console.log(JSON.stringify({ code: e.code })) }`,
  )
  assert.strictEqual(out.code, 'NO_BASE_TAG')
})

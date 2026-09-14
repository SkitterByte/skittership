'use strict'

// The npm `version` hook's guard. npm commits the whole index with no pathspec,
// so anything staged WHILE the generators run is swept into the version commit.
// npm's own "working directory not clean" check covers only the moment before
// the run, not that window. The guard exits non-zero, which aborts npm before
// it commits or tags.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const GUARD = path.join(__dirname, '..', 'assets', 'scripts', 'check-release-index.cjs')
const { findStrays, expectedPaths } = require(GUARD)

function tmpRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skittership-idx-'))
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' })
  git('init', '-q', '.')
  git('config', 'user.email', 't@t')
  git('config', 'user.name', 'T')
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 't', version: '1.0.0' }))
  fs.writeFileSync(path.join(dir, 'tracked.txt'), 'x\n')
  git('add', '--', 'package.json', 'tracked.txt')
  git('commit', '-q', '-m', 'init')
  return { dir, git }
}

test('expected set covers the generated files and npm own files', () => {
  const { dir } = tmpRepo()
  const expected = expectedPaths(dir)
  for (const p of ['package.json', 'package-lock.json', 'CHANGELOG.md', 'RELEASES.md']) {
    assert.ok(expected.has(p), `${p} is expected`)
  }
})

test('no strays when only the release files are staged', () => {
  const { dir, git } = tmpRepo()
  fs.writeFileSync(path.join(dir, 'CHANGELOG.md'), '# c\n')
  fs.writeFileSync(path.join(dir, 'RELEASES.md'), '# r\n')
  git('add', '--', 'CHANGELOG.md', 'RELEASES.md')
  assert.deepStrictEqual(findStrays(dir), [])
})

test('a file staged by another session is a stray', () => {
  const { dir, git } = tmpRepo()
  fs.writeFileSync(path.join(dir, 'CHANGELOG.md'), '# c\n')
  fs.appendFileSync(path.join(dir, 'tracked.txt'), 'intruder\n')
  git('add', '--', 'CHANGELOG.md', 'tracked.txt')
  assert.deepStrictEqual(findStrays(dir), ['tracked.txt'])
})

test('the guard exits non-zero and names the stray', () => {
  const { dir, git } = tmpRepo()
  fs.appendFileSync(path.join(dir, 'tracked.txt'), 'intruder\n')
  git('add', '--', 'tracked.txt')

  let code = 0
  let stderr = ''
  try {
    execFileSync('node', [GUARD], { cwd: dir, encoding: 'utf8', stdio: 'pipe' })
  } catch (err) {
    code = err.status
    stderr = err.stderr
  }
  assert.strictEqual(code, 1, 'exits 1')
  assert.match(stderr, /tracked\.txt/)
  assert.match(stderr, /Nothing has been committed or tagged/)
})

test('the guard exits zero on a clean index', () => {
  const { dir } = tmpRepo()
  execFileSync('node', [GUARD], { cwd: dir, encoding: 'utf8' })
})

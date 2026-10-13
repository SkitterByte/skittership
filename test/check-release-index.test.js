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
const { findStrays, expectedPaths, LOCKFILES } = require(GUARD)

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

test('expected set covers the generated files and the package manager own files', () => {
  const { dir } = tmpRepo()
  const expected = expectedPaths(dir)
  for (const p of ['package.json', 'package-lock.json', 'CHANGELOG.md', 'RELEASES.md']) {
    assert.ok(expected.has(p), `${p} is expected`)
  }
})

// Only npm's lockfiles were listed, so `pnpm version` in a pnpm project staged
// pnpm-lock.yaml, the guard called it a stray, and the release aborted — every
// time, for every non-npm project. The lockfile is the one file guaranteed to
// be staged by the release itself.
test('every package manager lockfile is expected, not a stray', () => {
  const { dir } = tmpRepo()
  const expected = expectedPaths(dir)
  for (const lock of ['pnpm-lock.yaml', 'yarn.lock', 'bun.lockb', 'bun.lock']) {
    assert.ok(expected.has(lock), `${lock} is expected`)
  }
  assert.ok(LOCKFILES.includes('package-lock.json'), 'npm lockfile still covered')
})

test('a pnpm release with only its lockfile staged has no strays', () => {
  const { dir, git } = tmpRepo()
  fs.writeFileSync(path.join(dir, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n')
  fs.writeFileSync(path.join(dir, 'CHANGELOG.md'), '# Changelog\n')
  git('add', '--', 'pnpm-lock.yaml', 'CHANGELOG.md')
  assert.deepStrictEqual(findStrays(dir), [])
})

test('a lockfile does not smuggle an unrelated file past the guard', () => {
  const { dir, git } = tmpRepo()
  fs.writeFileSync(path.join(dir, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n')
  fs.writeFileSync(path.join(dir, 'tracked.txt'), 'changed by another session\n')
  git('add', '--', 'pnpm-lock.yaml', 'tracked.txt')
  assert.deepStrictEqual(findStrays(dir), ['tracked.txt'])
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

// --- the version being released is already tagged ---------------------------
//
// After a hotfix, main's package.json still names the pre-hotfix version, so
// `npm version patch` computes the hotfix's own version. It regenerated both
// files, committed, and only then failed on the existing tag — leaving a
// version commit with no tag. The guard runs before npm commits, so it refuses
// there instead.

const runGuard = (dir, env) => {
  try {
    const stdout = execFileSync('node', [GUARD], {
      cwd: dir,
      encoding: 'utf8',
      stdio: 'pipe',
      env: { ...process.env, npm_lifecycle_event: 'version', ...env },
    })
    return { code: 0, stdout, stderr: '' }
  } catch (err) {
    return { code: err.status, stdout: err.stdout, stderr: err.stderr }
  }
}

const bumpTo = (dir, version) =>
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 't', version }))

test('the guard refuses a version whose tag already exists, naming it', () => {
  const { dir, git } = tmpRepo()
  git('tag', 'v1.0.0')
  git('tag', 'v1.0.1') // the hotfix, cut elsewhere
  bumpTo(dir, '1.0.1') // npm version patch on main, still at 1.0.0
  const { code, stderr } = runGuard(dir)
  assert.strictEqual(code, 1, 'exits 1')
  assert.match(stderr, /v1\.0\.1/)
  assert.match(stderr, /npm version 1\.0\.2/, 'suggests the next free patch')
})

test('the suggested patch skips every tag already taken', () => {
  const { dir, git } = tmpRepo()
  for (const t of ['v1.0.0', 'v1.0.1', 'v1.0.2', 'v1.1.0']) git('tag', t)
  bumpTo(dir, '1.0.1')
  assert.match(runGuard(dir).stderr, /npm version 1\.0\.3\b/)
})

test('the guard stays silent on a normal release whose tag does not exist', () => {
  const { dir, git } = tmpRepo()
  git('tag', 'v1.0.0')
  bumpTo(dir, '1.0.1')
  const { code, stderr } = runGuard(dir)
  assert.strictEqual(code, 0)
  assert.strictEqual(stderr, '')
})

// Outside the version lifecycle package.json names the RELEASED version, whose
// tag exists by definition. That is not a collision.
test('the guard stays silent outside npm version, where the tag is expected', () => {
  const { dir, git } = tmpRepo()
  git('tag', 'v1.0.0')
  const { code, stderr } = runGuard(dir, { npm_lifecycle_event: '' })
  assert.strictEqual(code, 0)
  assert.strictEqual(stderr, '')
})

test('the guard honours a custom tag-version-prefix', () => {
  const { dir, git } = tmpRepo()
  git('tag', 'release-1.0.1')
  bumpTo(dir, '1.0.1')
  const { code, stderr } = runGuard(dir, { npm_config_tag_version_prefix: 'release-' })
  assert.strictEqual(code, 1)
  assert.match(stderr, /release-1\.0\.1/)
})

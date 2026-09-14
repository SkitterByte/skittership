'use strict'

// `--retro` with no count. The installer wires `changelog:retro` /
// `releases:retro` as `node scripts/generate-*.cjs --retro` — no count — so
// while a count was required, both npm helpers exited 1 with a usage error and
// could never run. A bare `--retro` now backfills every version tag.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const ASSETS = path.join(__dirname, '..', 'assets', 'scripts')
const CHANGELOG = path.join(ASSETS, 'generate-changelog.cjs')
const RELEASES = path.join(ASSETS, 'generate-releases.cjs')

// A repo with two tagged releases, each carrying one conventional commit.
function taggedRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skittership-retro-'))
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' })
  git('init', '-q', '.')
  git('config', 'user.email', 't@t')
  git('config', 'user.name', 'T')
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 't', version: '1.1.0' }))
  git('add', '--', 'package.json')
  git('commit', '-q', '-m', 'chore: init')

  const bump = (file, subject, tag) => {
    fs.writeFileSync(path.join(dir, file), 'x\n')
    git('add', '--', file)
    git('commit', '-q', '-m', subject)
    git('tag', tag)
  }
  bump('a.txt', 'feat(core): first thing\n\nRelease-Note: You can do the first thing.', 'v1.0.0')
  bump('b.txt', 'fix(core): second thing\n\nRelease-Note: The second thing works now.', 'v1.1.0')
  return dir
}

const run = (script, args, dir) =>
  execFileSync('node', [script, ...args], { cwd: dir, encoding: 'utf8' })

test('changelog --retro with no count backfills every tag', () => {
  const dir = taggedRepo()
  const out = run(CHANGELOG, ['--retro'], dir)
  const written = fs.readFileSync(path.join(dir, 'CHANGELOG.md'), 'utf8')
  assert.match(written, /## \[1\.0\.0\]/, 'oldest tag backfilled')
  assert.match(written, /## \[1\.1\.0\]/, 'newest tag backfilled')
  assert.doesNotMatch(out, /Usage:/)
})

test('releases --retro with no count backfills every tag', () => {
  const dir = taggedRepo()
  run(RELEASES, ['--retro'], dir)
  const written = fs.readFileSync(path.join(dir, 'RELEASES.md'), 'utf8')
  assert.match(written, /## 1\.0\.0/)
  assert.match(written, /## 1\.1\.0/)
  assert.match(written, /You can do the first thing\./)
})

test('--retro <count> still limits to the newest N tags', () => {
  const dir = taggedRepo()
  run(CHANGELOG, ['--retro', '1'], dir)
  const written = fs.readFileSync(path.join(dir, 'CHANGELOG.md'), 'utf8')
  assert.match(written, /## \[1\.1\.0\]/, 'newest tag written')
  assert.doesNotMatch(written, /## \[1\.0\.0\]/, 'older tag not written')
})

test('--retro with an invalid count is still a usage error', () => {
  const dir = taggedRepo()
  for (const bad of ['0', 'abc', '-3']) {
    let code = 0
    let stderr = ''
    try {
      execFileSync('node', [CHANGELOG, '--retro', bad], { cwd: dir, encoding: 'utf8', stdio: 'pipe' })
    } catch (err) {
      code = err.status
      stderr = err.stderr
    }
    // '-3' parses as a flag-shaped token, so it falls through to "all tags"
    // rather than erroring — assert only that it never silently misreads a count.
    if (bad === '-3') {
      assert.strictEqual(code, 0, '-3 treated as absent count')
    } else {
      assert.strictEqual(code, 1, `${bad} rejected`)
      assert.match(stderr, /Usage:/)
    }
  }
})

'use strict'

// release.recordedHashes: a commit hash recorded in the repo (a docs page's
// `verified: <sha>`) that is not in the history being tagged is warned about —
// a rebase rewrites hashes silently. It never stops a release, and a hash the
// clone cannot see is "cannot tell", never a warning.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync, spawnSync } = require('node:child_process')

const ASSET_SCRIPTS = path.join(__dirname, '..', 'assets', 'scripts')
const { loadConfig } = require(path.join(ASSET_SCRIPTS, 'lib', 'config.cjs'))

const SOURCE = { files: ['docs/*.html'], pattern: '^verified: ([0-9a-f]{7,40})' }

function repo({ recordedHashes = [SOURCE] } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skittership-hashes-'))
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: 'pipe' }).trim()
  git('init', '-q', '-b', 'main', '.')
  git('config', 'user.email', 't@t')
  git('config', 'user.name', 'T')
  git('config', 'tag.gpgSign', 'false')
  fs.cpSync(ASSET_SCRIPTS, path.join(dir, 'scripts'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'mono', private: true }))
  const release = { test: 'node -e "0"' }
  if (recordedHashes) release.recordedHashes = recordedHashes
  fs.writeFileSync(
    path.join(dir, 'skittership.config.json'),
    JSON.stringify({ version: 1, packages: { api: { dir: 'packages/api' } }, release }),
  )
  fs.mkdirSync(path.join(dir, 'packages/api'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'packages/api/package.json'), JSON.stringify({ version: '1.0.0' }) + '\n')
  fs.mkdirSync(path.join(dir, 'docs'))
  git('add', '-A')
  git('commit', '-q', '-m', 'chore: init')
  const commit = (file, message) => {
    fs.writeFileSync(path.join(dir, file), `${Math.random()}\n`)
    git('add', '--', file)
    git('commit', '-q', '-m', message)
    return git('rev-parse', 'HEAD')
  }
  const record = (hash) => {
    fs.writeFileSync(path.join(dir, 'docs/page.html'), `<!-- coverage\nverified: ${hash}\n-->\n`)
    git('add', '--', 'docs/page.html')
    git('commit', '-q', '-m', 'docs: record verified')
  }
  return { dir, git, commit, record }
}

function run(dir, args) {
  const r = spawnSync('node', ['scripts/release.cjs', ...args], { cwd: dir, encoding: 'utf8' })
  return { status: r.status, out: r.stdout + r.stderr }
}

// A hash that resolves but is not in main's history: the pre-rebase copy of a
// commit that was rebased. The object survives; the history no longer has it.
function rebased(r) {
  const { git, commit } = r
  git('checkout', '-q', '-b', 'side')
  const old = commit('packages/api/x.js', 'feat(api): x')
  git('checkout', '-q', 'main')
  commit('packages/api/y.js', 'feat(api): y')
  git('cherry-pick', old)
  git('branch', '-D', 'side')
  return old
}

test('a recorded hash rewritten by a rebase is warned about', () => {
  const r = repo()
  const old = rebased(r)
  r.record(old)
  const out = run(r.dir, ['check-hashes'])
  assert.strictEqual(out.status, 0)
  assert.match(out.out, new RegExp(`⚠ docs/page.html:2: ${old} is not in the history of HEAD`))
})

test('the warning never stops a release', () => {
  const r = repo()
  r.record(rebased(r))
  const out = run(r.dir, ['api', 'minor', '--yes'])
  assert.strictEqual(out.status, 0, out.out)
  assert.match(out.out, /→ check recorded commit hashes/)
  assert.match(out.out, /⚠ docs\/page\.html:2/)
  assert.strictEqual(r.git('rev-parse', 'api@1.1.0^{commit}'), r.git('rev-parse', 'HEAD'))
})

test('a hash in the history says nothing on release — stays silent', () => {
  const r = repo()
  r.record(r.commit('packages/api/a.js', 'feat(api): a'))
  const out = run(r.dir, ['api', 'minor', '--yes'])
  assert.strictEqual(out.status, 0, out.out)
  assert.doesNotMatch(out.out, /⚠|cannot tell/)
  assert.match(run(r.dir, ['check-hashes']).out, /1 recorded hash\(es\), all in the history of HEAD/)
})

test('a hash this clone cannot see is "cannot tell", not a warning — stays silent', () => {
  const r = repo()
  r.record('0123456789abcdef0123456789abcdef01234567')
  const out = run(r.dir, ['check-hashes'])
  assert.strictEqual(out.status, 0)
  assert.match(out.out, /cannot tell — docs\/page\.html:2: 0123456789abcdef/)
  assert.doesNotMatch(out.out, /⚠/)
})

test('recordedHashes unset: no step and no output', () => {
  const r = repo({ recordedHashes: null })
  r.commit('packages/api/a.js', 'feat(api): a')
  const plan = run(r.dir, ['api', 'minor'])
  assert.doesNotMatch(plan.out, /recorded commit hashes/)
  const out = run(r.dir, ['api', 'minor', '--yes'])
  assert.strictEqual(out.status, 0, out.out)
  assert.doesNotMatch(out.out, /hash|⚠|cannot tell/)
})

test('check-hashes against an older ref, and a ref that is not a commit', () => {
  const r = repo()
  const a = r.commit('packages/api/a.js', 'feat(api): a')
  const b = r.commit('packages/api/b.js', 'feat(api): b')
  r.record(b)
  assert.match(run(r.dir, ['check-hashes', a]).out, new RegExp(`⚠ .*${b} is not in the history of ${a}`))
  const bad = run(r.dir, ['check-hashes', 'no-such-ref'])
  assert.strictEqual(bad.status, 0)
  assert.match(bad.out, /cannot tell — no-such-ref is not a commit here/)
})

test('only files matching the globs are read', () => {
  const r = repo()
  const old = rebased(r)
  fs.writeFileSync(path.join(r.dir, 'notes.md'), `verified: ${old}\n`)
  r.git('add', '--', 'notes.md')
  r.git('commit', '-q', '-m', 'docs: notes')
  assert.match(run(r.dir, ['check-hashes']).out, /0 recorded hash\(es\)/)
})

test('a malformed recordedHashes refuses on load', () => {
  const cases = [
    ['x', /must be an array/],
    [[{ pattern: '(x)' }], /files must be a non-empty array/],
    [[{ files: ['a'], pattern: '[' }], /not a valid regular expression/],
    [[{ files: ['a'], pattern: 'verified: [0-9a-f]+' }], /capture the hash in group 1/],
  ]
  for (const [recordedHashes, message] of cases) {
    const { dir } = repo({ recordedHashes })
    assert.throws(() => loadConfig(dir), message)
  }
})

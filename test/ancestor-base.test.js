'use strict'

// The changelog base is the nearest ANCESTOR release tag, never the newest tag
// by sort. With suffix hotfixes the two part ways constantly:
//
//   v1.0.0 ── F1 ── (v1.0.0-hotfix.1) ── F2        hotfix/x
//      └──── F1′ ── M ── (v1.1.0) ── HEAD          main
//
// By sort, v1.1.0 > v1.0.0-hotfix.1 > v1.0.0. A second hotfix based on v1.1.0
// re-listed F1; main based on v1.0.0-hotfix.1 (when that sorted newest) took a
// tag outside its own history. The ancestor is right in both places.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync, spawnSync } = require('node:child_process')

const SCRIPTS = path.join(__dirname, '..', 'assets', 'scripts')
const LIB = path.join(SCRIPTS, 'lib', 'git-commits.cjs')

const PROBE = `
const { getCommitsSinceLastTag, parseCommit } = require(${JSON.stringify(LIB)})
let range = 'NOT REPORTED'
const since = getCommitsSinceLastTag(process.argv[2], { onRange: (r) => (range = r) })
  .map(parseCommit).filter(Boolean).map((c) => c.message)
console.log(JSON.stringify({ since, range }))
`

function cleanEnv(extra = {}) {
  const { RELEASE_BASE_TAG: _unset, ...env } = process.env
  return { ...env, ...extra }
}

function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skittership-ancestor-'))
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: 'pipe' })
  git('init', '-q', '-b', 'main', '.')
  git('config', 'user.email', 't@t')
  git('config', 'user.name', 'T')
  const commit = (file, message) => {
    fs.writeFileSync(path.join(dir, file), `${file}\n`)
    git('add', '--', file)
    git('commit', '-q', '-m', message)
  }
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 't', version: '1.0.0' }))
  git('add', '--', 'package.json')
  git('commit', '-q', '-m', 'chore: init')
  commit('base.txt', 'feat(core): base')
  git('tag', 'v1.0.0')
  fs.writeFileSync(path.join(dir, 'probe.cjs'), PROBE)
  return { dir, git, commit }
}

// The diagram above, with HEAD left on hotfix/x after F2.
function twoLines() {
  const r = repo()
  const { git, commit } = r
  git('checkout', '-q', '-b', 'hotfix/x', 'v1.0.0')
  commit('f1.txt', 'fix(core): first fix\n\nRelease-Note: The first fix.')
  git('tag', 'v1.0.0-hotfix.1')
  const f1 = git('rev-parse', 'HEAD').trim()
  git('checkout', '-q', 'main')
  commit('m.txt', 'feat(core): mainline work\n\nRelease-Note: Mainline work.')
  git('cherry-pick', f1)
  git('tag', 'v1.1.0')
  git('checkout', '-q', 'hotfix/x')
  commit('f2.txt', 'fix(core): second fix\n\nRelease-Note: The second fix.')
  return r
}

const probe = (dir, version, env) =>
  JSON.parse(execFileSync('node', ['probe.cjs', version], { cwd: dir, encoding: 'utf8', env: cleanEnv(env) }))

const runScript = (dir, name, args = [], env) =>
  spawnSync('node', [path.join(SCRIPTS, name), ...args], { cwd: dir, encoding: 'utf8', env: cleanEnv(env) })

test('a second hotfix lists only its own fix', () => {
  const { dir } = twoLines()
  const { since, range } = probe(dir, '1.0.0-hotfix.2')
  assert.deepStrictEqual(since, ['second fix'])
  assert.strictEqual(range, 'v1.0.0-hotfix.1..HEAD')
})

test('main after a suffix hotfix bases on its own ancestor, not the hotfix tag', () => {
  const { dir, git, commit } = twoLines()
  git('checkout', '-q', 'main')
  git('tag', '-d', 'v1.1.0') // so the hotfix tag is the newest by sort
  commit('n.txt', 'feat(core): next')
  const { since, range } = probe(dir, '1.1.0')
  assert.strictEqual(range, 'v1.0.0..HEAD')
  assert.deepStrictEqual(since, ['next', 'first fix', 'mainline work'])
})

test('RELEASE_BASE_TAG wins over the ancestor and is named in the range', () => {
  const { dir, commit, git } = repo()
  commit('a.txt', 'feat(core): a')
  git('tag', 'v1.1.0')
  commit('b.txt', 'feat(core): b')
  const { since, range } = probe(dir, '1.2.0', { RELEASE_BASE_TAG: 'v1.0.0' })
  assert.deepStrictEqual(since, ['b', 'a'])
  assert.strictEqual(range, 'v1.0.0..HEAD (RELEASE_BASE_TAG)')
})

test('a RELEASE_BASE_TAG that is not a tag refuses and writes nothing', () => {
  const { dir, commit } = repo()
  commit('a.txt', 'feat(core): a')
  for (const script of ['generate-changelog.cjs', 'generate-releases.cjs']) {
    const res = runScript(dir, script, ['1.1.0'], { RELEASE_BASE_TAG: 'v9.9.9' })
    assert.strictEqual(res.status, 1, `${script} exits 1`)
    assert.match(res.stderr, /RELEASE_BASE_TAG=v9\.9\.9 is not a tag/)
  }
  assert.ok(!fs.existsSync(path.join(dir, 'CHANGELOG.md')))
  assert.ok(!fs.existsSync(path.join(dir, 'RELEASES.md')))
})

test('tags exist but none is an ancestor: refuse, write nothing, name the override', () => {
  const { dir, git, commit } = repo()
  git('checkout', '-q', '--orphan', 'other')
  commit('o.txt', 'feat(core): orphan work')
  for (const script of ['generate-changelog.cjs', 'generate-releases.cjs']) {
    const res = runScript(dir, script, ['2.0.0'])
    assert.strictEqual(res.status, 1, `${script} exits 1`)
    assert.match(res.stderr, /No release tag is an ancestor of HEAD/)
    assert.match(res.stderr, /RELEASE_BASE_TAG/)
  }
  assert.ok(!fs.existsSync(path.join(dir, 'CHANGELOG.md')))
  assert.ok(!fs.existsSync(path.join(dir, 'RELEASES.md')))
})

test('retro pairs each tag with its ancestor', () => {
  const { dir } = twoLines()
  const res = runScript(dir, 'generate-changelog.cjs', ['--retro'])
  assert.strictEqual(res.status, 0, res.stderr)
  const changelog = fs.readFileSync(path.join(dir, 'CHANGELOG.md'), 'utf8')
  const sections = Object.fromEntries(
    changelog
      .split(/\n(?=## \[)/)
      .filter((s) => s.startsWith('## ['))
      .map((s) => [s.match(/^## \[([^\]]+)\]/)[1], s]),
  )
  assert.deepStrictEqual(Object.keys(sections), ['1.1.0', '1.0.0-hotfix.1', '1.0.0'])
  assert.match(sections['1.0.0-hotfix.1'], /first fix/)
  assert.doesNotMatch(sections['1.0.0-hotfix.1'], /mainline work/)
  assert.match(sections['1.1.0'], /mainline work/)
  assert.match(sections['1.1.0'], /first fix/, 'main lists the picked fix again, by design')
})

// Stays silent on a shallow clone: the ancestor tag is out of sight until the
// clone is deepened, and "no ancestor" there would be a false refusal.
test('a shallow clone unshallows and finds the ancestor', () => {
  const { dir, commit } = repo()
  commit('a.txt', 'feat(core): a')
  commit('b.txt', 'feat(core): b')
  const clone = fs.mkdtempSync(path.join(os.tmpdir(), 'skittership-shallow-'))
  execFileSync('git', ['clone', '-q', '--depth', '1', '--no-tags', `file://${dir}`, clone], { stdio: 'pipe' })
  execFileSync('git', ['fetch', '-q', '--depth', '1', 'origin', 'tag', 'v1.0.0'], { cwd: clone, stdio: 'pipe' })
  // The fixture really hides the ancestor — otherwise this proves nothing.
  assert.throws(() =>
    execFileSync('git', ['describe', '--tags', '--abbrev=0', 'HEAD'], { cwd: clone, stdio: 'pipe' }),
  )
  fs.writeFileSync(path.join(clone, 'probe.cjs'), PROBE)
  const { since, range } = probe(clone, '1.1.0')
  assert.strictEqual(range, 'v1.0.0..HEAD')
  assert.deepStrictEqual(since, ['b', 'a'])
})

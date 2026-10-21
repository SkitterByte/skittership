'use strict'

// `release-hotfix.cjs` cuts `v<root>-hotfix.<N+1>` through the project's own
// `<pm> version`, so its hooks run unchanged, and never pushes by default —
// skitterspec's /spec-hotfix sequences the push and the carry to main.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync, spawnSync } = require('node:child_process')

const ASSETS = path.join(__dirname, '..', 'assets', 'scripts')
const SCRIPT = path.join(ASSETS, 'release-hotfix.cjs')
const { rootOf, nextHotfixVersion, detectPackageManager } = require(SCRIPT)

// --- version selection ---------------------------------------------------------

const next = (base, tags) => nextHotfixVersion(base, tags).tag

test('the first hotfix of a release is -hotfix.1', () => {
  assert.strictEqual(next('v37.2.0', ['v37.1.0', 'v37.2.0']), 'v37.2.0-hotfix.1')
})

test('existing hotfixes of the root are counted', () => {
  assert.strictEqual(
    next('v37.2.0', ['v37.2.0', 'v37.2.0-hotfix.1', 'v37.2.0-hotfix.2']),
    'v37.2.0-hotfix.3',
  )
})

test('a hotfix of a hotfix stays on the root, never the next patch', () => {
  const tags = ['v36.4.0', 'v36.4.0-hotfix.1', 'v36.4.0-hotfix.2']
  assert.strictEqual(next('v36.4.0-hotfix.2', tags), 'v36.4.0-hotfix.3')
})

test('a later patch release is irrelevant — it neither blocks nor is used', () => {
  assert.strictEqual(next('v37.2.0', ['v37.2.0', 'v37.2.1', 'v37.3.0']), 'v37.2.0-hotfix.1')
})

// The tag deploys, so a number taken on another branch is still taken.
test('a hotfix tag from another branch still takes its number', () => {
  assert.strictEqual(next('v1.0.0', ['v1.0.0', 'v1.0.0-hotfix.4']), 'v1.0.0-hotfix.5')
})

test('numbers compare numerically, and other roots are ignored', () => {
  const tags = ['v1.0.0-hotfix.9', 'v1.0.0-hotfix.10', 'v1.0.1-hotfix.50', 'v11.0.0-hotfix.70']
  assert.strictEqual(next('v1.0.0', tags), 'v1.0.0-hotfix.11')
})

test('rootOf accepts releases and hotfixes, and nothing else', () => {
  assert.strictEqual(rootOf('v36.4.0'), '36.4.0')
  assert.strictEqual(rootOf('v36.4.0-hotfix.2'), '36.4.0')
  assert.strictEqual(rootOf('36.4.0'), '36.4.0')
  assert.strictEqual(rootOf('v2.0.0-rc.1'), null)
  assert.strictEqual(nextHotfixVersion('v2.0.0-rc.1', []), null)
})

test('detectPackageManager: packageManager field, then lockfile, then npm', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skittership-pm-'))
  const pkg = (obj) => fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(obj))
  pkg({ name: 't' })
  assert.strictEqual(detectPackageManager(dir), 'npm')
  fs.writeFileSync(path.join(dir, 'pnpm-lock.yaml'), '')
  assert.strictEqual(detectPackageManager(dir), 'pnpm')
  pkg({ name: 't', packageManager: 'yarn@4.0.0' })
  assert.strictEqual(detectPackageManager(dir), 'npm', 'the field wins over the lockfile')
  pkg({ name: 't', packageManager: 'pnpm@12.4.2' })
  assert.strictEqual(detectPackageManager(dir), 'pnpm')
})

// --- end to end ------------------------------------------------------------------
//
//   v1.0.0 ── fix ── HEAD                      hotfix/x
//      └──── feat ── (v1.1.0)                  main
//
// An npm project with the shipped scripts and the canonical version hook, and a
// bare remote to prove what was (not) pushed.

const VERSION_HOOK =
  'node scripts/generate-changelog.cjs && node scripts/generate-releases.cjs && ' +
  'git add CHANGELOG.md RELEASES.md && node scripts/check-release-index.cjs'

function hotfixProject({ scripts = {} } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skittership-release-hotfix-'))
  const dir = path.join(root, 'work')
  const remote = path.join(root, 'remote.git')
  execFileSync('git', ['init', '-q', '--bare', remote])
  fs.mkdirSync(path.join(dir, 'scripts', 'lib'), { recursive: true })
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: 'pipe' }).trim()
  git('init', '-q', '-b', 'main', '.')
  git('config', 'user.email', 't@t')
  git('config', 'user.name', 'T')
  git('config', 'tag.gpgSign', 'false')
  git('config', 'commit.gpgSign', 'false')
  git('remote', 'add', 'origin', remote)

  for (const f of [
    'release-hotfix.cjs',
    'generate-changelog.cjs',
    'generate-releases.cjs',
    'check-release-index.cjs',
    'lib/git-commits.cjs',
    'lib/config.cjs',
  ]) {
    fs.copyFileSync(path.join(ASSETS, f), path.join(dir, 'scripts', f))
  }
  const pkg = { name: 't', version: '1.0.0', private: true, scripts: { version: VERSION_HOOK, ...scripts } }
  fs.writeFileSync(path.join(dir, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`)
  git('add', '--', 'package.json', 'scripts')
  git('commit', '-q', '-m', 'chore: init')
  git('tag', 'v1.0.0')

  const commit = (file, message) => {
    fs.writeFileSync(path.join(dir, file), `${file}\n`)
    git('add', '--', file)
    git('commit', '-q', '-m', message)
  }
  commit('feat.txt', 'feat(core): mainline feature\n\nRelease-Note: A mainline feature.')
  git('tag', 'v1.1.0')
  git('checkout', '-q', '-b', 'hotfix/x', 'v1.0.0')
  commit('fix.txt', 'fix(core): count hops\n\nRelease-Note: Hop counts are now correct.')
  return { dir, remote, git, commit }
}

function run(dir, ...args) {
  const { RELEASE_BASE_TAG: _unset, ...env } = process.env
  const res = spawnSync('node', ['scripts/release-hotfix.cjs', ...args], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...env, npm_config_sign_git_tag: 'false', npm_config_update_notifier: 'false' },
  })
  return { code: res.status, stdout: res.stdout, stderr: res.stderr }
}

const remoteRefs = (remote) =>
  execFileSync('git', ['for-each-ref', '--format=%(refname)'], { cwd: remote, encoding: 'utf8' }).trim()

test('cuts v1.0.0-hotfix.1 on a version commit listing only the fix, and pushes nothing', () => {
  const { dir, remote, git } = hotfixProject()
  const { code, stdout, stderr } = run(dir, '--json')
  assert.strictEqual(code, 0, stderr)

  const result = JSON.parse(stdout) // stdout is the JSON and nothing else
  const head = git('rev-parse', 'HEAD')
  assert.deepStrictEqual(result, {
    tag: 'v1.0.0-hotfix.1',
    version: '1.0.0-hotfix.1',
    baseTag: 'v1.0.0',
    branch: 'hotfix/x',
    versionCommit: head,
    pushed: false,
  })
  assert.strictEqual(git('rev-parse', 'v1.0.0-hotfix.1^{commit}'), head)
  assert.strictEqual(JSON.parse(git('show', 'HEAD:package.json')).version, '1.0.0-hotfix.1')

  const changelog = git('show', 'HEAD:CHANGELOG.md')
  assert.match(changelog, /## \[1\.0\.0-hotfix\.1\]/)
  assert.match(changelog, /count hops/)
  assert.doesNotMatch(changelog, /mainline feature/)
  const releases = git('show', 'HEAD:RELEASES.md')
  assert.match(releases, /Hop counts are now correct/)
  assert.doesNotMatch(releases, /A mainline feature/)

  assert.strictEqual(remoteRefs(remote), '', 'nothing pushed')
})

// CLAUDE.md's "pnpm version runs the same hooks and commits what they stage"
// was verified for `patch`; this proves it for an explicit hotfix version.
const hasPnpm = spawnSync('pnpm', ['--version'], { stdio: 'ignore' }).status === 0
test('a pnpm project cuts through pnpm version, hooks and all', { skip: !hasPnpm && 'pnpm not installed' }, () => {
  const { dir, remote, git } = hotfixProject()
  fs.writeFileSync(path.join(dir, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\n")
  git('add', '--', 'pnpm-lock.yaml')
  git('commit', '-q', '-m', 'chore: pnpm')
  const { code, stdout, stderr } = run(dir, '--json')
  assert.strictEqual(code, 0, stderr)
  const result = JSON.parse(stdout)
  assert.strictEqual(result.tag, 'v1.0.0-hotfix.1')
  assert.strictEqual(git('rev-parse', 'v1.0.0-hotfix.1^{commit}'), result.versionCommit)
  assert.match(git('show', 'HEAD:CHANGELOG.md'), /count hops/, 'the version hook ran and was committed')
  assert.match(git('show', 'HEAD:RELEASES.md'), /Hop counts are now correct/)
  assert.strictEqual(remoteRefs(remote), '')
})

test('a second hotfix on the same line takes .2 and lists only its own fix', () => {
  const { dir, git, commit } = hotfixProject()
  assert.strictEqual(run(dir).code, 0)
  commit('fix2.txt', 'fix(core): second fix')
  const { code, stdout, stderr } = run(dir, '--json')
  assert.strictEqual(code, 0, stderr)
  const result = JSON.parse(stdout)
  assert.strictEqual(result.tag, 'v1.0.0-hotfix.2')
  assert.strictEqual(result.baseTag, 'v1.0.0-hotfix.1')
  const section = git('show', 'HEAD:CHANGELOG.md').split('## [1.0.0-hotfix.1]')[0]
  assert.match(section, /second fix/)
  assert.doesNotMatch(section, /count hops/)
})

test('without --json it prints the next commands, branch before tag', () => {
  const { dir } = hotfixProject()
  const { code, stdout } = run(dir)
  assert.strictEqual(code, 0)
  const branchAt = stdout.indexOf('git push origin hotfix/x')
  const tagAt = stdout.indexOf('git push origin v1.0.0-hotfix.1')
  assert.ok(branchAt >= 0 && tagAt > branchAt, stdout)
  assert.match(stdout, /git cherry-pick v1\.0\.0\.\.[0-9a-f]{40}~1/)
})

test('--push sends the branch, then the tag', () => {
  const { dir, remote, git } = hotfixProject()
  const { code, stdout, stderr } = run(dir, '--push', '--json')
  assert.strictEqual(code, 0, stderr)
  assert.strictEqual(JSON.parse(stdout).pushed, true)
  const refs = remoteRefs(remote).split('\n')
  assert.ok(refs.includes('refs/heads/hotfix/x'))
  assert.ok(refs.includes('refs/tags/v1.0.0-hotfix.1'))
  // Order is observable in git's own output: one push per ref, branch first.
  assert.ok(stderr.indexOf('hotfix/x') < stderr.indexOf('v1.0.0-hotfix.1 ->'), stderr)
  assert.strictEqual(
    execFileSync('git', ['rev-parse', 'v1.0.0-hotfix.1^{commit}'], { cwd: remote, encoding: 'utf8' }).trim(),
    git('rev-parse', 'HEAD'),
  )
})

test('--dry-run reports the plan and changes nothing', () => {
  const { dir, git } = hotfixProject()
  const before = { head: git('rev-parse', 'HEAD'), tags: git('tag', '--list'), status: git('status', '--porcelain') }
  const { code, stdout } = run(dir, '--dry-run', '--json')
  assert.strictEqual(code, 0)
  assert.deepStrictEqual(JSON.parse(stdout), {
    tag: 'v1.0.0-hotfix.1',
    version: '1.0.0-hotfix.1',
    baseTag: 'v1.0.0',
    branch: 'hotfix/x',
    versionCommit: null,
    pushed: false,
  })
  assert.deepStrictEqual(
    { head: git('rev-parse', 'HEAD'), tags: git('tag', '--list'), status: git('status', '--porcelain') },
    before,
  )
})

// --- refusals: one line, non-zero, nothing changed ----------------------------------

function assertRefused(dir, git, args, pattern) {
  const head = git('rev-parse', 'HEAD')
  const tags = git('tag', '--list')
  const { code, stdout, stderr } = run(dir, ...args)
  assert.strictEqual(code, 1, stderr)
  assert.strictEqual(stdout, '')
  assert.strictEqual(stderr.trim().split('\n').length, 1, `one line: ${stderr}`)
  assert.match(stderr, pattern)
  assert.strictEqual(git('rev-parse', 'HEAD'), head)
  assert.strictEqual(git('tag', '--list'), tags)
}

test('refuses off the hotfix branch prefix', () => {
  const { dir, git } = hotfixProject()
  git('checkout', '-q', 'main')
  assertRefused(dir, git, ['--json'], /must run on a hotfix\/\* branch \(current: main\)/)
})

test('honours a configured branch prefix', () => {
  const { dir, git } = hotfixProject()
  fs.writeFileSync(path.join(dir, 'skittership.config.json'), JSON.stringify({ hotfix: { branchPrefix: 'release/' } }))
  git('add', '--', 'skittership.config.json')
  git('commit', '-q', '-m', 'chore: config')
  assertRefused(dir, git, [], /must run on a release\/\* branch \(current: hotfix\/x\)/)
  git('checkout', '-q', '-b', 'release/y')
  assert.strictEqual(run(dir, '--dry-run').code, 0)
})

test('refuses a dirty tree', () => {
  const { dir, git } = hotfixProject()
  fs.writeFileSync(path.join(dir, 'fix.txt'), 'edited\n')
  assertRefused(dir, git, [], /working tree is not clean/)
})

test('refuses with no ancestor release tag', () => {
  const { dir, git, commit } = hotfixProject()
  git('checkout', '-q', '--orphan', 'hotfix/orphan')
  commit('o.txt', 'fix(core): orphan')
  assertRefused(dir, git, [], /no release tag is an ancestor of HEAD/)
})

test('refuses when HEAD is already released', () => {
  const { dir, git } = hotfixProject()
  assert.strictEqual(run(dir).code, 0)
  assertRefused(dir, git, [], /already released as v1\.0\.0-hotfix\.1/)
})

test('refuses a postversion script unless --allow-postversion', () => {
  const { dir, git } = hotfixProject({ scripts: { postversion: 'echo would-push' } })
  assertRefused(dir, git, [], /postversion script \("echo would-push"\).*--allow-postversion/)
  const { code, stderr } = run(dir, '--allow-postversion')
  assert.strictEqual(code, 0)
  assert.match(stderr, /would-push/, 'the hook ran')
})

test('refuses an unknown option', () => {
  const { dir, git } = hotfixProject()
  assertRefused(dir, git, ['--force'], /unknown option --force/)
})

'use strict'

// scripts/release.cjs: a bare run plans and changes nothing; --yes cuts
// (bump, notes, tests, preTag hooks, commit, annotated tag); only --push
// pushes, and then one ref per `git push`.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync, spawnSync } = require('node:child_process')

const ASSET_SCRIPTS = path.join(__dirname, '..', 'assets', 'scripts')
const { parseArgs, nextVersion } = require(path.join(ASSET_SCRIPTS, 'release.cjs'))

// --- pure ---------------------------------------------------------------------

test('parseArgs: a configured package first, then the bump', () => {
  const opts = parseArgs(['api', 'minor', '--yes'], ['api'])
  assert.strictEqual(opts.package, 'api')
  assert.strictEqual(opts.bump, 'minor')
  assert.strictEqual(opts.yes, true)
  assert.strictEqual(parseArgs(['minor'], ['api']).package, null)
})

test('parseArgs: --push without --yes refuses', () => {
  assert.throws(() => parseArgs(['patch', '--push']), /--push needs --yes/)
})

test('parseArgs: a missing or extra bump, or an unknown flag, refuses', () => {
  assert.throws(() => parseArgs([]), /usage/)
  assert.throws(() => parseArgs(['patch', 'minor']), /usage/)
  assert.throws(() => parseArgs(['patch', '--publish']), /unknown option --publish/)
})

test('nextVersion: keywords, an explicit version, equal allowed, downgrade refused', () => {
  assert.strictEqual(nextVersion('1.2.3', 'patch'), '1.2.4')
  assert.strictEqual(nextVersion('1.2.3', 'minor'), '1.3.0')
  assert.strictEqual(nextVersion('1.2.3', 'major'), '2.0.0')
  assert.strictEqual(nextVersion('1.2.3', '1.10.0'), '1.10.0')
  assert.strictEqual(nextVersion('1.2.3', '1.2.3'), '1.2.3')
  assert.throws(() => nextVersion('1.2.3', '1.2.2'), /downgrade/)
  assert.throws(() => nextVersion('1.2.3', 'next'), /not patch, minor, major/)
})

// --- fixture monorepo ---------------------------------------------------------

function repo({ release = {}, packages, rootPkg, remote = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skittership-release-'))
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: 'pipe' }).trim()
  git('init', '-q', '-b', 'main', '.')
  git('config', 'user.email', 't@t')
  git('config', 'user.name', 'T')
  git('config', 'tag.gpgSign', 'false')
  // Installed as a consumer has them: copied into scripts/ and committed.
  fs.cpSync(ASSET_SCRIPTS, path.join(dir, 'scripts'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify(rootPkg || { name: 'mono', private: true }, null, 2) + '\n',
  )
  fs.writeFileSync(
    path.join(dir, 'skittership.config.json'),
    JSON.stringify({
      version: 1,
      packages: packages || { api: { dir: 'packages/api', paths: ['packages/api/**'] } },
      release: { test: 'node -e "process.exit(0)"', ...release },
    }),
  )
  fs.mkdirSync(path.join(dir, 'packages/api'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'packages/api/package.json'),
    JSON.stringify({ name: '@x/api', version: '1.0.0' }, null, 2) + '\n',
  )
  git('add', '-A')
  git('commit', '-q', '-m', 'chore: init')
  const commit = (file, message) => {
    fs.writeFileSync(path.join(dir, file), `${Math.random()}\n`)
    git('add', '--', file)
    git('commit', '-q', '-m', message)
  }
  let origin = null
  if (remote) {
    origin = fs.mkdtempSync(path.join(os.tmpdir(), 'skittership-origin-'))
    execFileSync('git', ['init', '-q', '--bare', origin])
    // Log how many refs each push carries, one line per push.
    const hook = path.join(origin, 'hooks', 'pre-receive')
    fs.writeFileSync(hook, `#!/bin/sh\nwc -l | tr -d ' ' >> "${path.join(origin, 'pushes.log')}"\n`)
    fs.chmodSync(hook, 0o755)
    git('remote', 'add', 'origin', origin)
  }
  return { dir, git, commit, origin }
}

function release(dir, args, env = {}) {
  const { RELEASE_BASE_TAG: _unset, ...base } = process.env
  const r = spawnSync('node', ['scripts/release.cjs', ...args], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...base, ...env },
  })
  return { status: r.status, stdout: r.stdout, out: r.stdout + r.stderr }
}

const tags = (git) => git('tag', '--list').split('\n').filter(Boolean)
const versionOf = (dir) =>
  JSON.parse(fs.readFileSync(path.join(dir, 'packages/api/package.json'), 'utf8')).version

test('a bare run prints the plan and changes nothing', () => {
  const { dir, git, commit } = repo()
  commit('packages/api/a.js', 'feat(api): a\n\nRelease-Note: A.')
  const head = git('rev-parse', 'HEAD')

  const r = release(dir, ['api', 'minor'])
  assert.strictEqual(r.status, 0, r.out)
  assert.match(r.out, /release: api {2}1\.0\.0 → 1\.1\.0/)
  assert.match(r.out, /tag: {3}api@1\.1\.0/)
  assert.match(r.out, /git tag -a api@1\.1\.0/)
  assert.match(r.out, /git push origin api@1\.1\.0/)
  assert.match(r.out, /never --tags or --follow-tags/)
  assert.match(r.out, /plan only — nothing changed/)
  assert.strictEqual(git('rev-parse', 'HEAD'), head)
  assert.strictEqual(git('status', '--porcelain'), '')
  assert.deepStrictEqual(tags(git), [])
})

test('--yes cuts a package release: bump, notes, one commit of those files, annotated tag', () => {
  const { dir, git, commit } = repo()
  commit('packages/api/a.js', 'feat(api): a thing\n\nRelease-Note: You can do a thing.')

  const r = release(dir, ['api', 'minor', '--yes'])
  assert.strictEqual(r.status, 0, r.out)
  assert.strictEqual(versionOf(dir), '1.1.0')
  assert.match(fs.readFileSync(path.join(dir, 'RELEASES-api.md'), 'utf8'), /## 1\.1\.0 — [\s\S]*a thing/)
  assert.strictEqual(git('log', '-1', '--format=%s'), 'chore(release): api@1.1.0')
  assert.deepStrictEqual(
    git('show', '--name-only', '--format=', 'HEAD').split('\n').sort(),
    ['RELEASES-api.md', 'packages/api/package.json'],
  )
  assert.strictEqual(git('cat-file', '-t', 'api@1.1.0'), 'tag')
  assert.strictEqual(git('rev-parse', 'api@1.1.0^{commit}'), git('rev-parse', 'HEAD'))
  assert.strictEqual(git('status', '--porcelain'), '')
  assert.match(r.out, /Next, one tag per push/)
})

test('preTag hooks run with the release in their environment', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'skittership-hooklog-'))
  const log = path.join(tmp, 'env')
  const script = path.join(tmp, 'hook.cjs')
  fs.writeFileSync(
    script,
    `const e = process.env
require('fs').writeFileSync(${JSON.stringify(log)}, [e.RELEASE_PACKAGE, e.RELEASE_VERSION, e.RELEASE_TAG, e.RELEASE_BASE_TAG].join(' '))
`,
  )
  const hook = `node ${JSON.stringify(script)}`
  const { dir, git, commit } = repo({ release: { preTag: [hook] } })
  commit('packages/api/a.js', 'feat(api): a')
  git('tag', 'api@1.0.0')
  commit('packages/api/b.js', 'feat(api): b')

  const r = release(dir, ['api', 'patch', '--yes'])
  assert.strictEqual(r.status, 0, r.out)
  assert.strictEqual(fs.readFileSync(log, 'utf8'), 'api 1.0.1 api@1.0.1 api@1.0.0')
})

function assertNothingCut(r, git, head) {
  assert.strictEqual(r.status, 1, r.out)
  assert.match(r.out, /nothing was committed or tagged/)
  assert.strictEqual(git('rev-parse', 'HEAD'), head)
  assert.deepStrictEqual(tags(git).filter((t) => t.startsWith('api@1.1')), [])
}

test('red tests stop the release and name how to put the files back', () => {
  const { dir, git, commit } = repo({ release: { test: 'node -e "process.exit(3)"' } })
  commit('packages/api/a.js', 'feat(api): a\n\nRelease-Note: A.')
  const head = git('rev-parse', 'HEAD')

  const r = release(dir, ['api', 'minor', '--yes'])
  assertNothingCut(r, git, head)
  assert.match(r.out, /failed \(exit 3\)/)
  assert.match(r.out, /git checkout -- packages\/api\/package\.json/)
  assert.match(r.out, /rm RELEASES-api\.md/)
  // The hint is runnable: after it, the tree is clean again.
  execFileSync('sh', ['-c', 'git checkout -- packages/api/package.json && rm RELEASES-api.md'], { cwd: dir })
  assert.strictEqual(git('status', '--porcelain'), '')
})

test('a failing preTag hook stops the release', () => {
  const { dir, git, commit } = repo({ release: { preTag: ['node -e "process.exit(1)"'] } })
  commit('packages/api/a.js', 'feat(api): a')
  const head = git('rev-parse', 'HEAD')
  const r = release(dir, ['api', 'minor', '--yes'])
  assertNothingCut(r, git, head)
  assert.match(r.out, /preTag hook failed/)
})

test('--skip-tests and --skip-hooks are said in the plan', () => {
  const { dir } = repo({ release: { preTag: ['node -e "1"'] } })
  const r = release(dir, ['api', 'minor', '--skip-tests', '--skip-hooks'])
  assert.match(r.out, /--skip-tests — the suite will NOT run/)
  assert.match(r.out, /--skip-hooks — 1 preTag hook\(s\) will NOT run/)
})

test('an existing tag refuses', () => {
  const { dir, git, commit } = repo()
  commit('packages/api/a.js', 'feat(api): a')
  git('tag', 'api@1.1.0')
  const r = release(dir, ['api', '1.1.0', '--yes'])
  assert.strictEqual(r.status, 1)
  assert.match(r.out, /tag api@1\.1\.0 already exists/)
})

test('a dirty tree refuses', () => {
  const { dir } = repo()
  fs.writeFileSync(path.join(dir, 'stray.txt'), 'x')
  const r = release(dir, ['api', 'minor', '--yes'])
  assert.strictEqual(r.status, 1)
  assert.match(r.out, /not clean/)
})

test('a package with no tags yet releases from all history — stays silent', () => {
  const { dir, git, commit } = repo()
  git('tag', 'v0.9.0') // another series entirely
  commit('packages/api/a.js', 'feat(api): first\n\nRelease-Note: First.')
  const plan = release(dir, ['api', '1.0.0'])
  assert.match(plan.out, /base: {2}\(first release — no earlier tag\)/)
  assert.match(plan.out, /version already 1\.0\.0 — tagging it, no bump/)

  const r = release(dir, ['api', '1.0.0', '--yes'])
  assert.strictEqual(r.status, 0, r.out)
  assert.doesNotMatch(r.out, /✖/)
  assert.strictEqual(git('rev-parse', 'api@1.0.0^{commit}'), git('rev-parse', 'HEAD'))
})

test('a package with no dir refuses before anything', () => {
  const { dir } = repo({ packages: { api: { paths: ['packages/api/**'] } } })
  const r = release(dir, ['api', 'minor'])
  assert.strictEqual(r.status, 1)
  assert.match(r.out, /packages\.api\.dir is not set/)
})

test('a versionless monorepo root asks for a package', () => {
  const { dir } = repo()
  const r = release(dir, ['minor'])
  assert.strictEqual(r.status, 1)
  assert.match(r.out, /name a package: api/)
})

test('--json prints only the result on stdout', () => {
  const { dir, commit } = repo()
  commit('packages/api/a.js', 'feat(api): a')
  const r = release(dir, ['api', 'minor', '--yes', '--json'])
  assert.strictEqual(r.status, 0, r.out)
  const result = JSON.parse(r.stdout)
  assert.strictEqual(result.package, 'api')
  assert.strictEqual(result.tag, 'api@1.1.0')
  assert.strictEqual(result.pushed, false)
  assert.match(result.commit, /^[0-9a-f]{40}$/)
})

test('--push pushes the branch, then the tag, one ref per push', () => {
  const { dir, git, commit, origin } = repo({ remote: true })
  commit('packages/api/a.js', 'feat(api): a')
  const r = release(dir, ['api', 'minor', '--yes', '--push'])
  assert.strictEqual(r.status, 0, r.out)
  const remote = (...args) => execFileSync('git', args, { cwd: origin, encoding: 'utf8' }).trim()
  assert.strictEqual(remote('rev-parse', 'main'), git('rev-parse', 'HEAD'))
  assert.strictEqual(remote('rev-parse', 'api@1.1.0^{commit}'), git('rev-parse', 'HEAD'))
  assert.deepStrictEqual(fs.readFileSync(path.join(origin, 'pushes.log'), 'utf8').trim().split('\n'), ['1', '1'])
})

test('without --push nothing reaches the remote', () => {
  const { dir, commit, origin } = repo({ remote: true })
  commit('packages/api/a.js', 'feat(api): a')
  assert.strictEqual(release(dir, ['api', 'minor', '--yes']).status, 0)
  assert.ok(!fs.existsSync(path.join(origin, 'pushes.log')))
})

test('root mode refuses a postversion script that may push', () => {
  const { dir } = repo({
    packages: {},
    rootPkg: { name: 'app', version: '1.0.0', scripts: { postversion: 'git push --follow-tags' } },
  })
  assert.match(release(dir, ['minor']).out, /--yes refuses without --allow-postversion/)
  const r = release(dir, ['minor', '--yes'])
  assert.strictEqual(r.status, 1)
  assert.match(r.out, /postversion script .* may push — pass --allow-postversion/)
})

test('root mode delegates to the package manager’s version command', () => {
  const { dir, git, commit } = repo({ packages: {}, rootPkg: { name: 'app', version: '1.0.0' } })
  commit('a.txt', 'feat(core): a')
  const plan = release(dir, ['minor'])
  assert.match(plan.out, /npm version 1\.1\.0/)

  const r = release(dir, ['minor', '--yes'])
  assert.strictEqual(r.status, 0, r.out)
  assert.strictEqual(git('rev-parse', 'v1.1.0^{commit}'), git('rev-parse', 'HEAD'))
})

test('release.staged adds the approve step to what comes next', () => {
  const { dir } = repo({ release: { staged: true } })
  const r = release(dir, ['api', 'minor'])
  assert.match(r.out, /npm run approve api 1\.1\.0 {3}# once CI has staged it/)
})

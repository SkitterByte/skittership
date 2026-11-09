'use strict'

// Per-package release notes for a monorepo: each package releases from its own
// tag series (`<prefix><version>`), takes the commits whose changed files
// match its `paths`, and every run lists the footers no package claimed.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync, spawnSync } = require('node:child_process')

const ROOT = path.join(__dirname, '..')
const SCRIPTS = path.join(ROOT, 'assets', 'scripts')
const BIN = path.join(ROOT, 'bin', 'skittership.js')
const { loadConfig, resolvePackage, CONFIG_FILE } = require(path.join(SCRIPTS, 'lib', 'config.cjs'))
const { globMatcher } = require(path.join(SCRIPTS, 'lib', 'git-commits.cjs'))

function tmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `skittership-${prefix}-`))
}

// --- config -----------------------------------------------------------------

function configIn(obj) {
  const dir = tmp('pkgcfg')
  fs.writeFileSync(path.join(dir, CONFIG_FILE), JSON.stringify(obj))
  return dir
}

test('packages is null when not configured — stays silent', () => {
  assert.strictEqual(loadConfig(configIn({ version: 1 })).packages, null)
  assert.strictEqual(loadConfig(configIn({ packages: null })).packages, null)
})

test('packages is kept exactly as written, defaults filled only on resolve', () => {
  const packages = { a: { paths: ['packages/a/**'] }, b: {} }
  const cfg = loadConfig(configIn({ packages }))
  assert.deepStrictEqual(cfg.packages, packages)

  const a = resolvePackage(cfg, 'a')
  assert.strictEqual(a.tagPrefix, 'a@')
  assert.strictEqual(a.releasesFile, 'RELEASES-a.md')
  assert.strictEqual(a.productName, 'a')
  assert.strictEqual(a.dir, null)
  assert.deepStrictEqual(a.paths, ['packages/a/**'])
  assert.strictEqual(a.scheme.tagFor('1.0.0'), 'a@1.0.0')
  assert.strictEqual(resolvePackage(cfg, 'b').paths, null)
  assert.strictEqual(resolvePackage(cfg, 'nope'), null)
  assert.strictEqual(resolvePackage(cfg, 'toString'), null)
})

test('a malformed package entry refuses, naming the package and field', () => {
  const cases = [
    [[], /packages must be an object/],
    [{ 'a b': {} }, /"a b" is not a usable package name/],
    [{ a: 'x' }, /packages\.a must be an object/],
    [{ a: { paths: [] } }, /packages\.a\.paths must be a non-empty array/],
    [{ a: { paths: 'packages/a' } }, /packages\.a\.paths must be a non-empty array/],
    [{ a: { releasesFile: '' } }, /packages\.a\.releasesFile must be a non-empty string/],
    [{ a: { tagPrefix: 'a' } }, /packages\.a\.tagPrefix: .*end in one of/],
  ]
  for (const [packages, message] of cases) {
    assert.throws(() => loadConfig(configIn({ packages })), message)
  }
})

// --- globs ------------------------------------------------------------------

test('globMatcher: ** crosses directories, * and ? do not', () => {
  const m = globMatcher('packages/**/src/*.js')
  assert.ok(m('packages/a/src/x.js'))
  assert.ok(m('packages/a/b/src/x.js'))
  assert.ok(m('packages/src/x.js'))
  assert.ok(!m('packages/a/src/d/x.js'))
  assert.ok(globMatcher('a/?.md')('a/b.md'))
  assert.ok(!globMatcher('a/?.md')('a/bc.md'))
  assert.ok(globMatcher('packages/common/**')('packages/common/deep/file.js'))
  assert.ok(!globMatcher('packages/common/**')('packages/commonx/file.js'))
})

test('globMatcher: a plain path matches itself and everything beneath it', () => {
  const m = globMatcher('packages/common')
  assert.ok(m('packages/common'))
  assert.ok(m('packages/common/a/b.js'))
  assert.ok(!m('packages/commonx/a.js'))
  assert.ok(globMatcher('./packages/common/')('packages/common/a.js'))
})

// --- the generator, against a monorepo --------------------------------------

const PACKAGES = {
  a: { paths: ['packages/common/**', 'packages/a/**'], dir: 'packages/a' },
  b: { paths: ['packages/common/**', 'packages/b/**'], releasesFile: 'B-NOTES.md' },
}

function monorepo({ packages = PACKAGES, releases = {} } = {}) {
  const dir = tmp('monorepo')
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: 'pipe' })
  git('init', '-q', '-b', 'main', '.')
  git('config', 'user.email', 't@t')
  git('config', 'user.name', 'T')
  fs.writeFileSync(
    path.join(dir, CONFIG_FILE),
    JSON.stringify({ version: 1, releases: { productName: 'mono', ...releases }, packages }),
  )
  git('add', '--', CONFIG_FILE)
  git('commit', '-q', '-m', 'chore: init')
  let n = 0
  const commit = (file, message) => {
    n += 1
    const abs = path.join(dir, file)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, `${n}\n`)
    git('add', '--', file)
    git('commit', '-q', '-m', message)
  }
  return { dir, git, commit }
}

const note = (type, scope, text) => `${type}(${scope}): ${text}\n\nRelease-Note: ${text}.`

function generate(dir, ...args) {
  const { RELEASE_BASE_TAG: _unset, ...env } = process.env
  const r = spawnSync('node', [path.join(SCRIPTS, 'generate-releases.cjs'), ...args], {
    cwd: dir,
    encoding: 'utf8',
    env,
  })
  return { status: r.status, out: r.stdout + r.stderr }
}

const read = (dir, file) => {
  const p = path.join(dir, file)
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null
}

test("--package writes that package's notes from its own series, attributed by path", () => {
  const { dir, git, commit } = monorepo()
  commit('packages/a/x.js', note('feat', 'a', 'A one'))
  git('tag', 'a@1.0.0')
  commit('packages/b/x.js', note('feat', 'b', 'B one'))
  git('tag', 'b@1.0.0')
  commit('packages/a/y.js', note('feat', 'a', 'A two'))
  commit('packages/b/y.js', note('fix', 'b', 'B two'))
  commit('packages/common/z.js', note('fix', 'common', 'Shared fix'))

  const r = generate(dir, '--package', 'a', '1.1.0')
  assert.strictEqual(r.status, 0, r.out)
  assert.match(r.out, /a@1\.0\.0\.\.HEAD/)
  const notes = read(dir, 'RELEASES-a.md')
  assert.match(notes, /^# Release Notes\n\nWhat's new for users of a\./)
  assert.match(notes, /## 1\.1\.0 — /)
  assert.match(notes, /A two/)
  assert.match(notes, /Shared fix/)
  assert.doesNotMatch(notes, /A one|B one|B two/)
  assert.strictEqual(read(dir, 'RELEASES.md'), null)
})

test('a shared-path commit lands in both packages, once each', () => {
  const { dir, commit } = monorepo()
  commit('packages/common/z.js', note('fix', 'common', 'Shared fix'))

  assert.strictEqual(generate(dir, '--package', 'a', '1.0.0').status, 0)
  assert.strictEqual(generate(dir, '--package', 'b', '1.0.0').status, 0)
  for (const file of ['RELEASES-a.md', 'B-NOTES.md']) {
    assert.strictEqual(read(dir, file).match(/Shared fix/g).length, 1, file)
  }
})

test('footers no package claims are listed, and left out', () => {
  const { dir, commit } = monorepo()
  commit('packages/a/x.js', note('feat', 'a', 'A one'))
  commit('docs/guide.md', note('feat', 'docs', 'A docs page'))
  commit('docs/other.md', 'docs: tidy\n\nRelease-Note: none')

  const r = generate(dir, '--package', 'a', '1.0.0')
  assert.strictEqual(r.status, 0, r.out)
  assert.match(r.out, /1 Release-Note footer\(s\) match no configured package/)
  assert.match(r.out, /    feat\(docs\): A docs page/)
  assert.doesNotMatch(r.out, /docs: tidy/)
  assert.doesNotMatch(read(dir, 'RELEASES-a.md'), /A docs page/)
})

test('a package with no tags yet is a first release, not a refusal — stays silent', () => {
  const { dir, git, commit } = monorepo()
  commit('packages/b/x.js', note('feat', 'b', 'B one'))
  git('tag', 'b@1.0.0')
  git('tag', 'v0.9.0')
  commit('packages/a/x.js', note('feat', 'a', 'A one'))

  const r = generate(dir, '--package', 'a', '1.0.0')
  assert.strictEqual(r.status, 0, r.out)
  assert.match(r.out, /all history — no tags/)
  assert.doesNotMatch(r.out, /✖|match no configured package/)
  assert.match(read(dir, 'RELEASES-a.md'), /A one/)
})

test('a range with no footers writes the placeholder, and lists no orphans — stays silent', () => {
  const { dir, git, commit } = monorepo()
  commit('packages/a/x.js', note('feat', 'a', 'A one'))
  git('tag', 'a@1.0.0')
  commit('packages/a/y.js', 'chore(a): tidy')

  const r = generate(dir, '--package', 'a', '1.0.1')
  assert.strictEqual(r.status, 0, r.out)
  assert.doesNotMatch(r.out, /match no configured package/)
  assert.match(read(dir, 'RELEASES-a.md'), /## 1\.0\.1 — .*\n\nNo user-facing changes in this release\./)
})

test('emptyRelease: false writes no section for a package with no notes', () => {
  const { dir, commit } = monorepo({ releases: { emptyRelease: false } })
  commit('packages/b/x.js', note('feat', 'b', 'B one'))

  const r = generate(dir, '--package', 'a', '1.0.0')
  assert.strictEqual(r.status, 0, r.out)
  assert.doesNotMatch(read(dir, 'RELEASES-a.md') || '', /## 1\.0\.0/)
})

test('the version comes from the package dir when none is passed', () => {
  const { dir, commit } = monorepo()
  commit('packages/a/package.json', 'chore(a): add manifest')
  fs.writeFileSync(path.join(dir, 'packages/a/package.json'), JSON.stringify({ version: '3.2.1' }))
  commit('packages/a/x.js', note('feat', 'a', 'A one'))

  assert.strictEqual(generate(dir, '--package', 'a').status, 0)
  assert.match(read(dir, 'RELEASES-a.md'), /## 3\.2\.1 — /)
})

test('no version and no dir refuses, naming both ways to supply one', () => {
  const { dir, commit } = monorepo()
  commit('packages/b/x.js', note('feat', 'b', 'B one'))
  const r = generate(dir, '--package', 'b')
  assert.strictEqual(r.status, 1)
  assert.match(r.out, /pass the version, or set packages\.b\.dir/)
})

test('an unknown package refuses, listing the configured ones', () => {
  const { dir } = monorepo()
  const r = generate(dir, '--package', 'c', '1.0.0')
  assert.strictEqual(r.status, 1)
  assert.match(r.out, /No package "c" .* configured: a, b/)
})

test('--package with no packages configured refuses', () => {
  const { dir } = monorepo({ packages: null })
  const r = generate(dir, '--package', 'a', '1.0.0')
  assert.strictEqual(r.status, 1)
  assert.match(r.out, /configures no packages/)
})

test('without --package, a configured packages map changes nothing', () => {
  const { dir, git, commit } = monorepo()
  commit('packages/a/x.js', note('feat', 'a', 'A one'))
  git('tag', 'v1.0.0')
  commit('packages/b/x.js', note('feat', 'b', 'B one'))

  const r = generate(dir, '1.1.0')
  assert.strictEqual(r.status, 0, r.out)
  assert.match(r.out, /v1\.0\.0\.\.HEAD/)
  assert.doesNotMatch(r.out, /match no configured package/)
  assert.match(read(dir, 'RELEASES.md'), /B one/)
  assert.strictEqual(read(dir, 'RELEASES-a.md'), null)
})

test('--package --retro pairs that package’s tags only', () => {
  const { dir, git, commit } = monorepo()
  commit('packages/a/x.js', note('feat', 'a', 'A one'))
  git('tag', 'a@1.0.0')
  commit('packages/b/x.js', note('feat', 'b', 'B one'))
  git('tag', 'b@5.0.0')
  commit('packages/a/y.js', note('fix', 'a', 'A two'))
  git('tag', 'a@1.0.1')

  const r = generate(dir, '--package', 'a', '--retro')
  assert.strictEqual(r.status, 0, r.out)
  assert.match(r.out, /a@1\.0\.0: wrote 1 note/)
  assert.match(r.out, /a@1\.0\.1: wrote 1 note/)
  assert.doesNotMatch(r.out, /b@5/)
  const notes = read(dir, 'RELEASES-a.md')
  assert.ok(notes.indexOf('## 1.0.1') < notes.indexOf('## 1.0.0'))
  assert.match(notes.slice(notes.indexOf('## 1.0.1'), notes.indexOf('## 1.0.0')), /A two/)
  assert.doesNotMatch(notes, /B one|5\.0\.0/)
})

// --- init / update carry it through -----------------------------------------

function project(extra = {}) {
  const dir = tmp('pkginit')
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 't', version: '1.0.0' }))
  fs.writeFileSync(
    path.join(dir, CONFIG_FILE),
    JSON.stringify({
      version: 1,
      changelog: { enabled: true, file: 'CHANGELOG.md' },
      releases: { enabled: true, file: 'RELEASES.md', productName: 't', scopeAreas: {} },
      versionHook: true,
      ...extra,
    }),
  )
  return dir
}

const skittership = (dir, cmd) =>
  execFileSync('node', [BIN, cmd, '--yes', '--no-claude-md'], { cwd: dir, encoding: 'utf8', stdio: 'pipe' })

test('init and update write packages back exactly as written', () => {
  const packages = { a: { paths: ['packages/a/**'] }, 'b-c': { tagPrefix: 'bc/', dir: 'pkgs/bc' } }
  for (const cmd of ['init', 'update']) {
    const dir = project({ packages })
    skittership(dir, cmd)
    const cfg = JSON.parse(fs.readFileSync(path.join(dir, CONFIG_FILE), 'utf8'))
    assert.deepStrictEqual(cfg.packages, packages, cmd)
  }
})

test('init and update add no packages key where there was none — stays silent', () => {
  for (const cmd of ['init', 'update']) {
    const dir = project()
    skittership(dir, cmd)
    const cfg = JSON.parse(fs.readFileSync(path.join(dir, CONFIG_FILE), 'utf8'))
    assert.ok(!('packages' in cfg), cmd)
  }
})

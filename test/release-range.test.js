'use strict'

// `--range <from>..<to>` names the base explicitly, on both generators, and
// wins over RELEASE_BASE_TAG and the computed ancestor. Plus a fixture shaped
// like the skitterspec monorepo — five interleaved `<pkg>@` series, legacy
// `v*` tags, and a shared source feeding every distribution — which is the
// layout `packages` exists for.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync, spawnSync } = require('node:child_process')

const SCRIPTS = path.join(__dirname, '..', 'assets', 'scripts')

function repo(config = { version: 1 }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skittership-range-'))
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: 'pipe' })
  git('init', '-q', '-b', 'main', '.')
  git('config', 'user.email', 't@t')
  git('config', 'user.name', 'T')
  fs.writeFileSync(path.join(dir, 'skittership.config.json'), JSON.stringify(config))
  git('add', '--', 'skittership.config.json')
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

function run(dir, script, args, env = {}) {
  const { RELEASE_BASE_TAG: _unset, ...base } = process.env
  const r = spawnSync('node', [path.join(SCRIPTS, script), ...args], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...base, ...env },
  })
  return { status: r.status, out: r.stdout + r.stderr }
}

const read = (dir, file) => {
  const p = path.join(dir, file)
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null
}

// v1.0.0 ── one ── v1.1.0 ── two ── three (HEAD)
function linear() {
  const r = repo()
  r.commit('a.txt', note('feat', 'core', 'One'))
  r.git('tag', 'v1.0.0')
  r.commit('b.txt', note('feat', 'core', 'Two'))
  r.git('tag', 'v1.1.0')
  r.commit('c.txt', note('fix', 'core', 'Three'))
  return r
}

test('--range overrides the computed base on both generators', () => {
  const { dir } = linear()
  const rel = run(dir, 'generate-releases.cjs', ['--range', 'v1.0.0..HEAD', '1.2.0'])
  assert.strictEqual(rel.status, 0, rel.out)
  assert.match(rel.out, /v1\.0\.0\.\.HEAD \(--range\)/)
  assert.match(read(dir, 'RELEASES.md'), /Two[\s\S]*Three|Three[\s\S]*Two/)

  const log = run(dir, 'generate-changelog.cjs', ['--range', 'v1.0.0..HEAD', '1.2.0'])
  assert.strictEqual(log.status, 0, log.out)
  assert.match(log.out, /v1\.0\.0\.\.HEAD \(--range\)/)
  const changelog = read(dir, 'CHANGELOG.md')
  assert.match(changelog, /Two/)
  assert.match(changelog, /Three/)
  assert.doesNotMatch(changelog, /One/)
})

test('--range wins over RELEASE_BASE_TAG', () => {
  const { dir } = linear()
  const r = run(dir, 'generate-releases.cjs', ['--range', 'v1.1.0..HEAD', '1.2.0'], {
    RELEASE_BASE_TAG: 'v1.0.0',
  })
  assert.strictEqual(r.status, 0, r.out)
  assert.doesNotMatch(read(dir, 'RELEASES.md'), /Two/)
})

test('an end that does not resolve refuses and writes nothing', () => {
  const { dir } = linear()
  for (const script of ['generate-releases.cjs', 'generate-changelog.cjs']) {
    const r = run(dir, script, ['--range', 'v9.9.9..HEAD', '1.2.0'])
    assert.strictEqual(r.status, 1, script)
    assert.match(r.out, /--range end "v9\.9\.9" is not a commit/)
    assert.match(r.out, /Nothing was written/)
  }
  assert.strictEqual(read(dir, 'RELEASES.md'), null)
  assert.strictEqual(read(dir, 'CHANGELOG.md'), null)
})

test('a malformed range refuses', () => {
  const { dir } = linear()
  for (const bad of ['v1.0.0...HEAD', 'v1.0.0', '..HEAD', 'v1.0.0..', 'a..b..c', 'v1.0.0..$(id)']) {
    const r = run(dir, 'generate-releases.cjs', ['--range', bad, '1.2.0'])
    assert.strictEqual(r.status, 1, bad)
    assert.match(r.out, /--range/, bad)
  }
  assert.strictEqual(read(dir, 'RELEASES.md'), null)
})

test('--range with no value refuses', () => {
  const { dir } = linear()
  const r = run(dir, 'generate-releases.cjs', ['--range'])
  assert.strictEqual(r.status, 1)
})

test('--range and --retro do not combine', () => {
  const { dir } = linear()
  const r = run(dir, 'generate-releases.cjs', ['--retro', '--range', 'v1.0.0..HEAD'])
  assert.strictEqual(r.status, 1)
  assert.match(r.out, /do not combine/)
})

test('a range that resolves but holds no commits is not an error — stays silent', () => {
  const { dir } = linear()
  const rel = run(dir, 'generate-releases.cjs', ['--range', 'HEAD..HEAD', '1.2.0'])
  assert.strictEqual(rel.status, 0, rel.out)
  assert.doesNotMatch(rel.out, /✖/)
  assert.match(read(dir, 'RELEASES.md'), /## 1\.2\.0 — .*\n\nNo user-facing changes in this release\./)

  const log = run(dir, 'generate-changelog.cjs', ['--range', 'HEAD..HEAD', '1.2.0'])
  assert.strictEqual(log.status, 0, log.out)
  assert.doesNotMatch(log.out, /✖/)
})

test('--range combines with --package: the range is explicit, attribution still applies', () => {
  const { dir, git, commit } = repo({
    version: 1,
    packages: { a: { paths: ['packages/a/**'] }, b: { paths: ['packages/b/**'] } },
  })
  commit('packages/a/x.js', note('feat', 'a', 'A one'))
  const start = git('rev-parse', 'HEAD').trim()
  commit('packages/a/y.js', note('feat', 'a', 'A two'))
  commit('packages/b/y.js', note('feat', 'b', 'B two'))

  const r = run(dir, 'generate-releases.cjs', ['--package', 'a', '--range', `${start}..HEAD`, '1.0.0'])
  assert.strictEqual(r.status, 0, r.out)
  const notes = read(dir, 'RELEASES-a.md')
  assert.match(notes, /A two/)
  assert.doesNotMatch(notes, /A one|B two/)
})

// --- the skitterspec layout -------------------------------------------------

const PROVIDERS = ['linear', 'jira', 'github', 'azure-boards']
const SHARED = ['packages/common/**', 'packages/sync-core/**', 'packages/provider-kit/**']

// Mirrors skitterspec's own FEEDS table: `common` ships in every distribution,
// sync-core and provider-kit in the four providers, each provider in its own.
const SKITTERSPEC_PACKAGES = {
  skitterspec: { paths: ['packages/common/**', 'packages/skitterspec/**'] },
  ...Object.fromEntries(
    PROVIDERS.map((p) => [
      `skitterspec-${p}`,
      { paths: [...SHARED, `packages/${p}/**`, `packages/skitterspec-${p}/**`] },
    ]),
  ),
}

function skitterspecRepo() {
  const r = repo({ version: 1, releases: { productName: 'skitterspec' }, packages: SKITTERSPEC_PACKAGES })
  const { git, commit } = r
  // Legacy single-series tags from before the split.
  commit('packages/common/legacy.js', note('feat', 'common', 'Legacy feature'))
  git('tag', 'v1.0.0')
  git('tag', 'v1.0.1')
  // Each distribution's first release, interleaved.
  commit('packages/skitterspec/a.js', note('feat', 'cli', 'Core first'))
  git('tag', 'skitterspec@16.0.0')
  commit('packages/linear/a.js', note('feat', 'linear', 'Linear first'))
  git('tag', 'skitterspec-linear@10.0.0')
  for (const p of ['jira', 'github', 'azure-boards']) {
    commit(`packages/${p}/a.js`, note('feat', p, `${p} first`))
    git('tag', `skitterspec-${p}@1.0.0`)
  }
  // Then work since those releases.
  commit('packages/common/shared.js', note('fix', 'common', 'Shared fix'))
  commit('packages/sync-core/s.js', note('fix', 'sync', 'Sync fix'))
  commit('packages/linear/b.js', note('feat', 'linear', 'Linear second'))
  commit('packages/skitterspec/b.js', note('feat', 'cli', 'Core second'))
  commit('docs/site.html', note('feat', 'docs', 'Website page'))
  commit('scripts/release.js', 'chore(scripts): tooling only')
  return r
}

test('skitterspec layout: each distribution bases on its own series, never on v*', () => {
  const { dir } = skitterspecRepo()
  const expected = {
    skitterspec: 'skitterspec@16.0.0..HEAD',
    'skitterspec-linear': 'skitterspec-linear@10.0.0..HEAD',
    'skitterspec-jira': 'skitterspec-jira@1.0.0..HEAD',
  }
  for (const [pkg, range] of Object.entries(expected)) {
    const r = run(dir, 'generate-releases.cjs', ['--package', pkg, '9.9.9'])
    assert.strictEqual(r.status, 0, r.out)
    assert.ok(r.out.includes(range), `${pkg}: ${r.out}`)
    assert.doesNotMatch(r.out, /v1\.0\.1/, pkg)
  }
})

test('skitterspec layout: a shared change reaches every distribution it ships in', () => {
  const { dir } = skitterspecRepo()
  const notesOf = (pkg) => {
    assert.strictEqual(run(dir, 'generate-releases.cjs', ['--package', pkg, '9.9.9']).status, 0)
    return read(dir, `RELEASES-${pkg}.md`)
  }
  const core = notesOf('skitterspec')
  assert.match(core, /Shared fix/)
  assert.match(core, /Core second/)
  assert.doesNotMatch(core, /Sync fix|Linear|Legacy|Core first/)

  const linearNotes = notesOf('skitterspec-linear')
  for (const text of ['Shared fix', 'Sync fix', 'Linear second']) assert.match(linearNotes, new RegExp(text))
  assert.doesNotMatch(linearNotes, /Core second|Linear first/)

  const jira = notesOf('skitterspec-jira')
  assert.match(jira, /Shared fix/)
  assert.match(jira, /Sync fix/)
  assert.doesNotMatch(jira, /Linear|Core second/)
})

test('skitterspec layout: a footer shipping in no distribution is an orphan, every run', () => {
  const { dir } = skitterspecRepo()
  for (const pkg of ['skitterspec', 'skitterspec-github']) {
    const r = run(dir, 'generate-releases.cjs', ['--package', pkg, '9.9.9'])
    assert.match(r.out, /1 Release-Note footer\(s\) match no configured package/, pkg)
    assert.match(r.out, /feat\(docs\): Website page/, pkg)
    assert.doesNotMatch(r.out, /tooling only/, pkg)
  }
})

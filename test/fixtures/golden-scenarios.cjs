'use strict'

// Scenarios the default tag scheme must keep answering exactly as it did before
// tag schemes existed. Shared by tag-scheme-golden.test.js and by whoever
// regenerates the expected output from an older copy of the scripts:
//
//   node test/fixtures/golden-scenarios.cjs <scripts-dir>   → prints JSON
//
// Every commit is dated, so the only date left to vary is "today" — the
// fallback for a version that is not tagged yet — and it is normalised away.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync, spawnSync } = require('node:child_process')

const DATE = '2026-01-02T03:04:05Z'

function env() {
  const { RELEASE_BASE_TAG: _unset, ...rest } = process.env
  return { ...rest, GIT_AUTHOR_DATE: DATE, GIT_COMMITTER_DATE: DATE }
}

function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skittership-golden-'))
  const git = (...args) =>
    execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: 'pipe', env: env() })
  git('init', '-q', '-b', 'main', '.')
  git('config', 'user.email', 't@t')
  git('config', 'user.name', 'T')
  git('config', 'tag.gpgSign', 'false')
  git('config', 'commit.gpgSign', 'false')
  let n = 0
  const commit = (message) => {
    n += 1
    fs.writeFileSync(path.join(dir, `f${n}.txt`), `${n}\n`)
    git('add', '--', `f${n}.txt`)
    git('commit', '-q', '-m', message)
  }
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 't', version: '1.1.0' }))
  git('add', '--', 'package.json')
  git('commit', '-q', '-m', 'chore: init')
  return { dir, git, commit }
}

// v1.0.0 (first release) → hotfix line v1.0.0-hotfix.1 → v1.1.0 → untagged work.
function build() {
  const r = repo()
  const { git, commit } = r
  commit('feat(core): first feature\n\nRelease-Note: You can do the first thing.')
  git('tag', 'v1.0.0')
  git('checkout', '-q', '-b', 'hotfix/x', 'v1.0.0')
  commit('fix(core): urgent fix\n\nRelease-Note: The urgent thing works.')
  git('tag', 'v1.0.0-hotfix.1')
  git('checkout', '-q', 'main')
  commit('feat(api)!: breaking api\n\nRelease-Note!: The API changed shape.')
  commit('chore: tidy')
  git('tag', 'v1.1.0')
  commit('fix(ui): later fix\n\nRelease-Note: The later thing works.')
  return r
}

function today() {
  const iso = new Date().toISOString().slice(0, 10)
  const [y, m, d] = iso.split('-').map(Number)
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return [iso, `${d} ${MONTHS[m - 1]} ${y}`]
}

function normalise(text) {
  let out = text.replace(/skittership-golden-[A-Za-z0-9]+/g, 'REPO')
  for (const date of today()) out = out.split(date).join('<TODAY>')
  return out
}

function run(scriptsDir, dir, script, args) {
  const r = spawnSync('node', [path.join(scriptsDir, script), ...args], {
    cwd: dir,
    encoding: 'utf8',
    env: env(),
  })
  return normalise(`exit ${r.status}\n${r.stdout}${r.stderr}`)
}

function read(dir, file) {
  const p = path.join(dir, file)
  return fs.existsSync(p) ? normalise(fs.readFileSync(p, 'utf8')) : null
}

// The scripts run from a copy inside each fixture, so `require('./lib/…')` and
// the config loader resolve exactly as they do in a consumer's repo.
function scenarios(scriptsDir) {
  const out = {}
  const cases = [
    ['retro', ['--retro']],
    ['untagged', ['1.2.0']],
    ['tagged', ['1.1.0']],
  ]
  for (const [name, args] of cases) {
    const { dir } = build()
    if (name === 'tagged') {
      // HEAD at the tag, so the "already tagged" path is the one reached.
      execFileSync('git', ['checkout', '-q', 'v1.1.0'], { cwd: dir, stdio: 'pipe' })
    }
    out[name] = {
      changelogOut: run(scriptsDir, dir, 'generate-changelog.cjs', args),
      releasesOut: run(scriptsDir, dir, 'generate-releases.cjs', args),
      CHANGELOG: read(dir, 'CHANGELOG.md'),
      RELEASES: read(dir, 'RELEASES.md'),
    }
    fs.rmSync(dir, { recursive: true, force: true })
  }
  return out
}

module.exports = { scenarios }

// `node --test` runs every file under test/, this one included, with no
// arguments — so only print when asked for a scripts dir.
if (require.main === module && process.argv[2]) {
  process.stdout.write(JSON.stringify(scenarios(path.resolve(process.argv[2])), null, 2) + '\n')
}

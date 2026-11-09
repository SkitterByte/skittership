#!/usr/bin/env node
'use strict'

/**
 * Cut a release: plan by default, cut with --yes, push only with --push.
 *
 *   node scripts/release.cjs [<package>] <patch|minor|major|x.y.z> [--yes] [--push]
 *                            [--skip-tests] [--skip-hooks] [--allow-postversion] [--json]
 *   node scripts/release.cjs check-hashes [<ref>]
 *
 * Escalating levels — a bare run changes nothing:
 *   (no flag)  plan   print the ordered steps; touch nothing.
 *   --yes      cut    bump, write notes, test, run the preTag hooks, commit,
 *                     and tag. Never pushes.
 *   --push     push   after --yes: the branch, then each tag in its OWN
 *                     `git push`. GitHub creates no push events when one push
 *                     carries more than three tags, so a CI triggered on tags
 *                     would silently never run.
 *
 * Two modes, chosen by the first argument:
 *   - a package from `skittership.config.json` → `packages` (it needs `dir`):
 *     this script does the release itself, because a workspace package has no
 *     `npm version` of its own. Tag `<tagPrefix><version>`.
 *   - anything else: the root package, through the project's own
 *     `<pm> version`, so its version hook (CHANGELOG, RELEASES, the index
 *     guard) runs exactly as it always has.
 *
 * Project-specific checks are config, not code: `release.preTag` commands run
 * after the tests with RELEASE_PACKAGE, RELEASE_VERSION, RELEASE_TAG and
 * RELEASE_BASE_TAG in their environment, and a non-zero exit stops the
 * release. `release.test` replaces `<pm> test`.
 *
 * `release.recordedHashes` names files that record commit hashes (a docs page's
 * `verified: <sha>`). Right before tagging, a recorded hash that is not in the
 * history being tagged is WARNED about — a rebase rewrites hashes and leaves
 * those records pointing at nothing. It never stops a release.
 *
 * --json prints {package, version, tag, baseTag, commit, pushed} on stdout and
 * everything else — child output included — on stderr. Every refusal is one
 * line on stderr and a non-zero exit. Zero dependencies.
 */

const { execFileSync, spawnSync } = require('node:child_process')
const { readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')

const { loadConfig, resolvePackage } = require('./lib/config.cjs')
const { DEFAULT_SCHEME, globMatcher, nearestAncestorTag } = require('./lib/git-commits.cjs')
const { detectPackageManager } = require('./release-hotfix.cjs')

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/

class Refusal extends Error {}

// --- pure ---------------------------------------------------------------------

function parseArgs(argv, packageNames = []) {
  const opts = {
    package: null,
    bump: null,
    yes: false,
    push: false,
    skipTests: false,
    skipHooks: false,
    allowPostversion: false,
    json: false,
  }
  const positional = []
  for (const arg of argv) {
    if (arg === '--yes') opts.yes = true
    else if (arg === '--push') opts.push = true
    else if (arg === '--skip-tests') opts.skipTests = true
    else if (arg === '--skip-hooks') opts.skipHooks = true
    else if (arg === '--allow-postversion') opts.allowPostversion = true
    else if (arg === '--json') opts.json = true
    else if (arg.startsWith('-')) throw new Refusal(`unknown option ${arg}`)
    else positional.push(arg)
  }
  if (positional.length > 0 && packageNames.includes(positional[0])) opts.package = positional.shift()
  if (positional.length !== 1) {
    throw new Refusal('usage: release.cjs [<package>] <patch|minor|major|x.y.z> [--yes] [--push]')
  }
  opts.bump = positional[0]
  // --push without --yes would push a release that was never cut.
  if (opts.push && !opts.yes) throw new Refusal('--push needs --yes: there is nothing to push until the release is cut')
  return opts
}

/** The next x.y.z. Equal to `current` is allowed (tag a version already set). */
function nextVersion(current, bump) {
  const cur = SEMVER.exec(current)
  if (!cur) throw new Refusal(`current version "${current}" is not x.y.z`)
  const [major, minor, patch] = cur.slice(1).map(Number)
  if (bump === 'patch') return `${major}.${minor}.${patch + 1}`
  if (bump === 'minor') return `${major}.${minor + 1}.0`
  if (bump === 'major') return `${major + 1}.0.0`
  const next = SEMVER.exec(bump)
  if (!next) throw new Refusal(`"${bump}" is not patch, minor, major or x.y.z`)
  const a = next.slice(1).map(Number)
  const b = [major, minor, patch]
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) {
      if (a[i] < b[i]) throw new Refusal(`${bump} is older than the current ${current} — refusing a downgrade`)
      break
    }
  }
  return bump
}

/**
 * The ordered release, as data: what `formatPlan` prints and `execute` runs.
 * Each step has a display `cmd`; runnable steps carry `argv` (no shell) or
 * `shell` (a command string from the project's own config).
 */
function buildPlan(ctx) {
  const { mode, name, version, tag, baseTag, pm, test, hooks, release, skipTests, skipHooks } = ctx
  const steps = []
  const env = {
    RELEASE_PACKAGE: name,
    RELEASE_VERSION: version,
    RELEASE_TAG: tag,
    RELEASE_BASE_TAG: baseTag || '',
  }

  if (!skipTests) steps.push({ kind: 'verify', cmd: test, shell: test, env })
  if (!skipHooks) {
    for (const hook of hooks) steps.push({ kind: 'verify', cmd: hook, shell: hook, env, hook: true })
  }

  if (mode === 'package') {
    const paths = [ctx.manifest, ctx.releasesFile]
    // The bump and the notes come first, so the tests and hooks run against
    // exactly the tree that is about to be committed.
    const write = []
    if (ctx.needsBump) write.push({ kind: 'bump', cmd: `set ${ctx.manifest} version → ${version}` })
    write.push({
      kind: 'run',
      cmd: `node scripts/generate-releases.cjs --package ${name} ${version}`,
      argv: ['node', 'scripts/generate-releases.cjs', '--package', name, version],
    })
    steps.unshift(...write)
    steps.push(
      { kind: 'run', cmd: `git add -- ${paths.join(' ')}`, argv: ['git', 'add', '--', ...paths] },
      {
        kind: 'run',
        cmd: `git commit -m "chore(release): ${tag}" -- ${paths.join(' ')}`,
        argv: ['git', 'commit', '-m', `chore(release): ${tag}`, '--', ...paths],
      },
      ...hashCheckStep(ctx),
      {
        // Annotated: `git push --follow-tags` sends annotated tags only, and a
        // release tag should say who cut it and when.
        kind: 'run',
        cmd: `git tag -a ${tag} -m "${name} ${version}"`,
        argv: ['git', 'tag', '-a', tag, '-m', `${name} ${version}`],
      },
    )
  } else {
    steps.push(...hashCheckStep(ctx))
    steps.push({
      kind: 'run',
      cmd: `${pm} version ${version}`,
      argv: [pm, 'version', version],
      // The project's version hook writes the notes; RELEASE_BASE_TAG is not
      // passed, so it chooses the base exactly as a plain `npm version` would.
      versionCommand: true,
    })
  }

  const pushes = [`git push origin ${ctx.branch || '<branch>'}`, `git push origin ${tag}`]
  const followUp = [...pushes]
  if (release && release.staged) {
    followUp.push(
      `${pm} run approve ${mode === 'package' ? `${name} ` : ''}${version}   # once CI has staged it`,
    )
  }
  return { mode, name, version, tag, baseTag, steps, pushes, followUp }
}

// Only when configured: an unset `recordedHashes` adds no step and no output.
function hashCheckStep(ctx) {
  const sources = (ctx.release && ctx.release.recordedHashes) || []
  return sources.length ? [{ kind: 'check-hashes', cmd: 'check recorded commit hashes are in the history being tagged' }] : []
}

/**
 * Every hash the configured files record, and whether it is in `ref`'s
 * history: `ok`, `missing` (it resolves, and is not an ancestor — warn) or
 * `unknown` (cannot tell).
 *
 * WHAT WOULD FOOL THIS: a shallow clone. A hash older than the clone's depth
 * does not resolve, which is not evidence it was rewritten — so a hash that
 * does not resolve is `unknown`, never `missing`. Only a hash git can see, and
 * can see is not an ancestor, is reported as one.
 */
function checkHashes(dir, sources, ref = 'HEAD') {
  const tracked = (tryGit(dir, 'ls-files') || '').split('\n').filter(Boolean)
  const results = []
  for (const source of sources) {
    const globs = source.files.map(globMatcher)
    const re = new RegExp(source.pattern)
    for (const file of tracked.filter((f) => globs.some((g) => g(f)))) {
      let text
      try {
        text = readFileSync(join(dir, file), 'utf8')
      } catch {
        continue
      }
      text.split('\n').forEach((line, i) => {
        const match = re.exec(line)
        if (!match || !match[1]) return
        const hash = match[1]
        const where = `${file}:${i + 1}`
        if (!/^[0-9a-f]{4,40}$/i.test(hash) || !tryGit(dir, 'rev-parse', '--verify', '--quiet', `${hash}^{commit}`)) {
          results.push({ hash, where, state: 'unknown' })
          return
        }
        const r = spawnSync('git', ['merge-base', '--is-ancestor', hash, ref], { cwd: dir })
        results.push({ hash, where, state: r.status === 0 ? 'ok' : r.status === 1 ? 'missing' : 'unknown' })
      })
    }
  }
  return results
}

function formatHashResults(results, ref) {
  return results
    .filter((r) => r.state !== 'ok')
    .map((r) =>
      r.state === 'missing'
        ? `⚠ ${r.where}: ${r.hash} is not in the history of ${ref} — rewritten by a rebase?`
        : `cannot tell — ${r.where}: ${r.hash} is not in this clone`,
    )
}

function formatPlan(plan, ctx) {
  const lines = [`release: ${plan.name}  ${ctx.current} → ${plan.version}`, `  tag:   ${plan.tag}`]
  lines.push(`  base:  ${plan.baseTag || '(first release — no earlier tag)'}`)
  if (plan.mode === 'package' && !ctx.needsBump) {
    lines.push(`  note:  version already ${plan.version} — tagging it, no bump`)
  }
  if (plan.mode === 'root' && ctx.scripts.postversion && !ctx.allowPostversion) {
    lines.push('  note:  package.json has a postversion script — --yes refuses without --allow-postversion')
  }
  if (ctx.skipTests) lines.push('  note:  --skip-tests — the suite will NOT run before this release is cut')
  if (ctx.skipHooks && ctx.hooks.length) {
    lines.push(`  note:  --skip-hooks — ${ctx.hooks.length} preTag hook(s) will NOT run`)
  }
  lines.push('', '  steps:')
  for (const step of plan.steps) lines.push(`    ${step.cmd}`)
  lines.push('', '  then, yourself (one tag per push — never --tags or --follow-tags):')
  for (const cmd of plan.followUp) lines.push(`    ${cmd}`)
  return lines.join('\n')
}

// --- git and the filesystem ---------------------------------------------------

const git = (dir, ...args) =>
  execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: 'pipe' }).trim()

function tryGit(dir, ...args) {
  try {
    return git(dir, ...args)
  } catch {
    return null
  }
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

/** Replace only the version string, so the file keeps its formatting. */
function writeVersion(file, version) {
  const raw = readFileSync(file, 'utf8')
  const next = raw.replace(/("version"\s*:\s*")[^"]*(")/, `$1${version}$2`)
  if (next === raw) throw new Refusal(`could not set the version in ${file}`)
  writeFileSync(file, next)
}

/** Everything the plan needs, read from the repo. Throws a Refusal. */
function gather(dir, opts) {
  const config = loadConfig(dir)
  const release = config.release || {}
  const pm = detectPackageManager(dir)
  const base = {
    pm,
    release,
    test: release.test || `${pm} test`,
    hooks: release.preTag || [],
    skipTests: opts.skipTests,
    skipHooks: opts.skipHooks,
    allowPostversion: opts.allowPostversion,
    branch: tryGit(dir, 'symbolic-ref', '--quiet', '--short', 'HEAD'),
  }

  if (opts.package) {
    const pkg = resolvePackage(config, opts.package)
    if (!pkg.dir) {
      throw new Refusal(`packages.${opts.package}.dir is not set — it names the package.json to bump`)
    }
    const manifest = `${pkg.dir.replace(/\/+$/, '')}/package.json`
    const json = readJson(join(dir, manifest))
    if (!json || !json.version) throw new Refusal(`${manifest} has no version`)
    const version = nextVersion(json.version, opts.bump)
    return {
      ...base,
      mode: 'package',
      name: opts.package,
      current: json.version,
      version,
      needsBump: version !== json.version,
      tag: pkg.scheme.tagFor(version),
      baseTag: nearestAncestorTag('HEAD', pkg.scheme),
      manifest,
      releasesFile: pkg.releasesFile,
    }
  }

  const json = readJson(join(dir, 'package.json'))
  if (!json || !json.version) {
    const known = Object.keys(config.packages || {})
    throw new Refusal(
      known.length
        ? `the root package.json has no version — name a package: ${known.join(', ')}`
        : 'package.json has no version',
    )
  }
  const version = nextVersion(json.version, opts.bump)
  if (version === json.version) {
    throw new Refusal(`version is already ${version} — ${pm} version cannot re-release it`)
  }
  return {
    ...base,
    mode: 'root',
    name: json.name || 'root',
    current: json.version,
    version,
    needsBump: true,
    tag: DEFAULT_SCHEME.tagFor(version),
    baseTag: nearestAncestorTag('HEAD'),
    scripts: json.scripts || {},
  }
}

// --- running it ---------------------------------------------------------------

function preflight(dir, ctx, opts) {
  if (git(dir, 'status', '--porcelain') !== '') {
    throw new Refusal('the working tree is not clean — commit or stash first')
  }
  if (tryGit(dir, 'rev-parse', '--verify', '--quiet', `refs/tags/${ctx.tag}`)) {
    throw new Refusal(`tag ${ctx.tag} already exists — that release was already cut`)
  }
  if (opts.push && !ctx.branch) throw new Refusal('HEAD is detached — check out the branch to push')
  // A postversion hook runs inside `<pm> version`, and it may push — which
  // would break "never pushes without --push". Whether a given script pushes
  // cannot be told from here, so the unknown case refuses and names the opt-out.
  if (ctx.mode === 'root' && ctx.scripts.postversion && !opts.allowPostversion) {
    throw new Refusal(
      `package.json has a postversion script ("${ctx.scripts.postversion}") that may push — ` +
        'pass --allow-postversion to run it anyway',
    )
  }
}

/** Files written before the commit, and how to put each back. */
function restoreHint(dir, ctx) {
  if (ctx.mode !== 'package') return null
  const tracked = (file) => tryGit(dir, 'ls-files', '--error-unmatch', '--', file) !== null
  const cmds = []
  const checkout = [ctx.manifest, ctx.releasesFile].filter(tracked)
  if (checkout.length) cmds.push(`git checkout -- ${checkout.join(' ')}`)
  if (!tracked(ctx.releasesFile)) cmds.push(`rm ${ctx.releasesFile}`)
  return cmds
}

function execute(dir, plan, ctx, opts, out) {
  const restore = restoreHint(dir, ctx)
  const fail = (what) => {
    const lines = [`${what} — nothing was committed or tagged.`]
    if (restore && restore.length) {
      lines.push('  The bump and notes are written but uncommitted, and the next run refuses on a')
      lines.push('  dirty tree. Put them back, fix the cause, then re-run:')
      for (const cmd of restore) lines.push(`    ${cmd}`)
    }
    return new Refusal(lines.join('\n'))
  }
  // stdout → our stderr under --json, so stdout carries only the result.
  const stdio = ['inherit', opts.json ? 2 : 'inherit', 'inherit']

  for (const step of plan.steps) {
    out(`→ ${step.cmd}`)
    if (step.kind === 'bump') {
      writeVersion(join(dir, ctx.manifest), ctx.version)
      continue
    }
    if (step.kind === 'check-hashes') {
      // Warns, never stops: a stale record is worth fixing, not worth a
      // release that cannot be cut.
      for (const line of formatHashResults(checkHashes(dir, ctx.release.recordedHashes), 'HEAD')) out(`  ${line}`)
      continue
    }
    const result = step.shell
      ? spawnSync(step.shell, { cwd: dir, shell: true, stdio, env: { ...process.env, ...step.env } })
      : spawnSync(step.argv[0], step.argv.slice(1), { cwd: dir, stdio })
    if (result.error) throw fail(`could not run ${step.cmd}: ${result.error.message}`)
    if (result.status !== 0) {
      const label = step.hook ? `preTag hook failed: ${step.cmd}` : `${step.cmd} failed (exit ${result.status})`
      if (step.versionCommand) {
        throw new Refusal(`${label} — check its output above; your version hook may have left changes`)
      }
      throw fail(label)
    }
  }

  const commit = git(dir, 'rev-parse', 'HEAD')
  const tagged = tryGit(dir, 'rev-parse', `${ctx.tag}^{commit}`)
  if (tagged !== commit) {
    throw new Refusal(
      `the release finished, but ${ctx.tag} does not point at HEAD — ` +
        'check the tag-version-prefix and git-tag-version settings',
    )
  }

  let pushed = false
  if (opts.push) {
    // Branch first: the tag push is what starts the publish, and it should find
    // the branch already there. One ref per push, always.
    for (const cmd of plan.pushes) {
      const ref = cmd.split(' ').pop()
      out(`→ ${cmd}`)
      const result = spawnSync('git', ['push', 'origin', ref], { cwd: dir, stdio })
      if (result.status !== 0) {
        throw new Refusal(`${cmd} failed — ${ctx.tag} is cut locally; push by hand`)
      }
    }
    pushed = true
  }
  return { commit, pushed }
}

/** `check-hashes [<ref>]`: the same check on its own. Always exits 0. */
function checkHashesCommand(dir, config, ref = 'HEAD') {
  const sources = (config.release && config.release.recordedHashes) || []
  if (sources.length === 0) {
    console.log('check-hashes: release.recordedHashes is not configured — nothing to check')
    return 0
  }
  if (!tryGit(dir, 'rev-parse', '--verify', '--quiet', `${ref}^{commit}`)) {
    console.log(`cannot tell — ${ref} is not a commit here, so nothing was checked`)
    return 0
  }
  const results = checkHashes(dir, sources, ref)
  const lines = formatHashResults(results, ref)
  for (const line of lines) console.log(line)
  if (lines.length === 0) {
    console.log(`check-hashes: ${results.length} recorded hash(es), all in the history of ${ref}`)
  }
  return 0
}

function main(argv, dir = process.cwd()) {
  let json = argv.includes('--json')
  const out = (line) => (json ? console.error(line) : console.log(line))
  try {
    const config = loadConfig(dir)
    if (argv[0] === 'check-hashes') return checkHashesCommand(dir, config, argv[1])
    const opts = parseArgs(argv, Object.keys(config.packages || {}))
    json = opts.json
    const ctx = gather(dir, opts)
    const plan = buildPlan(ctx)
    const summary = {
      package: ctx.mode === 'package' ? ctx.name : null,
      version: ctx.version,
      tag: ctx.tag,
      baseTag: ctx.baseTag,
    }

    if (!opts.yes) {
      out(formatPlan(plan, ctx))
      out('\n  plan only — nothing changed. Re-run with --yes to cut it.')
      if (json) console.log(JSON.stringify({ ...summary, commit: null, pushed: false }))
      return 0
    }

    preflight(dir, ctx, opts)
    const { commit, pushed } = execute(dir, plan, ctx, opts, out)
    if (json) {
      console.log(JSON.stringify({ ...summary, commit, pushed }))
    } else {
      console.log(`\n✅ Cut ${ctx.tag} (${commit.slice(0, 7)})`)
      if (!pushed) {
        console.log('Next, one tag per push — never --tags or --follow-tags:')
        for (const cmd of plan.followUp) console.log(`  ${cmd}`)
      } else if (ctx.release.staged) {
        console.log(`Pushed. Then: ${plan.followUp[plan.followUp.length - 1]}`)
      }
    }
    return 0
  } catch (error) {
    if (!(error instanceof Refusal)) {
      if (!/^Invalid skittership\.config\.json/.test(error.message)) throw error
    }
    console.error(`✖ release: ${error.message}`)
    return 1
  }
}

if (require.main === module) process.exitCode = main(process.argv.slice(2))

module.exports = { parseArgs, nextVersion, buildPlan, formatPlan, checkHashes, main, Refusal }

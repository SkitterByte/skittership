'use strict'

const fs = require('fs')
const path = require('path')

const { loadConfig, SCHEMA_VERSION } = require('./config.js')
const {
  hashContent,
  managedState,
  manifestKey,
  readManifest,
  recordedHash,
  writeManifest,
} = require('./manifest.js')

// The installing package's OWN version — never the consumer's config, which
// records a schema version and would happily claim whatever it last said.
const PKG_VERSION = require('../package.json').version

const ASSETS = path.join(__dirname, '..', 'assets')

// Shipped generator scripts, copied into the consumer's scripts/ when enabled.
// They ship as .cjs so they stay CommonJS even when the consumer's package.json
// declares "type": "module" (a bare .js there is parsed as ESM and every
// require() in the generators throws — see generate-*.cjs).
const SHARED_LIB = [
  path.join('scripts', 'lib', 'git-commits.cjs'),
  path.join('scripts', 'lib', 'config.cjs'),
]
const CHANGELOG_SCRIPT = path.join('scripts', 'generate-changelog.cjs')
const RELEASES_SCRIPT = path.join('scripts', 'generate-releases.cjs')
// Guards the `npm version` run: npm commits the whole index with no pathspec,
// so anything staged while the generators run would ride along. Installed
// whenever either generator is.
const INDEX_GUARD_SCRIPT = path.join('scripts', 'check-release-index.cjs')

// Pre-1.1 the same generators shipped as .js. On a re-install we overwrite the
// managed .cjs copies but must also delete these stale .js siblings, or the old
// (ESM-incompatible) files linger and the version hook keeps pointing at them.
const LEGACY_SCRIPTS = [
  path.join('scripts', 'generate-changelog.js'),
  path.join('scripts', 'generate-releases.js'),
  path.join('scripts', 'lib', 'git-commits.js'),
  path.join('scripts', 'lib', 'config.js'),
]
const CONFIG_FILE = 'skittership.config.json'
// The name skitterspec used to write when release tooling was bundled there.
// init migrates it (rename) so an existing setup carries over cleanly.
const LEGACY_CONFIG_FILE = 'skitterspec.config.json'

const SKILLS = ['commit']
const RULES = ['commit-messages.md']

const SPEC_MARKER_START = '<!-- skittership:start -->'
const SPEC_MARKER_END = '<!-- skittership:end -->'

const report = {
  created: [],
  updated: [],
  skipped: [],
  removed: [],
  customized: [],
  unknown: [],
  warnings: [],
}

// Hashes recorded during THIS run, keyed by consumer-relative path. Populated
// as each managed file is written rather than by a second pass over the tree
// afterwards: a later pass can only hash what is on disk by then, which may be
// something another process wrote in between.
const manifestFiles = {}

function rel(dir, p) {
  return path.relative(dir, p) || '.'
}

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true })
}

// Returns what happened, so copyAsset can tell the three apart:
//   'created' / 'updated'  — we wrote these bytes
//   'unchanged'            — already byte-identical to ours (we compared)
//   'skipped'              — it exists and we did NOT look at it
// Only the first three are provenance. 'skipped' means we never compared, so
// recording a hash for it would assert something this run did not establish.
// Route a managed file by what we can establish about it, not by force alone.
//
// Returns the state it acted on, so copyAsset knows whether this run may claim
// the file as ours. `--force` overwrites in every row — that is what it is for.
function writeFile(dir, target, content, { force, manifest }) {
  const relPath = rel(dir, target)
  const exists = fs.existsSync(target)
  const onDisk = exists ? fs.readFileSync(target, 'utf8') : null
  const state = managedState({
    exists,
    onDisk,
    content,
    recorded: recordedHash(manifest, manifestKey(relPath)),
  })

  if (state === 'absent') {
    ensureDir(path.dirname(target))
    fs.writeFileSync(target, content)
    report.created.push(relPath)
    return state
  }
  if (state === 'identical') {
    report.skipped.push(relPath)
    return state
  }
  if (state === 'ours' || force) {
    fs.writeFileSync(target, content)
    report.updated.push(relPath)
    return state === 'ours' ? state : `${state}-forced`
  }

  // 'customized' — it differs from what we wrote, so it is the consumer's.
  // 'unknown'    — nothing recorded, so we cannot tell; keeping is the
  //                harmless branch and --force is the way out.
  // Exit stays 0: keeping a file is an expected outcome, not a failure, and a
  // non-zero here would break anyone running update in a scripted setup step.
  if (state === 'customized') report.customized.push(relPath)
  else report.unknown.push(relPath)
  return state
}

function copyAsset(dir, assetRelPath, targetAbs, opts) {
  const content = fs.readFileSync(path.join(ASSETS, assetRelPath), 'utf8')
  const state = writeFile(dir, targetAbs, content, opts)
  const key = manifestKey(rel(dir, targetAbs))

  // Record provenance only where this run established it: files we wrote, and
  // files we compared and found identical to what we ship.
  //
  // A KEPT file (customized/unknown) is different: we did not write it, so we
  // cannot claim its current bytes — but what we last wrote has not changed
  // either. Carry the prior entry forward so the next run can still tell the
  // consumer's edit from our old copy. Dropping it would downgrade every
  // customized file to 'unknown' on the following update, losing the very
  // distinction this feature exists to make.
  if (state === 'customized' || state === 'unknown') {
    const prior = recordedHash(opts.manifest, key)
    if (prior) manifestFiles[key] = prior
  } else {
    manifestFiles[key] = hashContent(content)
  }
  return state
}

function installSkills(dir, opts) {
  for (const name of SKILLS) {
    copyAsset(
      dir,
      path.join('skills', name, 'SKILL.md'),
      path.join(dir, '.claude', 'skills', name, 'SKILL.md'),
      opts,
    )
  }
}

function installRule(dir, opts) {
  for (const name of RULES) {
    copyAsset(dir, path.join('rules', name), path.join(dir, '.claude', 'rules', name), opts)
  }
}

function installClaudeMd(dir, { mode }) {
  const section = fs.readFileSync(path.join(ASSETS, 'claude-md-section.md'), 'utf8').trim()
  const block = `${SPEC_MARKER_START}\n${section}\n${SPEC_MARKER_END}\n`
  const target = path.join(dir, 'CLAUDE.md')

  if (!fs.existsSync(target)) {
    fs.writeFileSync(target, `# ${path.basename(dir)}\n\n${block}`)
    report.created.push('CLAUDE.md')
    return
  }

  const existing = fs.readFileSync(target, 'utf8')

  if (existing.includes(SPEC_MARKER_START) && existing.includes(SPEC_MARKER_END)) {
    if (mode !== 'update') {
      report.skipped.push('CLAUDE.md (release tooling already present)')
      return
    }
    const re = new RegExp(`${SPEC_MARKER_START}[\\s\\S]*?${SPEC_MARKER_END}\\n?`)
    const next = existing.replace(re, block)
    if (next === existing) {
      report.skipped.push('CLAUDE.md')
    } else {
      fs.writeFileSync(target, next)
      report.updated.push('CLAUDE.md (release tooling section)')
    }
    return
  }

  const sep = existing.endsWith('\n') ? '\n' : '\n\n'
  fs.writeFileSync(target, `${existing}${sep}${block}`)
  report.updated.push('CLAUDE.md (appended release tooling section)')
}

// --- release tooling (changelog / release notes) ---------------------------

// Rename a legacy skitterspec.config.json → skittership.config.json so an
// existing release setup carries its values over. No-op when the new file
// already exists or no legacy file is present. Idempotent; safe to call from
// both the CLI (before loadConfig) and init() (for direct callers).
function migrateLegacyConfig(dir) {
  const target = path.join(dir, CONFIG_FILE)
  const legacy = path.join(dir, LEGACY_CONFIG_FILE)
  if (fs.existsSync(target)) return { migrated: false }
  if (!fs.existsSync(legacy)) return { migrated: false }
  fs.renameSync(legacy, target)
  return { migrated: true, from: LEGACY_CONFIG_FILE, to: CONFIG_FILE }
}

// Build a release-config object from a loaded skittership.config.json.
function releaseFromConfig(cfg) {
  return {
    changelog: { enabled: cfg.changelog.enabled, file: cfg.changelog.file },
    releases: {
      enabled: cfg.releases.enabled,
      file: cfg.releases.file,
      productName: cfg.releases.productName,
      scopeAreas: cfg.releases.scopeAreas,
    },
    versionHook: cfg.versionHook,
  }
}

function serializeConfig(release) {
  return (
    JSON.stringify(
      {
        version: SCHEMA_VERSION,
        changelog: release.changelog,
        releases: release.releases,
        versionHook: release.versionHook,
      },
      null,
      2,
    ) + '\n'
  )
}

// Write the resolved config. The release object already folds in any existing
// file (the CLI seeds it from loadConfig), so this is a merge, not a clobber —
// safe to persist without --force. Unchanged content is left alone.
function writeConfig(dir, release) {
  const target = path.join(dir, CONFIG_FILE)
  const content = serializeConfig(release)
  const exists = fs.existsSync(target)
  if (exists && fs.readFileSync(target, 'utf8') === content) {
    report.skipped.push(CONFIG_FILE)
    return
  }
  fs.writeFileSync(target, content)
  report[exists ? 'updated' : 'created'].push(CONFIG_FILE)
}

// The generator scripts are skittership-managed, not user-authored: always
// refresh them to the shipped content (writeFile no-ops when identical) rather
// than skip-if-exists. Skipping left stale copies behind on migrated projects —
// e.g. an old lib/config.js still resolving skitterspec.config.json — and would
// strand pre-1.1 .js copies next to the new .cjs ones. `force: true` here is
// safe because these files carry no user edits worth preserving.
function installScripts(dir, release, opts) {
  if (!release.changelog.enabled && !release.releases.enabled) return
  removeLegacyScripts(dir)
  // These used to be written with a hardcoded force: true, justified as "these
  // files carry no user edits worth preserving" — which nothing could actually
  // establish. Now they go through the same classification as every other
  // managed file, so a consumer who extended a generator keeps their work.
  const managed = opts
  for (const lib of SHARED_LIB) {
    copyAsset(dir, lib, path.join(dir, lib), managed)
  }
  if (release.changelog.enabled) {
    copyAsset(dir, CHANGELOG_SCRIPT, path.join(dir, CHANGELOG_SCRIPT), managed)
  }
  if (release.releases.enabled) {
    copyAsset(dir, RELEASES_SCRIPT, path.join(dir, RELEASES_SCRIPT), managed)
  }
  copyAsset(dir, INDEX_GUARD_SCRIPT, path.join(dir, INDEX_GUARD_SCRIPT), managed)
}

// Delete pre-1.1 .js generator copies superseded by the .cjs ones.
function removeLegacyScripts(dir) {
  for (const legacy of LEGACY_SCRIPTS) {
    const abs = path.join(dir, legacy)
    if (fs.existsSync(abs)) {
      fs.rmSync(abs)
      report.removed.push(rel(dir, abs))
    }
  }
}

// Idempotently add the npm scripts that drive generation at `npm version`.
// Never overwrites a user's custom `version` script without --force.
/** An npm script's `&&` steps, trimmed. */
function splitSteps(script) {
  return String(script)
    .split('&&')
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * Decide what to do with an existing `version` script, as a set of steps rather
 * than one string.
 *
 * The old code composed the canonical command and assigned it whole, so any
 * step a consumer had added — a `prettier --write` between generating and
 * staging, say — vanished on upgrade and surfaced at the next release when a
 * formatting gate failed on generated files. Comparing step sets lets us add
 * what is missing and leave the rest alone.
 *
 *   'write'  — nothing there (or --force): take the canonical command
 *   'skip'   — every canonical step present, in a workable order: touch nothing
 *   'append' — only the guard is missing: add it as the LAST step
 *   'warn'   — anything else: print what they would need, change nothing
 *
 * The guard must be last because it inspects the index immediately before npm
 * commits; a step running after it can stage the very thing it was checking
 * for. That is also why a guard found out of position is a 'warn' and not a
 * silent reorder — a release hook is a critical path, and a surprise edit there
 * is worse than a stale one.
 */
function planVersionHook(existing, canonicalSteps) {
  const canonical = canonicalSteps.join(' && ')
  if (!existing) return { action: 'write', script: canonical }

  const steps = splitSteps(existing)
  const guard = canonicalSteps[canonicalSteps.length - 1]
  const missing = canonicalSteps.filter((step) => !steps.includes(step))

  if (missing.length === 0) {
    const guardLast = steps[steps.length - 1] === guard
    const addIdx = steps.findIndex((s) => s.startsWith('git add'))
    const generatorsFirst = canonicalSteps
      .filter((s) => s.startsWith('node scripts/generate-'))
      .every((s) => steps.indexOf(s) < addIdx)
    if (guardLast && generatorsFirst) return { action: 'skip' }
    return { action: 'warn', reason: 'order', canonical }
  }

  if (missing.length === 1 && missing[0] === guard) {
    return { action: 'append', script: [...steps, guard].join(' && ') }
  }

  // A consumer may have dropped a generator deliberately. Reinstating it would
  // start writing a file they chose not to generate.
  return { action: 'warn', reason: 'missing', missing, canonical }
}

function wireVersionHook(dir, release, { force }) {
  const pkgPath = path.join(dir, 'package.json')
  if (!fs.existsSync(pkgPath)) {
    report.skipped.push('version hook (no package.json)')
    return
  }

  let pkg
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
  } catch {
    report.warnings.push('package.json is not valid JSON — skipped version hook wiring')
    return
  }

  const genCmds = []
  const addFiles = []
  if (release.changelog.enabled) {
    genCmds.push('node scripts/generate-changelog.cjs')
    addFiles.push(release.changelog.file)
  }
  if (release.releases.enabled) {
    genCmds.push('node scripts/generate-releases.cjs')
    addFiles.push(release.releases.file)
  }
  if (genCmds.length === 0) return

  // Stage the generated files by name, then refuse to reach npm's commit if
  // anything else got staged while the generators ran (see the guard script).
  const canonicalSteps = [
    ...genCmds,
    `git add ${addFiles.join(' ')}`,
    'node scripts/check-release-index.cjs',
  ]
  const versionCmd = canonicalSteps.join(' && ')

  const before = JSON.stringify(pkg)
  pkg.scripts = pkg.scripts || {}

  const plan = force
    ? { action: 'write', script: versionCmd }
    : planVersionHook(pkg.scripts.version, canonicalSteps)

  if (plan.action === 'write') {
    pkg.scripts.version = plan.script
  } else if (plan.action === 'append') {
    pkg.scripts.version = plan.script
    report.updated.push('package.json (added the release guard to your "version" script)')
  } else if (plan.action === 'skip') {
    report.skipped.push('version hook (already complete)')
  } else if (plan.reason === 'order') {
    report.warnings.push(
      'Kept your "version" npm script: its steps are all present but out of order.\n' +
        '      The guard must run last — a step after it can stage the very thing\n' +
        '      it checks for. Canonical order:\n' +
        `      "version": "${plan.canonical}"  (or re-run with --force)`,
    )
  } else {
    report.warnings.push(
      `Kept your "version" npm script: it is missing ${plan.missing.length} step(s).\n` +
        plan.missing.map((s) => `        ${s}`).join('\n') +
        '\n      Not added automatically — you may have removed them on purpose.\n' +
        `      Canonical: "${plan.canonical}"  (or re-run with --force)`,
    )
  }

  const helpers = {}
  if (release.changelog.enabled) {
    helpers.changelog = 'node scripts/generate-changelog.cjs'
    helpers['changelog:retro'] = 'node scripts/generate-changelog.cjs --retro'
  }
  if (release.releases.enabled) {
    helpers.releases = 'node scripts/generate-releases.cjs'
    helpers['releases:retro'] = 'node scripts/generate-releases.cjs --retro'
  }
  for (const [name, cmd] of Object.entries(helpers)) {
    if (pkg.scripts[name] && pkg.scripts[name] !== cmd && !force) continue
    pkg.scripts[name] = cmd
  }

  if (JSON.stringify(pkg) !== before) {
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
    report.updated.push('package.json (version hook + scripts)')
  } else {
    report.skipped.push('package.json (version hook already present)')
  }
}

function printReport(dir, mode, migration, versions) {
  const line = (label, items) => {
    if (!items.length) return
    process.stdout.write(`\n${label}:\n`)
    for (const it of items) process.stdout.write(`  ${it}\n`)
  }
  // Name the transition when we know it. A consumer upgrading from before
  // provenance shipped has no prior version to show — say the new one plainly
  // rather than inventing a "from".
  const from = versions && versions.from
  const stamp = from && from !== PKG_VERSION ? `${from} → ${PKG_VERSION}` : PKG_VERSION
  process.stdout.write(`\nskittership ${mode} ${stamp} → ${dir}\n`)
  if (migration && migration.migrated) {
    process.stdout.write(`\nmigrated: ${migration.from} → ${migration.to}\n`)
  }
  line('created', report.created)
  line('updated', report.updated)
  line('removed', report.removed)
  line('unchanged', report.skipped)
  // The remedy goes on the heading, not in a footnote: someone scanning this
  // output needs to know in one line why their file was left alone and how to
  // take the new version anyway.
  line('customized — kept (re-run with --force to overwrite)', report.customized)
  line('not recorded — kept (no manifest entry; --force to overwrite)', report.unknown)
  if (report.warnings.length) {
    process.stdout.write('\nwarnings:\n')
    for (const w of report.warnings) process.stdout.write(`  ! ${w}\n`)
  }
  process.stdout.write(
    '\nDone. The /commit skill and commit-message rule are installed; the' +
      ' changelog / release-notes generators run at `npm version` (when the hook' +
      ' is wired) or via `npm run changelog` / `npm run releases`.\n' +
      'Next: tailor .claude/rules/commit-messages.md (scope→area map, product' +
      ' name) to this project, then commit with /commit.\n',
  )
}

async function init({ dir, force, claudeMd, mode, release }) {
  if (!fs.existsSync(dir)) throw new Error(`target dir does not exist: ${dir}`)
  report.created.length = 0
  report.updated.length = 0
  report.skipped.length = 0
  report.removed.length = 0
  report.customized.length = 0
  report.unknown.length = 0
  report.warnings.length = 0
  for (const key of Object.keys(manifestFiles)) delete manifestFiles[key]

  // Read BEFORE anything is written: once the run starts replacing files the
  // prior manifest is gone, and with it the only record of where we came from.
  const priorManifest = readManifest(dir)

  // Migrate a legacy config first so both direct callers and the CLI resolve
  // release settings from the carried-over file (idempotent — CLI runs it too).
  // Runs in `update` too, so `update --force` on a skitterspec-era repo carries
  // its config over instead of resetting the loader to defaults.
  const migration = migrateLegacyConfig(dir)

  // Every managed write is classified against the manifest read above.
  const opts = { force, manifest: priorManifest }

  installSkills(dir, opts)
  installRule(dir, opts)
  if (claudeMd) installClaudeMd(dir, { mode })

  // Release tooling. The CLI resolves `release` from flags/prompts; when called
  // directly (e.g. tests, update) fall back to the on-disk/default config.
  const rel = release || releaseFromConfig(loadConfig(dir))
  if (mode !== 'update') writeConfig(dir, rel)
  installScripts(dir, rel, opts)
  // Wire in both modes: `update --force` must rewrite the npm command strings so
  // they point at the refreshed .cjs generators (a pre-1.1 project's hook still
  // names the now-deleted .js files). In `init` this keeps a custom `version`
  // script unless --force; `update` always passes force.
  if (rel.versionHook) wireVersionHook(dir, rel, { force })

  // Stamp provenance last, so it describes a completed run rather than a
  // partial one that threw halfway through.
  writeManifest(dir, { installedVersion: PKG_VERSION, files: { ...manifestFiles } })

  printReport(dir, mode, migration, {
    from: priorManifest && priorManifest.installedVersion,
  })
}

module.exports = {
  init,
  PKG_VERSION,
  planVersionHook,
  splitSteps,
  SKILLS,
  RULES,
  releaseFromConfig,
  migrateLegacyConfig,
  CONFIG_FILE,
  LEGACY_CONFIG_FILE,
}

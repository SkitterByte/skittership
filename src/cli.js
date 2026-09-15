'use strict'

const fs = require('fs')
const path = require('path')
const { init, migrateLegacyConfig } = require('./init.js')
const { loadConfig } = require('./config.js')

const pkg = require('../package.json')

const HELP = `skittership — changelog + release-notes tooling for Claude Code

Usage:
  skittership init [dir]      Install the /commit skill, commit-message rule, and
                              changelog/release-note generators into a project
  skittership update [dir]    Re-sync the skill + rule + scripts, keeping any
                              you have edited; leaves skittership.config.json
                              alone
  skittership --help          Show this help
  skittership --version       Print version

Options (init / update):
  --force                  Overwrite managed files even when they were edited
                           locally (without it, update keeps yours and says so)
  --dir <path>             Target project dir (default: positional arg or cwd)
  --no-claude-md           Skip creating/patching CLAUDE.md
  --yes, -y                Accept defaults; skip the interactive setup prompts

Release-tooling options (init) — drive setup non-interactively:
  --changelog / --no-changelog        Enable/disable CHANGELOG generation
  --releases  / --no-releases         Enable/disable user-facing release notes
  --changelog-file=NAME               Changelog filename (default CHANGELOG.md)
  --releases-file=NAME                Release-notes filename (default RELEASES.md)
  --product-name=NAME                 Product name shown in the release-notes header
  --version-hook / --no-version-hook  Wire (or skip) the npm "version" hook

Examples:
  npx @skitterbyte/skittership init
  npx @skitterbyte/skittership init ./my-app --yes
  npx @skitterbyte/skittership init --no-releases --changelog-file=HISTORY.md
  npx @skitterbyte/skittership update --force
`

function parse(argv) {
  const opts = {
    force: false,
    claudeMd: true,
    dir: null,
    yes: false,
    changelog: undefined,
    releases: undefined,
    changelogFile: undefined,
    releasesFile: undefined,
    productName: undefined,
    versionHook: undefined,
  }
  const positional = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--force') opts.force = true
    else if (a === '--no-claude-md') opts.claudeMd = false
    else if (a === '--yes' || a === '-y') opts.yes = true
    else if (a === '--changelog') opts.changelog = true
    else if (a === '--no-changelog') opts.changelog = false
    else if (a === '--releases') opts.releases = true
    else if (a === '--no-releases') opts.releases = false
    else if (a === '--version-hook') opts.versionHook = true
    else if (a === '--no-version-hook') opts.versionHook = false
    else if (a.startsWith('--changelog-file=')) opts.changelogFile = a.slice('--changelog-file='.length)
    else if (a.startsWith('--releases-file=')) opts.releasesFile = a.slice('--releases-file='.length)
    else if (a.startsWith('--product-name=')) opts.productName = a.slice('--product-name='.length)
    else if (a === '--dir') opts.dir = argv[++i]
    else if (a.startsWith('--')) throw new Error(`unknown option: ${a}`)
    else positional.push(a)
  }
  return { opts, positional }
}

// Resolve the release config: flags win, else the existing/default config.
// `existing` is a loaded skittership.config.json (loadConfig merges defaults).
function resolveRelease(existing, opts) {
  const pick = (flag, fallback) => (flag === undefined ? fallback : flag)
  return {
    changelog: {
      enabled: pick(opts.changelog, existing.changelog.enabled),
      file: opts.changelogFile || existing.changelog.file,
    },
    releases: {
      enabled: pick(opts.releases, existing.releases.enabled),
      file: opts.releasesFile || existing.releases.file,
      productName: opts.productName || existing.releases.productName,
      scopeAreas: existing.releases.scopeAreas,
    },
    versionHook: pick(opts.versionHook, existing.versionHook),
  }
}

async function run(argv) {
  if (argv.includes('--help') || argv.includes('-h') || argv.length === 0) {
    process.stdout.write(HELP)
    return
  }
  if (argv.includes('--version') || argv.includes('-v')) {
    process.stdout.write(`${pkg.version}\n`)
    return
  }

  const [cmd, ...rest] = argv
  const { opts, positional } = parse(rest)
  const dir = path.resolve(opts.dir || positional[0] || process.cwd())

  switch (cmd) {
    case 'init': {
      // Migrate a legacy skitterspec.config.json before reading, so the resolved
      // release settings carry over from an existing (skitterspec-era) setup.
      migrateLegacyConfig(dir)
      const existing = loadConfig(dir)
      let release = resolveRelease(existing, opts)

      const interactive = Boolean(process.stdin.isTTY) && !opts.yes
      if (interactive) {
        const { promptSetup } = require('./prompts.js')
        const pkgExists = fs.existsSync(path.join(dir, 'package.json'))
        const result = await promptSetup({ seed: release, pkgExists })
        release = result.release
      }

      await init({ dir, force: opts.force, claudeMd: opts.claudeMd, mode: 'init', release })
      break
    }
    case 'update': {
      // Resolve the release config here too. Omitting it meant flags like
      // --no-version-hook were parsed and then silently discarded: init fell
      // back to the config and wired the hook anyway, with force: true. A
      // documented command doing the opposite of what it was asked is worse
      // than one that refuses.
      const release = resolveRelease(loadConfig(dir), opts)
      // `update` no longer implies force. It classifies each managed file
      // against the manifest and keeps anything it cannot prove is its own —
      // so `update` and `update --force` now genuinely differ, which is what
      // the help text has always claimed.
      await init({ dir, force: opts.force, claudeMd: opts.claudeMd, mode: 'update', release })
      break
    }
    default:
      throw new Error(`unknown command: ${cmd} (try --help)`)
  }
}

module.exports = { run, parse, resolveRelease }

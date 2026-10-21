'use strict'

/**
 * Config loader for the release-artifact generators.
 *
 * Reads `skittership.config.json` from the repo root and normalises it over
 * documented defaults. Shipped alongside the generators (copied into the
 * consumer's `scripts/lib/`) so the consumer's scripts never depend back into
 * the skittership package. Zero-dependency.
 *
 * Shape:
 *   {
 *     "version": 1,
 *     "changelog": { "enabled": true, "file": "CHANGELOG.md" },
 *     "releases":  { "enabled": true, "file": "RELEASES.md",
 *                    "productName": "<repo name>", "scopeAreas": {},
 *                    "emptyRelease": true },
 *     "versionHook": true,
 *     "hotfix":    { "branchPrefix": "hotfix/" }
 *   }
 *
 * `releases.emptyRelease` is what a release with no user-facing notes says in
 * RELEASES.md: `true` (or absent) for the built-in text, a string for your own,
 * `false` to write no section at all. Normalised here to the text, or `null`
 * when disabled.
 *
 * `hotfix.branchPrefix` is the branch prefix `release-hotfix.cjs` requires
 * before it will cut a `-hotfix.N` version.
 */

const { readFileSync } = require('node:fs')
const { basename, join } = require('node:path')

const SCHEMA_VERSION = 1
const CONFIG_FILE = 'skittership.config.json'
const DEFAULT_EMPTY_RELEASE = 'No user-facing changes in this release.'

// Static template (productName is derived from the repo dir when blank).
const DEFAULT_CONFIG = Object.freeze({
  version: SCHEMA_VERSION,
  changelog: Object.freeze({ enabled: true, file: 'CHANGELOG.md' }),
  releases: Object.freeze({
    enabled: true,
    file: 'RELEASES.md',
    productName: '',
    scopeAreas: Object.freeze({}),
    emptyRelease: DEFAULT_EMPTY_RELEASE,
  }),
  versionHook: true,
  hotfix: Object.freeze({ branchPrefix: 'hotfix/' }),
})

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function defaultsFor(dir) {
  return {
    version: SCHEMA_VERSION,
    changelog: { enabled: true, file: 'CHANGELOG.md' },
    releases: {
      enabled: true,
      file: 'RELEASES.md',
      productName: basename(dir),
      scopeAreas: {},
      emptyRelease: DEFAULT_EMPTY_RELEASE,
    },
    versionHook: true,
    hotfix: { branchPrefix: 'hotfix/' },
  }
}

/**
 * Merge a parsed config over the defaults. Only known keys are copied (unknown
 * keys are ignored for forward-compat); `scopeAreas` is replaced wholesale, not
 * deep-merged, since it's a complete map.
 */
function mergeConfig(base, parsed) {
  if (!isObject(parsed)) return base

  if (typeof parsed.version === 'number') base.version = parsed.version
  if (typeof parsed.versionHook === 'boolean') base.versionHook = parsed.versionHook

  if (isObject(parsed.changelog)) {
    if (typeof parsed.changelog.enabled === 'boolean') {
      base.changelog.enabled = parsed.changelog.enabled
    }
    if (typeof parsed.changelog.file === 'string' && parsed.changelog.file.trim()) {
      base.changelog.file = parsed.changelog.file.trim()
    }
  }

  if (isObject(parsed.releases)) {
    if (typeof parsed.releases.enabled === 'boolean') {
      base.releases.enabled = parsed.releases.enabled
    }
    if (typeof parsed.releases.file === 'string' && parsed.releases.file.trim()) {
      base.releases.file = parsed.releases.file.trim()
    }
    if (typeof parsed.releases.productName === 'string' && parsed.releases.productName.trim()) {
      base.releases.productName = parsed.releases.productName.trim()
    }
    if (isObject(parsed.releases.scopeAreas)) {
      base.releases.scopeAreas = { ...parsed.releases.scopeAreas }
    }
    // Only an explicit `false` turns the placeholder off. Anything else that is
    // not usable text keeps the default, so a typo cannot silently bring back
    // the gap in RELEASES.md this key exists to close.
    const empty = parsed.releases.emptyRelease
    if (empty === false) {
      base.releases.emptyRelease = null
    } else if (typeof empty === 'string' && empty.trim()) {
      base.releases.emptyRelease = empty.trim()
    }
  }

  if (isObject(parsed.hotfix)) {
    if (typeof parsed.hotfix.branchPrefix === 'string' && parsed.hotfix.branchPrefix.trim()) {
      base.hotfix.branchPrefix = parsed.hotfix.branchPrefix.trim()
    }
  }

  return base
}

/**
 * Load and normalise config from `dir` (default cwd). Missing file → all
 * defaults. Malformed JSON → throws a clear Error (callers exit non-zero).
 */
function loadConfig(dir = process.cwd()) {
  const base = defaultsFor(dir)
  const file = join(dir, CONFIG_FILE)

  let raw
  try {
    raw = readFileSync(file, 'utf-8')
  } catch (error) {
    if (error.code === 'ENOENT') return base
    throw error
  }

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new Error(`Invalid ${CONFIG_FILE}: ${error.message}`)
  }

  return mergeConfig(base, parsed)
}

module.exports = {
  loadConfig,
  DEFAULT_CONFIG,
  DEFAULT_EMPTY_RELEASE,
  SCHEMA_VERSION,
  CONFIG_FILE,
}

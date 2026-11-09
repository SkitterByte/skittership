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
 *     "hotfix":    { "branchPrefix": "hotfix/" },
 *     "packages":  { "<name>": { "tagPrefix": "<name>@", "paths": ["packages/x/**"],
 *                                "releasesFile": "RELEASES-<name>.md",
 *                                "productName": "<name>", "dir": "packages/x",
 *                                "npm": "@scope/x" } },
 *     "release":   { "staged": true, "test": "pnpm test", "preTag": ["<command>"] }
 *   }
 *
 * `releases.emptyRelease` is what a release with no user-facing notes says in
 * RELEASES.md: `true` (or absent) for the built-in text, a string for your own,
 * `false` to write no section at all. Normalised here to the text, or `null`
 * when disabled.
 *
 * `hotfix.branchPrefix` is the branch prefix `release-hotfix.cjs` requires
 * before it will cut a `-hotfix.N` version.
 *
 * `packages` is opt-in: one entry per separately-tagged package in a monorepo,
 * read only when a generator is run with `--package <name>`. Every field is
 * optional. It is validated here but kept exactly as written (`null` when
 * absent), so `init`/`update` write it back unchanged; `resolvePackage` fills
 * in the defaults at the point of use.
 *
 * `release` is opt-in too, and kept as written: its presence installs the
 * release scripts, and `release.staged` the npm staged-publish approver.
 */

const { readFileSync } = require('node:fs')
const { basename, join } = require('node:path')

const { tagScheme } = require('./git-commits.cjs')

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
    packages: null,
    release: null,
  }
}

// A package name ends up in a default tag prefix and a default filename, so it
// is held to the same character set as a prefix.
const PACKAGE_NAME = /^[A-Za-z0-9._-]+$/
const PACKAGE_STRING_FIELDS = ['tagPrefix', 'releasesFile', 'productName', 'dir', 'npm']

function packagesError(message) {
  return new Error(`Invalid ${CONFIG_FILE}: packages${message}`)
}

/**
 * Check `packages` and return it as written. Throws on anything malformed:
 * unlike the other keys, a package typo silently ignored would release the
 * wrong commits under the right name.
 */
function validatePackages(packages) {
  if (!isObject(packages)) throw packagesError(' must be an object of package entries')
  for (const [name, entry] of Object.entries(packages)) {
    if (!PACKAGE_NAME.test(name)) {
      throw packagesError(`: "${name}" is not a usable package name (letters, digits, . _ -)`)
    }
    if (!isObject(entry)) throw packagesError(`.${name} must be an object`)
    for (const field of PACKAGE_STRING_FIELDS) {
      const value = entry[field]
      if (value !== undefined && (typeof value !== 'string' || !value.trim())) {
        throw packagesError(`.${name}.${field} must be a non-empty string`)
      }
    }
    if (entry.tagPrefix !== undefined) {
      try {
        tagScheme(entry.tagPrefix)
      } catch (error) {
        throw packagesError(`.${name}.tagPrefix: ${error.message}`)
      }
    }
    if (
      entry.paths !== undefined &&
      (!Array.isArray(entry.paths) ||
        entry.paths.length === 0 ||
        entry.paths.some((p) => typeof p !== 'string' || !p.trim()))
    ) {
      throw packagesError(`.${name}.paths must be a non-empty array of path globs`)
    }
  }
  return packages
}

/**
 * One package's settings with the defaults filled in, or null when `name` is
 * not configured.
 */
function resolvePackage(config, name) {
  const entry = config.packages && Object.hasOwn(config.packages, name) ? config.packages[name] : null
  if (!entry) return null
  const tagPrefix = entry.tagPrefix || `${name}@`
  return {
    name,
    tagPrefix,
    scheme: tagScheme(tagPrefix),
    paths: entry.paths || null,
    releasesFile: entry.releasesFile || `RELEASES-${name}.md`,
    productName: entry.productName || name,
    dir: entry.dir || null,
    npm: entry.npm || null,
  }
}

function releaseError(message) {
  return new Error(`Invalid ${CONFIG_FILE}: release${message}`)
}

/**
 * Check `release` and return it as written, like `packages`. Its presence is
 * the opt-in to the release scripts, so a malformed value refuses rather than
 * being read as absent.
 */
function validateRelease(release) {
  if (!isObject(release)) throw releaseError(' must be an object')
  if (release.staged !== undefined && typeof release.staged !== 'boolean') {
    throw releaseError('.staged must be true or false')
  }
  if (release.test !== undefined && (typeof release.test !== 'string' || !release.test.trim())) {
    throw releaseError('.test must be a non-empty command string')
  }
  if (
    release.preTag !== undefined &&
    (!Array.isArray(release.preTag) || release.preTag.some((c) => typeof c !== 'string' || !c.trim()))
  ) {
    throw releaseError('.preTag must be an array of command strings')
  }
  return release
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

  // `null` reads as absent, like leaving the key out.
  if (parsed.packages != null) base.packages = validatePackages(parsed.packages)
  if (parsed.release != null) base.release = validateRelease(parsed.release)

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
  resolvePackage,
  DEFAULT_CONFIG,
  DEFAULT_EMPTY_RELEASE,
  SCHEMA_VERSION,
  CONFIG_FILE,
}

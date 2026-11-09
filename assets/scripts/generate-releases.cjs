#!/usr/bin/env node
'use strict'

/**
 * Generate user-facing release notes from `Release-Note:` commit footers.
 * Sibling to generate-changelog.cjs (which builds the dev-facing CHANGELOG from
 * commit subjects). Both walk the same tag ranges via lib/git-commits.cjs.
 *
 * Opt-in: ONLY commits carrying a `Release-Note:` footer appear here. The dev
 * subject stays terse; the footer carries the user-facing sentence. A release
 * with no notes still gets its heading and a one-line placeholder
 * (`releases.emptyRelease`), so the newest section is always the version that
 * shipped rather than the last one that happened to have user-facing changes.
 *
 *   feat(tasks): explicit state/created dates + sort-by
 *
 *   - Add stateEnteredAt column, sortBy param
 *
 *   Release-Note: You can now sort your task inbox by when an item entered its
 *     current state or when it was created, with both dates shown on every row.
 *
 * Footer grammar:
 *   Release-Note: <text>        user-facing note (multi-line via continuation)
 *   Release-Note!: <text>       same, but also promoted into the Highlights line
 *   Release-Area: <name>        override the scope->area mapping
 *   Release-Note: none          explicit "not user-facing" (skipped)
 *
 * Project-specific values — the scope→area map, the product name in the header,
 * and the output filename — are injected (skittership's config loader supplies
 * them in production). Unmapped scopes fall back to Title-Case of the scope.
 */

const { existsSync, readFileSync, writeFileSync } = require('node:fs')
const { basename, join } = require('node:path')

const {
  DEFAULT_SCHEME,
  escapeRegex,
  getAllVersionTags,
  getCommitsBetween,
  getCommitsSinceLastTag,
  getTagDate,
  globMatcher,
  indexOfOlderSection,
  nearestAncestorTag,
  parseCommit,
  parseRange,
  countCommitsSince,
  tagExists,
  VERSION_PATTERN,
} = require('./lib/git-commits.cjs')
const { loadConfig, resolvePackage, DEFAULT_EMPTY_RELEASE } = require('./lib/config.cjs')

// Buckets render in this order within each area.
const BUCKET_ORDER = ['Action required', 'New', 'Improved', 'Fixed']

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const DEFAULT_FILE = 'RELEASES.md'

/** A line that looks like a footer key: `Key: ` (stops note continuation). */
const FOOTER_KEY = /^[A-Za-z][\w-]*:\s/

function defaultProductName() {
  return basename(process.cwd())
}

function defaultReleasesHeader(productName, changelogFile = 'CHANGELOG.md') {
  return `# Release Notes

What's new for users of ${productName}. For the full technical log see
[${changelogFile}](./${changelogFile}).

Generated from \`Release-Note:\` commit footers.
`
}

/** Map a conventional type (+breaking flag) to a user bucket, or null to omit. */
function bucketFor(type, breaking) {
  if (breaking) return 'Action required'
  switch (type) {
    case 'feat':
      return 'New'
    case 'fix':
      return 'Fixed'
    case 'perf':
    case 'refactor':
      return 'Improved'
    default:
      // docs / style / test / chore / build / ci / unknown → never user-facing
      return null
  }
}

function titleCase(value) {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/**
 * Resolve the user-facing area: explicit override wins, else the injected
 * scope→area map, else Title-Case of the scope. Missing scope → 'General'.
 */
function resolveArea(scope, override, scopeAreas = {}) {
  if (override && override.trim()) return override.trim()
  if (!scope) return 'General'
  return scopeAreas[scope.toLowerCase()] ?? titleCase(scope)
}

/**
 * Extract the user-facing note from a parsed commit, or null if the commit has
 * no `Release-Note:` footer, is marked `none`, or is a non-user-facing type.
 */
function parseReleaseNote(commit, scopeAreas = {}) {
  const bucket = bucketFor(commit.type, commit.breaking)
  if (!bucket) return null // omitted type — never user-facing, even with a footer

  const body = commit.body
  if (!body) return null

  const lines = body.split('\n')
  let noteText = null
  let highlight = false
  let areaOverride

  for (let i = 0; i < lines.length; i += 1) {
    const noteMatch = lines[i].match(/^Release-Note(!)?:\s*(.*)$/i)
    if (noteMatch) {
      highlight = Boolean(noteMatch[1])
      const parts = [noteMatch[2]]
      // Gather continuation lines (indented or unindented prose) until a blank
      // line, another footer key, or end of body.
      for (let j = i + 1; j < lines.length; j += 1) {
        const next = lines[j]
        if (next.trim() === '') break
        if (FOOTER_KEY.test(next)) break
        parts.push(next.trim())
      }
      noteText = parts.join(' ').replace(/\s+/g, ' ').trim()
      continue
    }
    const areaMatch = lines[i].match(/^Release-Area:\s*(.+)$/i)
    if (areaMatch) areaOverride = areaMatch[1].trim()
  }

  if (!noteText) return null
  if (/^none$/i.test(noteText)) return null // explicit not-user-facing marker

  return {
    area: resolveArea(commit.scope, areaOverride, scopeAreas),
    bucket,
    text: noteText,
    highlight,
    hash: commit.hash,
  }
}

/** ISO `2026-06-19` → friendly `19 Jun 2026` (parsed without Date to avoid TZ shift). */
function formatReleaseDate(isoDate) {
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return isoDate
  const [, year, month, day] = match
  return `${Number.parseInt(day, 10)} ${MONTHS[Number.parseInt(month, 10) - 1]} ${year}`
}

/**
 * Render one release section: heading, optional Highlights, then areas × buckets.
 * With no notes, the heading and `emptyText` instead.
 */
function renderReleasesSection(version, isoDate, notes, emptyText = DEFAULT_EMPTY_RELEASE) {
  const lines = []
  lines.push(`## ${version} — ${formatReleaseDate(isoDate)}`)
  lines.push('')

  if (notes.length === 0) {
    lines.push(emptyText)
    return lines.join('\n') + '\n'
  }

  const highlights = notes.filter((n) => n.highlight)
  if (highlights.length === 1) {
    lines.push(`**Highlights:** ${highlights[0].text}`)
    lines.push('')
  } else if (highlights.length > 1) {
    lines.push('**Highlights:**')
    highlights.forEach((h) => lines.push(`- ${h.text}`))
    lines.push('')
  }

  const areas = [...new Set(notes.map((n) => n.area))].sort((a, b) => a.localeCompare(b))
  for (const area of areas) {
    lines.push(`### ${area}`)
    const areaNotes = notes.filter((n) => n.area === area)
    for (const bucket of BUCKET_ORDER) {
      areaNotes
        .filter((n) => n.bucket === bucket)
        .forEach((n) => lines.push(`- **${bucket}** — ${n.text}`))
    }
    lines.push('')
  }

  return lines.join('\n').trimEnd() + '\n'
}

/** Idempotently insert/replace a release's section by version (newest on top). */
function upsertReleasesSection(content, newSection, version) {
  const existingRegex = new RegExp(
    `(^|\\n)## ${escapeRegex(version)} [^\\n]*\\n[\\s\\S]*?(?=\\n## \\d|\\n---|$)`,
  )
  const existingMatch = content.match(existingRegex)
  if (existingMatch) {
    const leading = existingMatch[1] ?? ''
    return content.replace(existingRegex, `${leading}${newSection.trimEnd()}\n`)
  }

  // Insert above the first section OLDER than this one, so sections stay in
  // descending version order regardless of the order they are written in.
  // Retro-fill walks oldest-first, so "insert above whatever is currently
  // first" would leave the oldest release on top. The heading must capture a
  // suffixed version whole: `36.4.0-hotfix.1` read as no-match let hotfix.2
  // land below it, above `36.4.0`.
  const headingRe = new RegExp(`\\n## (${VERSION_PATTERN})\\s`)
  const olderIdx = indexOfOlderSection(content, version, headingRe)
  if (olderIdx >= 0) {
    const before = content.slice(0, olderIdx).replace(/\s+$/, '')
    const after = content.slice(olderIdx + 1)
    return `${before}\n\n${newSection}\n${after}`
  }

  return `${content.replace(/\s+$/, '')}\n\n${newSection}`
}

/** Remove a version's section entirely, if present. */
function removeReleasesSection(content, version) {
  const regex = new RegExp(
    `(^|\\n)## ${escapeRegex(version)} [^\\n]*\\n[\\s\\S]*?(?=\\n## \\d|\\n---|$)`,
  )
  if (!regex.test(content)) return { content, removed: false }
  return { content: content.replace(regex, '').replace(/\n{3,}/g, '\n\n'), removed: true }
}

function readReleases(path, header) {
  try {
    return readFileSync(path, 'utf-8')
  } catch {
    return header
  }
}

function getCurrentVersion(dir = '.') {
  const file = join(process.cwd(), dir, 'package.json')
  try {
    const packageJson = JSON.parse(readFileSync(file, 'utf-8'))
    return packageJson.version
  } catch {
    console.error(dir === '.' ? 'Error reading package.json' : `Error reading ${join(dir, 'package.json')}`)
    process.exit(1)
  }
}

/**
 * The options for `--package <name>`: that package's file, product name and
 * tag scheme, plus how its commits are attributed. Exits non-zero, naming the
 * configured packages, when `name` is not one of them.
 */
function packageOptions(config, name) {
  const pkg = resolvePackage(config, name)
  if (!pkg) {
    const known = Object.keys(config.packages || {})
    console.error(
      known.length
        ? `✖ No package "${name}" in skittership.config.json — configured: ${known.join(', ')}`
        : `✖ --package ${name}: skittership.config.json configures no packages`,
    )
    process.exit(1)
  }
  const packages = Object.keys(config.packages).map((n) => resolvePackage(config, n))
  return {
    pkg,
    options: {
      file: pkg.releasesFile,
      productName: pkg.productName,
      scheme: pkg.scheme,
      attribution: attributionFor(pkg, packages),
    },
  }
}

/**
 * Pull `--range <from>..<to>` out of the arguments, so what remains reads as
 * before. Exits non-zero, having written nothing, on a malformed range or one
 * combined with --retro (which pairs tags itself).
 */
function takeRangeArg(args, usage) {
  const idx = args.indexOf('--range')
  if (idx < 0) return { range: null, rest: args }
  const rest = [...args.slice(0, idx), ...args.slice(idx + 2)]
  try {
    if (rest.includes('--retro')) {
      throw new Error('--range and --retro do not combine: --retro pairs each tag with its own base.')
    }
    return { range: parseRange(args[idx + 1]), rest }
  } catch (error) {
    console.error(`\n✖ ${error.message}\n  ${usage}\n`)
    process.exit(1)
  }
}

/** `--package <name>` is pulled out first, so what remains reads as before. */
function takePackageArg(args) {
  const idx = args.indexOf('--package')
  if (idx < 0) return { name: null, rest: args }
  const name = args[idx + 1]
  if (!name || name.startsWith('-')) {
    console.error('Usage: generate-releases.cjs --package <name> [version | --retro [count]]')
    process.exit(1)
  }
  return { name, rest: [...args.slice(0, idx), ...args.slice(idx + 2)] }
}

function notesFor(commitLines, scopeAreas) {
  return commitLines
    .map(parseCommit)
    .filter((c) => c !== null)
    .map((c) => parseReleaseNote(c, scopeAreas))
    .filter((n) => n !== null)
}

/**
 * How a package's commits are told apart from the rest, built from the
 * `packages` config. A commit belongs to every package one of its changed
 * files matches; a package with no `paths` takes every commit. `null` (no
 * `--package`) means no attribution at all — the default walk, untouched.
 */
function attributionFor(pkg, packages) {
  const matcherOf = (entry) => {
    if (!entry.paths) return () => true
    const globs = entry.paths.map(globMatcher)
    return (files) => files.some((f) => globs.some((g) => g(f)))
  }
  const all = packages.map(matcherOf)
  return {
    own: matcherOf(pkg),
    any: (files) => all.some((m) => m(files)),
  }
}

/**
 * Split walked commits into this package's lines and the orphans: commits
 * carrying a real note that no configured package claims.
 *
 * BLIND SPOT: attribution reads CHANGED PATHS. A user-facing commit that only
 * touches files outside every package (docs/, scripts/) is an orphan. That is
 * usually right — such a commit should not carry a footer — and it is why
 * orphans are listed on every run rather than dropped in silence.
 */
function select(walked, attribution) {
  if (!attribution) return { lines: walked, orphans: [] }
  const lines = []
  const orphans = []
  for (const { line, files } of walked) {
    if (attribution.own(files)) lines.push(line)
    else if (!attribution.any(files)) {
      const commit = parseCommit(line)
      if (commit && parseReleaseNote(commit)) orphans.push(line.split('\0')[1])
    }
  }
  return { lines, orphans }
}

function reportOrphans(orphans, label = '') {
  if (orphans.length === 0) return
  console.log(
    `  ${label}${orphans.length} Release-Note footer(s) match no configured package and were not included:`,
  )
  for (const subject of orphans) console.log(`    ${subject}`)
}

function resolveOptions(options = {}) {
  return {
    file: options.file || DEFAULT_FILE,
    productName: options.productName || defaultProductName(),
    scopeAreas: options.scopeAreas || {},
    changelogFile: options.changelogFile || 'CHANGELOG.md',
    // `null` is the explicit off; only an absent option takes the default.
    emptyRelease: options.emptyRelease === undefined ? DEFAULT_EMPTY_RELEASE : options.emptyRelease,
    scheme: options.scheme || DEFAULT_SCHEME,
    attribution: options.attribution || null,
  }
}

function updateReleases(newVersion, options = {}) {
  const orphans = []
  writeRelease(newVersion, options, orphans)
  reportOrphans(orphans)
}

function writeRelease(newVersion, options, orphans) {
  const { file, productName, scopeAreas, changelogFile, emptyRelease, scheme, attribution } =
    resolveOptions(options)
  const releasesPath = join(process.cwd(), file)
  const header = defaultReleasesHeader(productName, changelogFile)
  let content = readReleases(releasesPath, header)

  let range = 'unknown range'
  const walked = getCommitsSinceLastTag(newVersion, {
    onRange: (r) => (range = r),
    scheme,
    withFiles: Boolean(attribution),
    range: options.range || null,
  })
  const selected = select(walked, attribution)
  orphans.push(...selected.orphans)
  const notes = notesFor(selected.lines, scopeAreas)
  if (notes.length === 0 && !emptyRelease) {
    console.log(`No Release-Note footers found since last tag — skipping ${file} update`)
    // Ensure the artifact exists so a version hook's downstream steps have a
    // file to act on even on a release with no user-facing notes.
    if (!existsSync(releasesPath)) writeFileSync(releasesPath, content, 'utf-8')
    return
  }

  // Date the section by its TAG when the version is already tagged, not by
  // today. Re-running a generator over a released version was silently
  // re-stamping a shipped release with the current date. getTagDate falls back
  // to today when the tag does not exist, which is the `npm version` path —
  // the version being released has no tag yet, so that stays unchanged.
  const date = getTagDate(scheme.tagFor(newVersion))
  const section = renderReleasesSection(newVersion, date, notes, emptyRelease)
  const before = content
  content = upsertReleasesSection(content, section, newVersion)

  if (content === before) {
    // Do not claim an update that did not happen — and when the version is
    // already tagged, say how much work is deliberately excluded, so "no diff"
    // cannot read as "nothing pending".
    const tag = scheme.tagFor(newVersion)
    if (tagExists(tag)) {
      const pending = countCommitsSince(tag)
      console.log(`${tag} is already tagged — ${file} unchanged.`)
      if (pending > 0) {
        console.log(
          `${pending} commit(s) since that tag are not included; ` +
            `bump the version to release them.`,
        )
      }
    } else {
      console.log(`${file} already up to date with version ${newVersion} (${range})`)
    }
    return
  }

  writeFileSync(releasesPath, content, 'utf-8')
  if (notes.length === 0) {
    console.log(`✅ Updated ${file} with version ${newVersion} (no user-facing notes, ${range})`)
  } else {
    console.log(`✅ Updated ${file} with version ${newVersion} (${notes.length} note(s), ${range})`)
  }
}

function retroFillReleases(count, options = {}) {
  const { file, productName, scopeAreas, changelogFile, emptyRelease, scheme, attribution } =
    resolveOptions(options)
  const releasesPath = join(process.cwd(), file)
  const header = defaultReleasesHeader(productName, changelogFile)
  let content = readReleases(releasesPath, header)

  const tags = getAllVersionTags(scheme)
  if (tags.length === 0) {
    console.log('No version tags found — nothing to retro-fill')
    return
  }

  // Oldest-first so upsert leaves the newest on top.
  const targets = tags.slice(0, count).reverse()
  let updated = 0

  for (const tag of targets) {
    // The release this one built on — its nearest ancestor tag, not its
    // neighbour by sort, which for a hotfix is a tag on another line.
    const previousTag = nearestAncestorTag(`${tag}^`, scheme)
    const version = scheme.versionOf(tag)
    const selected = select(
      getCommitsBetween(previousTag, tag, { withFiles: Boolean(attribution) }),
      attribution,
    )
    reportOrphans(selected.orphans, `${tag}: `)
    const notes = notesFor(selected.lines, scopeAreas)

    if (notes.length === 0 && !emptyRelease) {
      // No notes for this tag, and placeholders are switched off. Skipping
      // would leave behind any section written by an earlier run whose commit
      // range was wrong (e.g. before the tag existed), so drop it and let the
      // file tell the truth. With placeholders on, the upsert below replaces
      // such a section instead, which tells the same truth.
      const pruned = removeReleasesSection(content, version)
      if (pruned.removed) {
        content = pruned.content
        updated += 1
        console.log(`🧹 ${tag}: no Release-Note footers — removed stale section`)
      } else {
        console.log(`⚠️  ${tag}: no Release-Note footers — skipping`)
      }
      continue
    }

    const section = renderReleasesSection(version, getTagDate(tag), notes, emptyRelease)
    content = upsertReleasesSection(content, section, version)
    updated += 1
    if (notes.length === 0) {
      console.log(`✅ ${tag}: no user-facing notes — wrote placeholder`)
    } else {
      console.log(`✅ ${tag}: wrote ${notes.length} note(s)`)
    }
  }

  if (updated > 0) {
    writeFileSync(releasesPath, content, 'utf-8')
    console.log(`✅ Retro-filled ${updated} release(s) into ${file}`)
  }
}

function main(argv) {
  const { name: packageName, rest: afterPackage } = takePackageArg(argv.slice(2))
  const { range, rest: args } = takeRangeArg(
    afterPackage,
    'Usage: generate-releases.cjs [--package <name>] --range <from>..<to> [version]',
  )

  let config
  try {
    config = loadConfig()
  } catch (error) {
    console.error(error.message)
    process.exit(1)
  }

  if (!config.releases.enabled) {
    console.log('Release-notes generation disabled in skittership.config.json — skipping')
    return
  }

  let options = {
    file: config.releases.file,
    productName: config.releases.productName,
    scopeAreas: config.releases.scopeAreas,
    changelogFile: config.changelog.file,
    emptyRelease: config.releases.emptyRelease,
  }
  if (range) options.range = range
  let versionDir = '.'
  if (packageName) {
    const { pkg, options: overrides } = packageOptions(config, packageName)
    options = { ...options, ...overrides }
    versionDir = pkg.dir
  }
  const retroIdx = args.indexOf('--retro')

  if (retroIdx >= 0) {
    // `--retro` with no count backfills every version tag. The npm helper the
    // installer wires (`releases:retro`) passes no count, so requiring one
    // made that script impossible to run.
    const countArg = args[retroIdx + 1]
    let count = Number.POSITIVE_INFINITY
    if (countArg !== undefined && !countArg.startsWith('-')) {
      count = Number.parseInt(countArg, 10)
      if (!Number.isFinite(count) || count <= 0) {
        console.error('Usage: generate-releases.cjs --retro [count]   (default: all version tags)')
        process.exit(1)
      }
    }
    retroFillReleases(count, options)
  } else {
    try {
      let version = args[0]
      if (!version) {
        if (!versionDir) {
          console.error(
            `✖ --package ${packageName}: pass the version, or set packages.${packageName}.dir ` +
              'so it can be read from that package.json',
          )
          process.exit(1)
        }
        version = getCurrentVersion(versionDir)
      }
      updateReleases(version, options)
    } catch (error) {
      if (error.code !== 'NO_BASE_TAG' && error.code !== 'BAD_RANGE') throw error
      console.error(`\n✖ ${error.message}\n`)
      process.exit(1)
    }
  }
}

module.exports = {
  bucketFor,
  resolveArea,
  parseReleaseNote,
  formatReleaseDate,
  renderReleasesSection,
  upsertReleasesSection,
  defaultReleasesHeader,
  updateReleases,
  retroFillReleases,
  removeReleasesSection,
  BUCKET_ORDER,
}

// Run the CLI only when invoked directly (keeps pure functions importable).
if (require.main === module) {
  main(process.argv)
}

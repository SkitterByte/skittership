#!/usr/bin/env node
'use strict'

/**
 * Generate user-facing release notes from `Release-Note:` commit footers.
 * Sibling to generate-changelog.cjs (which builds the dev-facing CHANGELOG from
 * commit subjects). Both walk the same tag ranges via lib/git-commits.cjs.
 *
 * Opt-in: ONLY commits carrying a `Release-Note:` footer appear here. The dev
 * subject stays terse; the footer carries the user-facing sentence.
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
  escapeRegex,
  getAllVersionTags,
  getCommitsBetween,
  getCommitsSinceLastTag,
  getTagDate,
  parseCommit,
} = require('./lib/git-commits.cjs')
const { loadConfig } = require('./lib/config.cjs')

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

/** Render one release section: heading, optional Highlights, then areas × buckets. */
function renderReleasesSection(version, isoDate, notes) {
  const lines = []
  lines.push(`## ${version} — ${formatReleaseDate(isoDate)}`)
  lines.push('')

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

  // Insert above the newest existing version section (versions start with a digit).
  const firstVersionIdx = content.search(/\n## \d/)
  if (firstVersionIdx >= 0) {
    const before = content.slice(0, firstVersionIdx).replace(/\s+$/, '')
    const after = content.slice(firstVersionIdx + 1)
    return `${before}\n\n${newSection}\n${after}`
  }

  return `${content.replace(/\s+$/, '')}\n\n${newSection}`
}

function readReleases(path, header) {
  try {
    return readFileSync(path, 'utf-8')
  } catch {
    return header
  }
}

function getCurrentVersion() {
  try {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8'))
    return packageJson.version
  } catch {
    console.error('Error reading package.json')
    process.exit(1)
  }
}

function notesFor(commitLines, scopeAreas) {
  return commitLines
    .map(parseCommit)
    .filter((c) => c !== null)
    .map((c) => parseReleaseNote(c, scopeAreas))
    .filter((n) => n !== null)
}

function resolveOptions(options = {}) {
  return {
    file: options.file || DEFAULT_FILE,
    productName: options.productName || defaultProductName(),
    scopeAreas: options.scopeAreas || {},
    changelogFile: options.changelogFile || 'CHANGELOG.md',
  }
}

function updateReleases(newVersion, options = {}) {
  const { file, productName, scopeAreas, changelogFile } = resolveOptions(options)
  const releasesPath = join(process.cwd(), file)
  const header = defaultReleasesHeader(productName, changelogFile)
  let content = readReleases(releasesPath, header)

  const notes = notesFor(getCommitsSinceLastTag(newVersion), scopeAreas)
  if (notes.length === 0) {
    console.log(`No Release-Note footers found since last tag — skipping ${file} update`)
    // Ensure the artifact exists so a version hook's downstream steps have a
    // file to act on even on a release with no user-facing notes.
    if (!existsSync(releasesPath)) writeFileSync(releasesPath, content, 'utf-8')
    return
  }

  const date = new Date().toISOString().split('T')[0]
  const section = renderReleasesSection(newVersion, date, notes)
  content = upsertReleasesSection(content, section, newVersion)

  writeFileSync(releasesPath, content, 'utf-8')
  console.log(`✅ Updated ${file} with version ${newVersion} (${notes.length} note(s))`)
}

function retroFillReleases(count, options = {}) {
  const { file, productName, scopeAreas, changelogFile } = resolveOptions(options)
  const releasesPath = join(process.cwd(), file)
  const header = defaultReleasesHeader(productName, changelogFile)
  let content = readReleases(releasesPath, header)

  const tags = getAllVersionTags()
  if (tags.length === 0) {
    console.log('No version tags found — nothing to retro-fill')
    return
  }

  // Oldest-first so upsert leaves the newest on top.
  const targets = tags.slice(0, count).reverse()
  let updated = 0

  for (const tag of targets) {
    const idx = tags.indexOf(tag)
    const previousTag = idx < tags.length - 1 ? tags[idx + 1] : null
    const version = tag.replace(/^v/, '')
    const notes = notesFor(getCommitsBetween(previousTag, tag), scopeAreas)

    if (notes.length === 0) {
      console.log(`⚠️  ${tag}: no Release-Note footers — skipping`)
      continue
    }

    const section = renderReleasesSection(version, getTagDate(tag), notes)
    content = upsertReleasesSection(content, section, version)
    updated += 1
    console.log(`✅ ${tag}: wrote ${notes.length} note(s)`)
  }

  if (updated > 0) {
    writeFileSync(releasesPath, content, 'utf-8')
    console.log(`✅ Retro-filled ${updated} release(s) into ${file}`)
  }
}

function main(argv) {
  const args = argv.slice(2)

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

  const options = {
    file: config.releases.file,
    productName: config.releases.productName,
    scopeAreas: config.releases.scopeAreas,
    changelogFile: config.changelog.file,
  }
  const retroIdx = args.indexOf('--retro')

  if (retroIdx >= 0) {
    const count = Number.parseInt(args[retroIdx + 1] ?? '', 10)
    if (!Number.isFinite(count) || count <= 0) {
      console.error('Usage: generate-releases.cjs --retro <count>')
      process.exit(1)
    }
    retroFillReleases(count, options)
  } else {
    updateReleases(args[0] || getCurrentVersion(), options)
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
  BUCKET_ORDER,
}

// Run the CLI only when invoked directly (keeps pure functions importable).
if (require.main === module) {
  main(process.argv)
}

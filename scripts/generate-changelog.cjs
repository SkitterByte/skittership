#!/usr/bin/env node
'use strict'

/**
 * Generate a dev-facing CHANGELOG from git commits using conventional commits.
 * Run manually or wired into the versioning process. Sibling to
 * generate-releases.cjs (user-facing notes from `Release-Note:` footers).
 *
 * The output filename is injected (defaults to CHANGELOG.md). skittership's
 * config loader supplies it in production; the pure functions below are
 * filename-agnostic and unit-testable on their own.
 */

const { readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')

const {
  escapeRegex,
  getAllVersionTags,
  getCommitsBetween,
  getCommitsSinceLastTag,
  getTagDate,
  parseCommit,
} = require('./lib/git-commits.cjs')
const { loadConfig } = require('./lib/config.cjs')

const DEFAULT_FILE = 'CHANGELOG.md'

function categorizeCommits(commits) {
  const categories = {
    added: [],
    changed: [],
    deprecated: [],
    removed: [],
    fixed: [],
    security: [],
    other: [],
  }

  for (const commit of commits) {
    if (commit.breaking) {
      // Breaking changes always land under Changed regardless of type.
      categories.changed.push(commit)
      continue
    }

    switch (commit.type) {
      case 'feat':
        categories.added.push(commit)
        break
      case 'fix':
        categories.fixed.push(commit)
        break
      case 'perf':
      case 'refactor':
        categories.changed.push(commit)
        break
      case 'docs':
      case 'style':
      case 'test':
      case 'chore':
      case 'build':
      case 'ci':
        // Non-user-facing — skipped from the changelog.
        break
      default:
        categories.other.push(commit)
    }
  }

  return categories
}

function formatChangelogEntry(entry) {
  const scope = entry.scope ? `**${entry.scope}**: ` : ''
  return `- ${scope}${entry.message}`
}

function generateChangelogSection(version, date, categories) {
  const sections = []

  sections.push(`## [${version}] - ${date}\n`)

  const ordered = [
    ['Added', categories.added],
    ['Changed', categories.changed],
    ['Deprecated', categories.deprecated],
    ['Removed', categories.removed],
    ['Fixed', categories.fixed],
    ['Security', categories.security],
  ]

  for (const [heading, entries] of ordered) {
    if (entries.length > 0) {
      sections.push(`### ${heading}`)
      entries.forEach((entry) => {
        sections.push(formatChangelogEntry(entry))
      })
      sections.push('')
    }
  }

  return sections.join('\n')
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

const DEFAULT_HEADER = `# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
`

function upsertSection(changelogContent, newSection, version) {
  const existingRegex = new RegExp(
    `(^|\\n)## \\[${escapeRegex(version)}\\][^\\n]*\\n[\\s\\S]*?(?=\\n## \\[|\\n---|$)`,
  )
  const existingMatch = changelogContent.match(existingRegex)

  if (existingMatch) {
    const leading = existingMatch[1] ?? ''
    return changelogContent.replace(existingRegex, `${leading}${newSection.trimEnd()}\n`)
  }

  const unreleasedRegex = /## \[Unreleased\][\s\S]*?(?=\n## \[|$)/
  const unreleasedMatch = changelogContent.match(unreleasedRegex)
  if (unreleasedMatch && unreleasedMatch.index !== undefined) {
    const insertPos = unreleasedMatch.index + unreleasedMatch[0].length
    const before = changelogContent.slice(0, insertPos).replace(/\s+$/, '')
    const after = changelogContent.slice(insertPos).replace(/^\s+/, '')
    return `${before}\n\n${newSection}\n${after ? `${after}\n` : ''}`
  }

  const firstVersionIdx = changelogContent.search(/\n## \[/)
  if (firstVersionIdx >= 0) {
    const before = changelogContent.slice(0, firstVersionIdx).replace(/\s+$/, '')
    const after = changelogContent.slice(firstVersionIdx + 1)
    return `${before}\n\n${newSection}\n${after}`
  }

  return `${changelogContent.replace(/\s+$/, '')}\n\n${newSection}`
}

function readChangelog(path) {
  try {
    return readFileSync(path, 'utf-8')
  } catch {
    return DEFAULT_HEADER
  }
}

function updateChangelog(newVersion, options = {}) {
  const file = options.file || DEFAULT_FILE
  const changelogPath = join(process.cwd(), file)
  let changelogContent = readChangelog(changelogPath)

  const commitLines = getCommitsSinceLastTag(newVersion)
  const commits = commitLines.map(parseCommit).filter((commit) => commit !== null)

  if (commits.length === 0) {
    console.log(`No conventional commits found since last tag — skipping ${file} update`)
    return
  }

  const categories = categorizeCommits(commits)
  const date = new Date().toISOString().split('T')[0]
  const newSection = generateChangelogSection(newVersion, date, categories).trimEnd() + '\n'

  changelogContent = upsertSection(changelogContent, newSection, newVersion)

  writeFileSync(changelogPath, changelogContent, 'utf-8')
  console.log(`✅ Updated ${file} with version ${newVersion}`)
}

function retroFillChangelog(count, options = {}) {
  const file = options.file || DEFAULT_FILE
  const changelogPath = join(process.cwd(), file)
  let changelogContent = readChangelog(changelogPath)

  const tags = getAllVersionTags()
  if (tags.length === 0) {
    console.log('No version tags found — nothing to retro-fill')
    return
  }

  // Walk newest → oldest; for each tag, compute commits since the previous tag.
  // Write oldest-first so that when we upsert, the newest ends up on top.
  const targets = tags.slice(0, count).reverse()
  let updated = 0

  for (const tag of targets) {
    const idx = tags.indexOf(tag)
    const previousTag = idx < tags.length - 1 ? tags[idx + 1] : null
    const version = tag.replace(/^v/, '')
    const commits = getCommitsBetween(previousTag, tag)
      .map(parseCommit)
      .filter((c) => c !== null)

    if (commits.length === 0) {
      console.log(`⚠️  ${tag}: no conventional commits — skipping`)
      continue
    }

    const categories = categorizeCommits(commits)
    const date = getTagDate(tag)
    const section = generateChangelogSection(version, date, categories).trimEnd() + '\n'
    changelogContent = upsertSection(changelogContent, section, version)
    updated += 1
    console.log(`✅ ${tag}: wrote ${commits.length} commit(s)`)
  }

  if (updated > 0) {
    writeFileSync(changelogPath, changelogContent, 'utf-8')
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

  if (!config.changelog.enabled) {
    console.log('Changelog generation disabled in skittership.config.json — skipping')
    return
  }

  const options = { file: config.changelog.file }
  const retroIdx = args.indexOf('--retro')

  if (retroIdx >= 0) {
    const countArg = args[retroIdx + 1]
    const count = Number.parseInt(countArg ?? '', 10)
    if (!Number.isFinite(count) || count <= 0) {
      console.error('Usage: generate-changelog.cjs --retro <count>')
      process.exit(1)
    }
    retroFillChangelog(count, options)
  } else {
    const version = args[0] || getCurrentVersion()
    updateChangelog(version, options)
  }
}

module.exports = {
  categorizeCommits,
  formatChangelogEntry,
  generateChangelogSection,
  upsertSection,
  updateChangelog,
  retroFillChangelog,
  DEFAULT_HEADER,
}

// Run the CLI only when invoked directly (keeps pure functions importable).
if (require.main === module) {
  main(process.argv)
}

'use strict'

const { test } = require('node:test')
const assert = require('node:assert')

const {
  categorizeCommits,
  generateChangelogSection,
  upsertSection,
  DEFAULT_HEADER,
} = require('../assets/scripts/generate-changelog.js')

const mk = (overrides) => ({
  type: 'feat',
  scope: undefined,
  message: 'do a thing',
  body: undefined,
  hash: 'abc1234',
  breaking: false,
  ...overrides,
})

const sectionFor = (version, date, commits) =>
  generateChangelogSection(version, date, categorizeCommits(commits)).trimEnd() + '\n'

test('categorizeCommits routes types to Keep-a-Changelog buckets', () => {
  const cats = categorizeCommits([
    mk({ type: 'feat' }),
    mk({ type: 'fix' }),
    mk({ type: 'perf' }),
    mk({ type: 'refactor' }),
    mk({ type: 'wibble' }),
  ])
  assert.strictEqual(cats.added.length, 1)
  assert.strictEqual(cats.fixed.length, 1)
  assert.strictEqual(cats.changed.length, 2) // perf + refactor
  assert.strictEqual(cats.other.length, 1) // unknown type
})

test('categorizeCommits sends breaking changes to Changed regardless of type', () => {
  const cats = categorizeCommits([mk({ type: 'feat', breaking: true })])
  assert.strictEqual(cats.added.length, 0)
  assert.strictEqual(cats.changed.length, 1)
})

test('categorizeCommits skips non-user-facing types', () => {
  const cats = categorizeCommits(
    ['docs', 'style', 'test', 'chore', 'build', 'ci'].map((type) => mk({ type })),
  )
  const total = Object.values(cats).reduce((n, list) => n + list.length, 0)
  assert.strictEqual(total, 0)
})

test('upsertSection inserts a new version section and is idempotent', () => {
  const section = sectionFor('1.0.0', '2026-06-19', [mk({ type: 'feat', message: 'add export' })])
  const once = upsertSection(DEFAULT_HEADER, section, '1.0.0')
  assert.ok(once.includes('## [1.0.0] - 2026-06-19'))
  assert.ok(once.includes('### Added'))
  assert.ok(once.includes('- add export'))
  const twice = upsertSection(once, section, '1.0.0')
  assert.strictEqual(twice, once)
})

test('upsertSection keeps newest on top and replaces only the targeted version', () => {
  let content = upsertSection(
    DEFAULT_HEADER,
    sectionFor('1.0.0', '2026-06-19', [mk({ message: 'old feature' })]),
    '1.0.0',
  )
  content = upsertSection(
    content,
    sectionFor('1.1.0', '2026-06-20', [mk({ message: 'new feature' })]),
    '1.1.0',
  )
  assert.ok(content.indexOf('## [1.1.0]') < content.indexOf('## [1.0.0]'))

  const updated = upsertSection(
    content,
    sectionFor('1.0.0', '2026-06-19', [mk({ message: 'edited feature' })]),
    '1.0.0',
  )
  assert.ok(updated.includes('edited feature'))
  assert.ok(!updated.includes('old feature'))
  assert.ok(updated.includes('new feature'))
  assert.ok(updated.indexOf('## [1.1.0]') < updated.indexOf('## [1.0.0]'))
})

test('formatChangelogEntry bolds the scope when present', () => {
  const section = sectionFor('2.0.0', '2026-06-21', [
    mk({ type: 'feat', scope: 'tasks', message: 'sort inbox' }),
  ])
  assert.ok(section.includes('- **tasks**: sort inbox'))
})

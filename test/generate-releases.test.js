'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  bucketFor,
  defaultReleasesHeader,
  formatReleaseDate,
  parseReleaseNote,
  renderReleasesSection,
  resolveArea,
  upsertReleasesSection,
} = require('../assets/scripts/generate-releases.js')
const { loadConfig, CONFIG_FILE } = require('../src/config.js')

// A representative scope→area map (the production map is injected from config).
const AREAS = {
  reqs: 'Requisitions',
  tasks: 'Tasks',
  delap: 'Approvals',
  'cost-codes': 'Cost codes',
}

const mk = (overrides) => ({
  type: 'feat',
  scope: 'tasks',
  message: 'do a thing',
  body: undefined,
  hash: 'abc1234',
  breaking: false,
  ...overrides,
})

const note = (overrides) => ({
  area: 'Tasks',
  bucket: 'New',
  text: 'A user-facing thing',
  highlight: false,
  hash: 'abc1234',
  ...overrides,
})

test('bucketFor maps conventional types to user buckets', () => {
  assert.strictEqual(bucketFor('feat', false), 'New')
  assert.strictEqual(bucketFor('fix', false), 'Fixed')
  assert.strictEqual(bucketFor('perf', false), 'Improved')
  assert.strictEqual(bucketFor('refactor', false), 'Improved')
})

test('bucketFor routes breaking changes to Action required regardless of type', () => {
  assert.strictEqual(bucketFor('feat', true), 'Action required')
  assert.strictEqual(bucketFor('fix', true), 'Action required')
})

test('bucketFor omits non-user-facing and unknown types', () => {
  for (const t of ['docs', 'style', 'test', 'chore', 'build', 'ci', 'wibble']) {
    assert.strictEqual(bucketFor(t, false), null)
  }
})

test('resolveArea maps known scopes to friendly area labels', () => {
  assert.strictEqual(resolveArea('tasks', undefined, AREAS), 'Tasks')
  assert.strictEqual(resolveArea('reqs', undefined, AREAS), 'Requisitions')
  assert.strictEqual(resolveArea('delap', undefined, AREAS), 'Approvals')
  assert.strictEqual(resolveArea('cost-codes', undefined, AREAS), 'Cost codes')
})

test('resolveArea title-cases unmapped scopes (incl. empty map)', () => {
  assert.strictEqual(resolveArea('process-engine', undefined, AREAS), 'Process Engine')
  assert.strictEqual(resolveArea('foo', undefined, {}), 'Foo')
  assert.strictEqual(resolveArea('foo'), 'Foo')
})

test('resolveArea prefers an explicit override and defaults missing scope to General', () => {
  assert.strictEqual(resolveArea('engine', 'Approvals', AREAS), 'Approvals')
  assert.strictEqual(resolveArea(undefined), 'General')
})

test('parseReleaseNote extracts a single-line note', () => {
  const result = parseReleaseNote(
    mk({ type: 'feat', scope: 'reqs', body: 'Release-Note: You can export your list to CSV.' }),
    AREAS,
  )
  assert.strictEqual(result.area, 'Requisitions')
  assert.strictEqual(result.bucket, 'New')
  assert.strictEqual(result.text, 'You can export your list to CSV.')
  assert.strictEqual(result.highlight, false)
})

test('parseReleaseNote joins multi-line continuation into one paragraph', () => {
  const body = [
    '- dev bullet that should be ignored',
    '',
    'Release-Note: You can now sort your task inbox by when an item entered',
    '  its current state or when it was created, with both dates on every row.',
  ].join('\n')
  const result = parseReleaseNote(mk({ body }), AREAS)
  assert.strictEqual(
    result.text,
    'You can now sort your task inbox by when an item entered its current state ' +
      'or when it was created, with both dates on every row.',
  )
})

test('parseReleaseNote treats Release-Note! as a highlight', () => {
  const result = parseReleaseNote(mk({ body: 'Release-Note!: Big new thing.' }), AREAS)
  assert.strictEqual(result.highlight, true)
  assert.strictEqual(result.text, 'Big new thing.')
})

test('parseReleaseNote honours a Release-Area override', () => {
  const result = parseReleaseNote(
    mk({ scope: 'engine', body: 'Release-Area: Approvals\nRelease-Note: Approvals are faster.' }),
    AREAS,
  )
  assert.strictEqual(result.area, 'Approvals')
})

test('parseReleaseNote maps breaking commits to Action required', () => {
  const result = parseReleaseNote(
    mk({ type: 'feat', breaking: true, body: 'Release-Note: You must re-link your teams.' }),
    AREAS,
  )
  assert.strictEqual(result.bucket, 'Action required')
})

test('parseReleaseNote returns null for none, missing footer, or omitted type', () => {
  assert.strictEqual(parseReleaseNote(mk({ body: 'Release-Note: none' })), null)
  assert.strictEqual(parseReleaseNote(mk({ body: 'Release-Note: NONE' })), null)
  assert.strictEqual(parseReleaseNote(mk({ body: 'just a dev body, no footer' })), null)
  assert.strictEqual(parseReleaseNote(mk({ body: undefined })), null)
  assert.strictEqual(parseReleaseNote(mk({ type: 'chore', body: 'Release-Note: slipped in' })), null)
})

test('formatReleaseDate renders ISO dates as friendly UK dates', () => {
  assert.strictEqual(formatReleaseDate('2026-06-19'), '19 Jun 2026')
  assert.strictEqual(formatReleaseDate('2026-01-01T12:00:00Z'), '1 Jan 2026')
})

test('formatReleaseDate passes through unparseable input', () => {
  assert.strictEqual(formatReleaseDate('not-a-date'), 'not-a-date')
})

test('renderReleasesSection renders heading, single highlight, sorted areas, ordered buckets', () => {
  const notes = [
    note({ area: 'Tasks', bucket: 'New', text: 'Sort your inbox.', highlight: true }),
    note({ area: 'Tasks', bucket: 'Fixed', text: 'Done badges no longer stale.' }),
    note({ area: 'Requisitions', bucket: 'New', text: 'Export to CSV.' }),
  ]
  const out = renderReleasesSection('29.3.0', '2026-06-19', notes)
  assert.ok(out.includes('## 29.3.0 — 19 Jun 2026'))
  assert.ok(out.includes('**Highlights:** Sort your inbox.'))
  // Requisitions sorts before Tasks alphabetically.
  assert.ok(out.indexOf('### Requisitions') < out.indexOf('### Tasks'))
  // New renders before Fixed within Tasks.
  assert.ok(
    out.indexOf('**New** — Sort your inbox.') <
      out.indexOf('**Fixed** — Done badges no longer stale.'),
  )
})

test('renderReleasesSection renders multiple highlights as a bullet list', () => {
  const notes = [note({ text: 'One', highlight: true }), note({ text: 'Two', highlight: true })]
  const out = renderReleasesSection('1.0.0', '2026-06-19', notes)
  assert.ok(out.includes('**Highlights:**\n- One\n- Two'))
})

test('upsertReleasesSection inserts a new section and is idempotent on re-run', () => {
  const header = '# Release Notes\n\nIntro line.\n'
  const section = renderReleasesSection('1.0.0', '2026-06-19', [note({})])
  const once = upsertReleasesSection(header, section, '1.0.0')
  assert.ok(once.includes('## 1.0.0 — 19 Jun 2026'))
  const twice = upsertReleasesSection(once, section, '1.0.0')
  assert.strictEqual(twice, once)
})

test('config scopeAreas override the Title-Case fallback', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skittership-rel-'))
  fs.writeFileSync(
    path.join(dir, CONFIG_FILE),
    JSON.stringify({ releases: { scopeAreas: { api: 'Public API' } } }),
    'utf-8',
  )
  const cfg = loadConfig(dir)
  // mapped via config
  assert.strictEqual(resolveArea('api', undefined, cfg.releases.scopeAreas), 'Public API')
  // unmapped scope still title-cases
  assert.strictEqual(resolveArea('billing', undefined, cfg.releases.scopeAreas), 'Billing')
})

test('config productName reaches the rendered releases header', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skittership-rel-'))
  fs.writeFileSync(
    path.join(dir, CONFIG_FILE),
    JSON.stringify({ releases: { productName: 'Acme Console' }, changelog: { file: 'LOG.md' } }),
    'utf-8',
  )
  const cfg = loadConfig(dir)
  const header = defaultReleasesHeader(cfg.releases.productName, cfg.changelog.file)
  assert.ok(header.includes('Acme Console'))
  assert.ok(header.includes('[LOG.md](./LOG.md)'))
})

test('upsertReleasesSection replaces an existing version in place without touching others', () => {
  const header = '# Release Notes\n\nIntro line.\n'
  let content = header
  content = upsertReleasesSection(
    content,
    renderReleasesSection('1.0.0', '2026-06-19', [note({ text: 'Old one' })]),
    '1.0.0',
  )
  content = upsertReleasesSection(
    content,
    renderReleasesSection('1.1.0', '2026-06-20', [note({ text: 'Newer one' })]),
    '1.1.0',
  )
  // Newer version sits above the older one.
  assert.ok(content.indexOf('## 1.1.0') < content.indexOf('## 1.0.0'))

  // Re-render 1.0.0 with new text — only that section changes.
  const updated = upsertReleasesSection(
    content,
    renderReleasesSection('1.0.0', '2026-06-19', [note({ text: 'Edited one' })]),
    '1.0.0',
  )
  assert.ok(updated.includes('Edited one'))
  assert.ok(!updated.includes('Old one'))
  assert.ok(updated.includes('Newer one'))
  assert.ok(updated.indexOf('## 1.1.0') < updated.indexOf('## 1.0.0'))
})

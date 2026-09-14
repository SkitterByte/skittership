'use strict'

// Only the pure argument/version logic is covered here. The `npm stage`
// invocation itself is interactive by design (it prompts for 2FA), so it is
// exercised by actually approving a release, not by a test.

const { test } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')

const { parseArgs, tooOld, normaliseEntries, UUID } = require(
  path.join(__dirname, '..', 'scripts', 'approve-release.cjs'),
)

const argv = (...args) => ['node', 'approve-release.cjs', ...args]

test('defaults to approving, with no version (caller falls back to package.json)', () => {
  assert.deepStrictEqual(parseArgs(argv()), { action: 'approve', target: undefined })
})

test('takes a positional target', () => {
  assert.deepStrictEqual(parseArgs(argv('2.0.1')), { action: 'approve', target: '2.0.1' })
})

test('--reject switches the action and still takes a version', () => {
  assert.deepStrictEqual(parseArgs(argv('--reject')), { action: 'reject', target: undefined })
  assert.deepStrictEqual(parseArgs(argv('--reject', '2.0.1')), {
    action: 'reject',
    target: '2.0.1',
  })
  // Order must not matter — npm run approve 2.0.1 --reject
  assert.deepStrictEqual(parseArgs(argv('2.0.1', '--reject')), {
    action: 'reject',
    target: '2.0.1',
  })
})

test('a flag is never mistaken for the target', () => {
  assert.strictEqual(parseArgs(argv('--reject')).target, undefined)
})

test('tooOld compares npm versions componentwise', () => {
  const MIN = [11, 15, 0]
  assert.strictEqual(tooOld([11, 14, 9], MIN), true)
  assert.strictEqual(tooOld([11, 15, 0], MIN), false)
  assert.strictEqual(tooOld([11, 15, 1], MIN), false)
  assert.strictEqual(tooOld([12, 0, 0], MIN), false)
  assert.strictEqual(tooOld([10, 99, 99], MIN), true)
  // The comparison a string sort gets wrong: 11.9 is older than 11.15.
  assert.strictEqual(tooOld([11, 9, 0], MIN), true)
})

// --- resolving a version to a stage-id -------------------------------------

// `npm stage approve` takes a UUID, not a package spec — passing a spec fails
// with "stage-id must be a valid UUID". The listing is the only way to get one,
// and its field names are not pinned down in the docs, so the parser accepts
// the plausible spellings rather than betting on one.

const ID_A = '3f2504e0-4f89-11d3-9a0c-0305e82c3301'
const ID_B = '7c9e6679-7425-40de-944b-e07fc1f90ae7'

test('normaliseEntries reads a plain array with id/version', () => {
  assert.deepStrictEqual(
    normaliseEntries([{ id: ID_A, version: '2.0.1' }]),
    [{ id: ID_A, version: '2.0.1' }],
  )
})

test('normaliseEntries accepts alternative id spellings', () => {
  assert.deepStrictEqual(normaliseEntries([{ stageId: ID_A, version: '1.0.0' }]), [
    { id: ID_A, version: '1.0.0' },
  ])
  assert.deepStrictEqual(normaliseEntries([{ stage_id: ID_B, version: '1.0.0' }]), [
    { id: ID_B, version: '1.0.0' },
  ])
})

test('normaliseEntries finds a UUID under an unexpected key', () => {
  assert.deepStrictEqual(normaliseEntries([{ someKey: ID_A, version: '2.0.1' }]), [
    { id: ID_A, version: '2.0.1' },
  ])
})

test('normaliseEntries derives the version from a spec when absent', () => {
  assert.deepStrictEqual(normaliseEntries([{ id: ID_A, spec: '@scope/pkg@2.0.1' }]), [
    { id: ID_A, version: '2.0.1' },
  ])
})

test('normaliseEntries unwraps a wrapper object', () => {
  const rows = [{ id: ID_A, version: '2.0.1' }]
  assert.deepStrictEqual(normaliseEntries({ staged: rows }), rows)
  assert.deepStrictEqual(normaliseEntries({ versions: rows }), rows)
})

test('normaliseEntries drops rows with no id rather than inventing one', () => {
  assert.deepStrictEqual(normaliseEntries([{ version: '2.0.1' }]), [])
  assert.deepStrictEqual(normaliseEntries([]), [])
  assert.deepStrictEqual(normaliseEntries(null), [])
})

test('UUID matches a stage-id and rejects a version string', () => {
  assert.ok(UUID.test(ID_A))
  assert.ok(!UUID.test('2.0.1'))
  assert.ok(!UUID.test('@skitterbyte/skittership@2.0.1'))
})

'use strict'

// Only the pure argument/version logic is covered here. The `npm stage`
// invocation itself is interactive by design (it prompts for 2FA), so it is
// exercised by actually approving a release, not by a test.

const { test } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')

const { parseArgs, tooOld } = require(path.join(__dirname, '..', 'scripts', 'approve-release.cjs'))

const argv = (...args) => ['node', 'approve-release.cjs', ...args]

test('defaults to approving, with no version (caller falls back to package.json)', () => {
  assert.deepStrictEqual(parseArgs(argv()), { action: 'approve', version: undefined })
})

test('takes a positional version', () => {
  assert.deepStrictEqual(parseArgs(argv('2.0.1')), { action: 'approve', version: '2.0.1' })
})

test('--reject switches the action and still takes a version', () => {
  assert.deepStrictEqual(parseArgs(argv('--reject')), { action: 'reject', version: undefined })
  assert.deepStrictEqual(parseArgs(argv('--reject', '2.0.1')), {
    action: 'reject',
    version: '2.0.1',
  })
  // Order must not matter — npm run approve -- 2.0.1 --reject
  assert.deepStrictEqual(parseArgs(argv('2.0.1', '--reject')), {
    action: 'reject',
    version: '2.0.1',
  })
})

test('a flag is never mistaken for the version', () => {
  assert.strictEqual(parseArgs(argv('--reject')).version, undefined)
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

'use strict'

const { test } = require('node:test')
const assert = require('node:assert')

const { parseCommit, reconstructCommits } = require('../assets/scripts/lib/git-commits.js')

// commitLine is the `hash\0subject\0body` form reconstructCommits produces.
const line = (hash, subject, body = '') => `${hash}\0${subject}\0${body}`

test('parseCommit parses a conventional commit with scope', () => {
  const c = parseCommit(line('abc1234', 'feat(tasks): add sort-by'))
  assert.strictEqual(c.type, 'feat')
  assert.strictEqual(c.scope, 'tasks')
  assert.strictEqual(c.message, 'add sort-by')
  assert.strictEqual(c.hash, 'abc1234')
  assert.strictEqual(c.breaking, false)
})

test('parseCommit lowercases type and leaves scope absent when omitted', () => {
  const c = parseCommit(line('h1', 'FIX: correct a bug'))
  assert.strictEqual(c.type, 'fix')
  assert.strictEqual(c.scope, undefined)
  assert.strictEqual(c.message, 'correct a bug')
})

test('parseCommit detects the ! breaking marker', () => {
  assert.strictEqual(parseCommit(line('h1', 'feat!: drop legacy api')).breaking, true)
  assert.strictEqual(parseCommit(line('h1', 'feat(api)!: drop legacy')).breaking, true)
})

test('parseCommit detects a BREAKING CHANGE footer in the body', () => {
  const c = parseCommit(line('h1', 'feat: new flow', 'body line\n\nBREAKING CHANGE: re-auth needed'))
  assert.strictEqual(c.breaking, true)
  const dashed = parseCommit(line('h1', 'feat: new flow', 'BREAKING-CHANGE: re-auth needed'))
  assert.strictEqual(dashed.breaking, true)
})

test('parseCommit returns null for non-conventional subjects', () => {
  assert.strictEqual(parseCommit(line('h1', 'just a plain message')), null)
})

test('parseCommit returns null when there is no subject delimiter', () => {
  assert.strictEqual(parseCommit('onlyhash'), null)
})

test('reconstructCommits groups NUL-delimited parts into commits', () => {
  const out = 'h1\0s1\0b1\0h2\0s2\0b2\0'
  assert.deepStrictEqual(reconstructCommits(out), ['h1\0s1\0b1', 'h2\0s2\0b2'])
})

test('reconstructCommits keeps commits with empty bodies', () => {
  const out = 'h1\0s1\0\0'
  assert.deepStrictEqual(reconstructCommits(out), ['h1\0s1\0'])
})

test('reconstructCommits returns empty for empty input', () => {
  assert.deepStrictEqual(reconstructCommits(''), [])
  assert.deepStrictEqual(reconstructCommits('   '), [])
})

test('reconstructCommits skips a group missing hash or subject', () => {
  // Second group has an empty hash → dropped; first group survives.
  const out = 'h1\0s1\0b1\0\0s2\0b2\0'
  assert.deepStrictEqual(reconstructCommits(out), ['h1\0s1\0b1'])
})

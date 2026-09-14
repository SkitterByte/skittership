'use strict'

// npm verifies the sigstore provenance bundle against `repository.url`, and the
// comparison is CASE-SENSITIVE. A package.json saying `skitterbyte` while the
// org is `SkitterByte` fails the publish at the very last step, after the
// tarball is built and the provenance statement has already been signed and
// written to the public transparency log:
//
//   422 Unprocessable Entity - Error verifying sigstore provenance bundle:
//   "repository.url" is ".../skitterbyte/skittership.git", expected to match
//   ".../SkitterByte/skittership" from provenance
//
// Cheap to assert here, expensive to discover in CI.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const ROOT = path.join(__dirname, '..')

/** owner/repo from either an ssh or https GitHub remote, case preserved. */
function ownerRepo(url) {
  const match = String(url)
    .replace(/^git\+/, '')
    .replace(/\.git$/, '')
    .match(/github\.com[/:]([^/]+)\/([^/]+)$/)
  return match ? `${match[1]}/${match[2]}` : null
}

function gitRemote() {
  try {
    return execFileSync('git', ['remote', 'get-url', 'origin'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return null // no origin (fresh clone of a fork, some CI checkouts)
  }
}

test('ownerRepo parses both remote forms and preserves case', () => {
  assert.strictEqual(ownerRepo('git@github.com:SkitterByte/skittership.git'), 'SkitterByte/skittership')
  assert.strictEqual(
    ownerRepo('git+https://github.com/SkitterByte/skittership.git'),
    'SkitterByte/skittership',
  )
  assert.strictEqual(ownerRepo('https://github.com/SkitterByte/skittership'), 'SkitterByte/skittership')
  assert.notStrictEqual(ownerRepo('https://github.com/skitterbyte/skittership'), 'SkitterByte/skittership')
  assert.strictEqual(ownerRepo('not a url'), null)
})

test('package.json repository.url matches the git remote exactly, including case', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
  const declared = ownerRepo(pkg.repository && pkg.repository.url)
  assert.ok(declared, 'package.json declares a parseable GitHub repository.url')

  const remote = gitRemote()
  if (!remote) return // nothing to compare against; not a failure

  const actual = ownerRepo(remote)
  assert.ok(actual, `origin is a GitHub remote (got ${remote})`)
  assert.strictEqual(
    declared,
    actual,
    'repository.url disagrees with the git remote — npm validates provenance ' +
      'against this case-sensitively and will reject the publish',
  )
})

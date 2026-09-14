#!/usr/bin/env node
'use strict'

/**
 * Fail the `npm version` run if anything unexpected is staged.
 *
 * Runs as the LAST step of the npm `version` script, after the generators have
 * written and staged the changelog / release-notes files.
 *
 * Why a post-check and not a pre-check: npm already refuses to start when the
 * working directory is dirty ("Git working directory not clean"), so a file
 * another session staged BEFORE the release aborts it for us. What npm does not
 * cover is the window during the version script itself — the seconds our
 * generators run. Anything staged in that window is swept into npm's commit,
 * because npm commits with a bare `git commit` and no pathspec (verified: a
 * file staged mid-script lands in the version commit).
 *
 * We cannot bound npm's commit. We can refuse to reach it: a non-zero exit here
 * aborts the run before the commit and the tag are created.
 */

const { execFileSync } = require('node:child_process')
const path = require('node:path')

const { loadConfig } = require(path.join(__dirname, 'lib', 'config.cjs'))

// Files the release itself is expected to stage. package.json (and its
// lockfiles) are npm's own — it bumps the version and stages them around us.
function expectedPaths(dir) {
  const config = loadConfig(dir)
  const expected = new Set(['package.json', 'package-lock.json', 'npm-shrinkwrap.json'])
  if (config.changelog.enabled) expected.add(config.changelog.file)
  if (config.releases.enabled) expected.add(config.releases.file)
  return expected
}

function stagedPaths(dir) {
  const out = execFileSync('git', ['diff', '--cached', '--name-only'], {
    cwd: dir,
    encoding: 'utf8',
  })
  return out.split('\n').map((s) => s.trim()).filter(Boolean)
}

function findStrays(dir) {
  const expected = expectedPaths(dir)
  return stagedPaths(dir).filter((p) => !expected.has(p))
}

function main() {
  const dir = process.cwd()
  const strays = findStrays(dir)
  if (strays.length === 0) return

  console.error('\n✖ Release aborted — unexpected files are staged:\n')
  for (const p of strays) console.error(`    ${p}`)
  console.error(
    '\n  These were staged during the version script, so npm would have swept\n' +
      '  them into the version commit (npm commits the whole index, with no\n' +
      '  pathspec). Nothing has been committed or tagged.\n' +
      '\n  Unstage them and re-run. Note npm already bumped package.json on disk;\n' +
      '  `git checkout -- package.json` undoes that if you are not re-running.\n',
  )
  process.exit(1)
}

if (require.main === module) main()

module.exports = { expectedPaths, stagedPaths, findStrays }

'use strict'

// Lint for the commands we ship inside assets/**.
//
// Two rules, both from the same failure: a checkout has one `.git/index`,
// shared by every process standing in it. `git add <dir>/` sweeps in whatever
// else is there, and a `git commit` with no pathspec takes whatever another
// session already staged. See assets/skills/commit/SKILL.md.
//
// This reads FENCED BLOCKS ONLY, never whole files. The skill deliberately
// names the anti-pattern in prose ("never `git add src/`"); a blanket string
// ban would fail on the very sentence that prevents the regression.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const ASSETS = path.join(__dirname, '..', 'assets')

// --- detector ---------------------------------------------------------------

// Lines inside ``` / ~~~ fences, with their 1-based line numbers. Indented
// fences (fenced blocks nested in a list item) count.
function fencedLines(markdown) {
  const out = []
  let marker = null
  markdown.split('\n').forEach((raw, i) => {
    const trimmed = raw.trim()
    const fence = trimmed.match(/^(`{3,}|~{3,})/)
    if (fence) {
      if (marker === null) marker = fence[1][0]
      else if (fence[1][0] === marker) marker = null
      return
    }
    if (marker !== null) out.push({ text: trimmed, line: i + 1 })
  })
  return out
}

function splitCommands(line) {
  return line
    .split(/&&|\|\||;|\|/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function tokenize(command) {
  return command.match(/"[^"]*"|'[^']*'|\S+/g) || []
}

const unquote = (s) => s.replace(/^["']|["']$/g, '')

// Flags that stage by traversal rather than by name.
const SWEEPING_FLAGS = new Set(['-A', '--all', '-u', '--update', '--no-ignore-removal'])

// Returns a violation message, or null if the command is fine.
function inspectCommand(command) {
  const tokens = tokenize(command)
  if (tokens[0] !== 'git') return null

  if (tokens[1] === 'add') {
    const args = tokens.slice(2)
    const swept = args.find((a) => SWEEPING_FLAGS.has(a))
    if (swept) return `\`git add\` stages by traversal (${swept}) instead of naming paths`

    const paths = args.filter((a) => a !== '--' && !a.startsWith('-')).map(unquote)
    if (paths.length === 0) return '`git add` names no path'

    const dir = paths.find((p) => p === '.' || p === '*' || p.endsWith('/') || p.endsWith('/*'))
    if (dir) return `\`git add\` stages a directory pathspec (${dir}) instead of naming paths`
    return null
  }

  if (tokens[1] === 'commit') {
    const args = tokens.slice(2)
    const sep = args.indexOf('--')
    if (sep === -1) return '`git commit` carries no `--` pathspec, so it commits the whole index'
    if (args.length === sep + 1) return '`git commit` has an empty pathspec after `--`'
    return null
  }

  return null
}

function findViolations(markdown, file = '<input>') {
  const violations = []
  for (const { text, line } of fencedLines(markdown)) {
    for (const command of splitCommands(text)) {
      const problem = inspectCommand(command)
      if (problem) violations.push({ file, line, command, problem })
    }
  }
  return violations
}

function markdownFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return markdownFiles(full)
    return entry.name.endsWith('.md') ? [full] : []
  })
}

// --- the guard --------------------------------------------------------------

test('no fenced command in assets/** stages a directory or commits unbounded', () => {
  const files = markdownFiles(ASSETS)
  assert.ok(files.length > 0, 'found markdown under assets/ to lint')

  const violations = files.flatMap((file) =>
    findViolations(fs.readFileSync(file, 'utf8'), path.relative(ASSETS, file)),
  )

  assert.deepStrictEqual(
    violations,
    [],
    'unbounded git commands in assets/**:\n' +
      violations.map((v) => `  ${v.file}:${v.line}  ${v.command}  — ${v.problem}`).join('\n'),
  )
})

// --- proof the guard can fire ----------------------------------------------

test('detector fires on the historical incident line', () => {
  // The 2026-09-13 skitterspec incident: `git add specs/` swept a second
  // session's in-progress spec folder into an unrelated commit.
  const doc = ['```', 'git add specs/ && git commit -m "feat(specs): add SKS-209"', '```'].join('\n')

  const violations = findViolations(doc, 'incident.md')
  assert.strictEqual(violations.length, 2, 'both halves flagged')
  assert.match(violations[0].problem, /directory pathspec \(specs\/\)/)
  assert.match(violations[1].problem, /no `--` pathspec/)
  assert.strictEqual(violations[0].line, 2)
})

test('detector fires on -A, on `.`, and on a bare commit', () => {
  const cases = [
    ['git add -A', /stages by traversal \(-A\)/],
    ['git add .', /directory pathspec \(\.\)/],
    ['git add src/*', /directory pathspec \(src\/\*\)/],
    ['git commit -m "wip"', /no `--` pathspec/],
    ['git commit -m "wip" --', /empty pathspec/],
  ]
  for (const [command, expected] of cases) {
    assert.match(inspectCommand(command) || '', expected, command)
  }
})

test('detector accepts the prescribed form', () => {
  assert.strictEqual(inspectCommand('git add -- a/one.md b/two.md'), null)
  assert.strictEqual(inspectCommand('git commit -m "fix(x): y" -- a/one.md b/two.md'), null)
  assert.strictEqual(inspectCommand('git status --short'), null)
})

test('the anti-pattern named in prose does not trip the guard', () => {
  // The skill itself writes `git add src/` into prose. If the detector ever
  // grows into a whole-file string ban, this test fails — and the guard that
  // fails on its own documentation is the one that gets deleted, not fixed.
  const doc = [
    'Staging a directory — `git add src/` — takes everything in it.',
    'Never `git add -A`, never `git add .`.',
    '',
    '```',
    'git add -- notes/one.md',
    '```',
  ].join('\n')

  assert.deepStrictEqual(findViolations(doc, 'prose.md'), [])
})

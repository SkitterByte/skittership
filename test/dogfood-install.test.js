'use strict'

// This repo installs its own tooling (skittership init), so .claude/ and
// scripts/ hold copies of files whose source of truth is assets/. Copies drift.
//
// The fenced-command lint in assets-commands.test.js deliberately scopes itself
// to assets/** — what this library PRESCRIBES. That scope is only sound while
// the installed copies are byte-identical to what assets/ prescribes, which is
// what this file asserts. If it fails, run `node bin/skittership.js update`.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const { SKILLS, RULES } = require('../src/init.js')

const ROOT = path.join(__dirname, '..')
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8')

// shipped asset -> where init() puts it in a consumer (and so, here).
function installedPairs() {
  const pairs = []
  for (const name of SKILLS) {
    pairs.push([
      path.join('assets', 'skills', name, 'SKILL.md'),
      path.join('.claude', 'skills', name, 'SKILL.md'),
    ])
  }
  for (const name of RULES) {
    pairs.push([path.join('assets', 'rules', name), path.join('.claude', 'rules', name)])
  }
  for (const script of [
    path.join('scripts', 'generate-changelog.cjs'),
    path.join('scripts', 'generate-releases.cjs'),
    path.join('scripts', 'lib', 'git-commits.cjs'),
    path.join('scripts', 'lib', 'config.cjs'),
  ]) {
    pairs.push([path.join('assets', script), script])
  }
  return pairs
}

test('this repo has its own tooling installed', () => {
  assert.ok(fs.existsSync(path.join(ROOT, '.claude')), '.claude/ exists — run `skittership init`')
  assert.ok(
    fs.existsSync(path.join(ROOT, 'skittership.config.json')),
    'skittership.config.json exists',
  )
})

test('installed copies are byte-identical to the shipped assets', () => {
  for (const [source, installed] of installedPairs()) {
    assert.ok(fs.existsSync(path.join(ROOT, installed)), `${installed} is installed`)
    assert.strictEqual(
      read(installed),
      read(source),
      `${installed} has drifted from ${source} — run \`node bin/skittership.js update\``,
    )
  }
})

test('the CLAUDE.md section matches the shipped section', () => {
  const claudeMd = read('CLAUDE.md')
  const section = read(path.join('assets', 'claude-md-section.md')).trim()
  assert.ok(claudeMd.includes('<!-- skittership:start -->'), 'managed block present')
  assert.ok(
    claudeMd.includes(section),
    'CLAUDE.md section has drifted — run `node bin/skittership.js update`',
  )
})

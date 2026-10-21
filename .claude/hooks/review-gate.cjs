#!/usr/bin/env node
'use strict'

/**
 * Review gate — the harness half.
 *
 * `/spec-next` refuses to build the next phase while a review is owed, but a
 * skill is prose: it can be chained past, typed around, or simply not read. So
 * a phase ending is also enforced one level down, where a `git commit` is a
 * tool call the harness has to ask about first.
 *
 * THIS SCRIPT DECIDES NOTHING. It reads the tool call, hands the command line
 * to `spec-env review gate --check --for-command`, and turns one exit status
 * into an answer. Every judgement — is this a commit, is a verdict owed, is
 * this project even using the gate — lives in the engine, where it is unit
 * tested. A hook with its own opinions is a second implementation that nothing
 * can test and nobody remembers to update.
 *
 * IT FAILS OPEN, EVERYWHERE. No engine on the machine, an unreadable payload, a
 * repo with no isolation, a spec it cannot resolve, a crash of its own — all of
 * them allow the commit. Blocking one is an accusation
 * (`.claude/rules/negative-checks.md`), and the only thing worth accusing on is
 * the engine saying, positively, that this spec owes a verdict. Being wrong the
 * other way costs one unreviewed commit, on a gate the skills also enforce;
 * being wrong this way costs someone their commit with no idea why.
 */

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

// Let the call through, saying nothing. Exit 0 with no JSON is "no opinion" —
// the tool proceeds exactly as if this hook did not exist, which is what almost
// every invocation must do.
function allow() {
  process.exit(0)
}

/**
 * Refuse, and say what would clear it.
 *
 * The JSON route rather than exit-2, because the reason reaches **Claude** —
 * which is who has to act on it. A commit blocked with no route onward is how a
 * gate gets switched off wholesale instead of answered, so the three exits are
 * named in the refusal itself.
 */
function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    }) + '\n',
  )
  process.exit(0)
}

function readPayload() {
  try {
    const raw = fs.readFileSync(0, 'utf8')
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    // Unreadable or unparseable stdin is the cannot-tell case, not evidence.
    return null
  }
}

/**
 * Where the engine is, in the order most likely to be right. Pure but for the
 * existence check.
 *
 * A hook process does not inherit a package manager's `node_modules/.bin` on
 * PATH, so the local install is looked for by path first — walking up from the
 * project, because a git worktree's checkout has its own `node_modules`. PATH
 * is the fallback for a global install, and `SKITTERSPEC_BIN` overrides
 * everything for anyone whose layout is neither.
 */
function findEngine(projectDir) {
  if (process.env.SKITTERSPEC_BIN) return process.env.SKITTERSPEC_BIN
  let at = projectDir
  for (let i = 0; i < 6 && at; i++) {
    for (const name of ['skitterspec', 'skitterspec-linear']) {
      const candidate = path.join(at, 'node_modules', '.bin', name)
      if (fs.existsSync(candidate)) return candidate
    }
    const up = path.dirname(at)
    if (up === at) break
    at = up
  }
  return 'skitterspec'
}

function main() {
  const payload = readPayload()
  if (!payload) allow()

  // Only Bash runs a commit. A matcher is configured too, but a hook that is
  // reached some other way must still be inert rather than guessing.
  if (payload.tool_name !== 'Bash') allow()

  const command = payload.tool_input && payload.tool_input.command
  if (typeof command !== 'string' || !command.trim()) allow()

  // The commit's own directory decides which spec this is about — a worktree is
  // its own checkout, and the answer differs per worktree.
  const cwd = typeof payload.cwd === 'string' && payload.cwd ? payload.cwd : process.cwd()

  const result = spawnSync(
    findEngine(cwd),
    ['spec-env', 'review', 'gate', '--check', '--for-command', command, '--dir', cwd],
    { cwd, encoding: 'utf8', timeout: 8000 },
  )

  // No engine, a crash, a timeout — all cannot-tell. `status` is null when the
  // process never ran or was killed, and neither is a refusal.
  if (result.error || result.status === null) allow()
  if (result.status !== 1) allow()

  deny(
    (result.stdout || '').trim() +
      '\n\nThis phase is waiting on a verdict. Relay these to the operator ' +
      'rather than choosing one: press a verdict on the page, /spec-reviewed if ' +
      'a pass is already waiting, or /spec-skip "<reason>" to move on with the ' +
      'reason recorded.\n\nAll three are theirs to type. /spec-skip is the same ' +
      'exit as \'skitterspec spec-env review skip "<reason>"\' — a command ' +
      'rather than an incantation, because the long form is what nobody retypes ' +
      'and a gate with an unreachable exit gets switched off wholesale instead ' +
      'of answered.',
  )
}

// Guarded so the pieces above can be required and tested without the script
// reading stdin and exiting.
if (require.main === module) {
  try {
    main()
  } catch {
    // Even a bug in this file lets the commit through.
    allow()
  }
}

module.exports = { findEngine }

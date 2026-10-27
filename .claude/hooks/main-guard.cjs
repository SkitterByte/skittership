#!/usr/bin/env node
'use strict'

/**
 * Main guard — the harness half.
 *
 * `main` is where work **lands**, not where it happens. The skills say so, and
 * a skill is prose: it can be chained past, typed around, or simply not read.
 * So the rule is also enforced one level down, where an `Edit` or a `Write` is
 * a tool call the harness has to ask about first.
 *
 * IT REFUSES THE FIRST WRITE, NOT THE COMMIT, and that is the whole reason it
 * is a different hook from `review-gate.cjs` rather than another branch inside
 * it. Nothing has been written when this fires, so the fix costs one command —
 * `/no-spec <name>` and carry on. A commit-time gate fires once the work
 * already exists in the primary checkout, and in worktree mode moving it is the
 * genuinely painful part: the primary checkout cannot `switch -c` out from
 * under the other worktrees.
 *
 * THIS SCRIPT DECIDES NOTHING. It reads the tool call, hands the directory to
 * `spec-env main check`, and turns one exit status into an answer. Every
 * judgement — is isolation configured, is this the primary checkout, is HEAD
 * the base branch, is an allow in force — lives in the engine, where it is unit
 * tested. A hook with its own opinions is a second implementation that nothing
 * can test and nobody remembers to update.
 *
 * IT FAILS OPEN, EVERYWHERE, for the same reasons `review-gate.cjs` does and
 * with more at stake, because this one fires far more often. No engine, an
 * unreadable payload, a repo with no isolation, a crash of its own — all of
 * them allow the write. Being wrong the permissive way costs one edit on a rule
 * the skills also carry; being wrong the other way costs someone their work
 * with no idea why (`.claude/rules/negative-checks.md`).
 */

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

// Let the call through, saying nothing. Exit 0 with no JSON is "no opinion" —
// the tool proceeds exactly as if this hook did not exist, which is what the
// overwhelming majority of invocations must do.
function allow() {
  process.exit(0)
}

/**
 * Refuse, and say what to do instead.
 *
 * The JSON route rather than exit-2, because the reason reaches **Claude** —
 * which is who has to act on it, by moving the work rather than by asking the
 * user to switch the guard off. The exits are named in the refusal itself.
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
 * existence check. Identical to `review-gate.cjs`'s, deliberately: a hook
 * process does not inherit a package manager's `node_modules/.bin` on PATH, so
 * the local install is looked for by path first — walking up from the project,
 * because a git worktree's checkout has its own `node_modules`.
 */
function findEngine(projectDir) {
  if (process.env.SKITTERSPEC_BIN) return process.env.SKITTERSPEC_BIN
  let at = projectDir
  for (let i = 0; i < 6 && at; i++) {
    for (const name of ['skitterspec', 'skitterspec-linear', 'skitterspec-jira', 'skitterspec-github', 'skitterspec-azure-boards']) {
      const candidate = path.join(at, 'node_modules', '.bin', name)
      if (fs.existsSync(candidate)) return candidate
    }
    const up = path.dirname(at)
    if (up === at) break
    at = up
  }
  return 'skitterspec'
}

// The tools that write a file. A matcher is configured too, but a hook that is
// reached some other way must still be inert rather than guessing.
//
// WHAT WOULD FOOL THIS: a write that does not go through a write TOOL — a shell
// heredoc, `sed -i`, an editor outside the session. Those are left unguarded on
// purpose. Covering them would mean parsing arbitrary shell for filesystem
// effects, which cannot be done reliably, and the failure mode of getting it
// wrong is refusing a command that has nothing to do with writing files. The
// skills carry the rule for everything this matcher cannot see.
const WRITE_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit', 'MultiEdit'])

// The path a write tool names: `file_path` for Edit, Write and MultiEdit,
// `notebook_path` for NotebookEdit. Anything else is no path at all.
function writeTarget(input) {
  if (!input || typeof input !== 'object') return null
  for (const key of ['file_path', 'notebook_path']) {
    if (typeof input[key] === 'string' && input[key]) return input[key]
  }
  return null
}

function main() {
  const payload = readPayload()
  if (!payload) allow()

  if (!WRITE_TOOLS.has(payload.tool_name)) allow()

  // A worktree is its own checkout, and only the primary one is this guard's
  // business. `cwd` is where the session stands; the target below is where the
  // write lands, and the engine prefers it.
  const cwd = typeof payload.cwd === 'string' && payload.cwd ? payload.cwd : process.cwd()
  const session = typeof payload.session_id === 'string' ? payload.session_id : ''

  const argv = ['spec-env', 'main', 'check', '--dir', cwd]
  if (session) argv.push('--session', session)
  // The FILE decides where the write lands, not the session's directory. Judged
  // on `cwd` alone, a session on the base branch was refused its own scratchpad
  // under /tmp, and a session in a worktree could write into the primary
  // checkout unseen. No path in the payload → the engine judges `cwd`, as before.
  const target = writeTarget(payload.tool_input)
  if (target) argv.push('--path', target)

  const result = spawnSync(findEngine(cwd), argv, { cwd, encoding: 'utf8', timeout: 8000 })

  // No engine, a crash, a timeout — all cannot-tell. `status` is null when the
  // process never ran or was killed, and neither is a refusal.
  if (result.error || result.status === null) allow()
  if (result.status !== 1) allow()

  deny((result.stdout || '').trim())
}

// Guarded so the pieces above can be required and tested without the script
// reading stdin and exiting.
if (require.main === module) {
  try {
    main()
  } catch {
    // Even a bug in this file lets the write through.
    allow()
  }
}

module.exports = { findEngine, WRITE_TOOLS, writeTarget }

'use strict'

/**
 * Provenance for the files skittership installs into a consumer project.
 *
 * The manifest answers one question an upgrade turns on: is this file different
 * because the consumer edited it, or because it is an old copy of ours? Without
 * a record of what we last wrote, those two are indistinguishable, and treating
 * them the same means overwriting a consumer's work without asking.
 *
 * Shape, written to the consumer root:
 *
 *   {
 *     "installedVersion": "2.0.3",
 *     "files": { "scripts/generate-changelog.cjs": "sha256-…" }
 *   }
 *
 * COMMIT THIS FILE. It is how a teammate's `update` knows what the last one
 * wrote; ignoring it puts every collaborator back to "cannot tell".
 */

const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const MANIFEST_FILE = '.skittership-manifest.json'

/**
 * Hash the content we are about to WRITE, never the file re-read from disk.
 *
 * Re-reading routes the bytes through whatever the checkout does to them — a
 * core.autocrlf that rewrites line endings would make a freshly installed file
 * hash differently from the content we just wrote, and phase 2 would read that
 * as "the consumer edited this" on an install nobody touched.
 */
function hashContent(content) {
  return `sha256-${crypto.createHash('sha256').update(content, 'utf8').digest('hex')}`
}

function manifestPath(dir) {
  return path.join(dir, MANIFEST_FILE)
}

/**
 * Read a consumer's manifest, or null when there isn't a usable one.
 *
 * THE ABSENCE IS NOT EVIDENCE. A null here — and a path missing from `files` on
 * a manifest that does exist — means "nobody was recording", not "the consumer
 * edited this" and not "this is ours to overwrite". Consumers installed before
 * provenance shipped have no manifest at all, and one installed today has no
 * entry for a file added next year. Callers must route both to a "cannot tell"
 * branch that does the harmless thing (see .claude/rules/negative-checks.md
 * rule 2 — do not read an absence as a finding).
 *
 * Corrupt JSON is treated the same way: unreadable is a kind of absent, and a
 * throw here would turn a scratched file into a failed install.
 */
function readManifest(dir) {
  try {
    const raw = fs.readFileSync(manifestPath(dir), 'utf8')
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return {
      installedVersion:
        typeof parsed.installedVersion === 'string' ? parsed.installedVersion : null,
      files: parsed.files && typeof parsed.files === 'object' ? parsed.files : {},
    }
  } catch {
    return null
  }
}

/** Recorded hash for one managed path, or null when nothing was recorded. */
function recordedHash(manifest, relPath) {
  if (!manifest || !manifest.files) return null
  const hash = manifest.files[relPath]
  return typeof hash === 'string' ? hash : null
}

/**
 * Write the manifest. `files` is keyed by consumer-relative POSIX path so the
 * same project produces the same manifest on Windows and macOS.
 */
function writeManifest(dir, { installedVersion, files }) {
  const sorted = {}
  for (const key of Object.keys(files).sort()) sorted[key] = files[key]
  const body = { installedVersion, files: sorted }
  fs.writeFileSync(manifestPath(dir), `${JSON.stringify(body, null, 2)}\n`)
}

/** Normalise a path for use as a manifest key (POSIX separators). */
function manifestKey(relPath) {
  return relPath.split(path.sep).join('/')
}

/**
 * Classify a managed file against what we last wrote.
 *
 * Named to match skitterspec's `managedState`, so a consumer with both packages
 * installed does not meet two different answers to the same question.
 *
 *   'absent'     — not installed, or the consumer deleted it → write it
 *   'identical'  — already byte-identical to the new asset   → nothing to do
 *   'ours'       — matches the hash we recorded              → safe to overwrite
 *   'customized' — differs from what we wrote                → KEEP
 *   'unknown'    — nothing recorded, so we cannot tell       → KEEP
 *
 * 'unknown' is the case that must never be collapsed into 'ours'. A consumer
 * installed before provenance shipped has no manifest, and one installed today
 * has no entry for a file added next year — neither is evidence that the file
 * is ours to replace. Being wrong toward keeping costs a stale file the
 * consumer can re-take with --force; being wrong toward overwriting costs them
 * work they cannot get back. See .claude/rules/negative-checks.md rule 4.
 *
 * 'identical' is checked BEFORE the hash so a consumer whose edit happens to
 * match the new asset is reported as unchanged rather than accused of drifting.
 */
function managedState({ exists, onDisk, content, recorded }) {
  if (!exists) return 'absent'
  if (onDisk === content) return 'identical'
  if (!recorded) return 'unknown'
  return hashContent(onDisk) === recorded ? 'ours' : 'customized'
}

module.exports = {
  MANIFEST_FILE,
  managedState,
  hashContent,
  manifestKey,
  manifestPath,
  readManifest,
  recordedHash,
  writeManifest,
}

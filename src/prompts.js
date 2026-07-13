'use strict'

/**
 * Interactive setup flow for `skittership init`, built on the `prompts`
 * (terkelg) library. Only required from the TTY branch of the CLI — the
 * non-interactive path (flags / --yes / CI) never loads this module, so the
 * test suite never imports the interactive UI.
 *
 * `seed` is the resolved release config (existing file merged with any flags),
 * used to pre-fill every answer. Returns `{ release }`.
 */

async function promptSetup({ seed, pkgExists }) {
  const prompts = require('prompts')

  let cancelled = false
  const onCancel = () => {
    cancelled = true
    return false // stop the prompt chain
  }

  const questions = [
    {
      type: 'confirm',
      name: 'changelogEnabled',
      message: 'Generate a dev-facing CHANGELOG from commit subjects?',
      initial: seed.changelog.enabled,
    },
    {
      type: (prev) => (prev ? 'text' : null),
      name: 'changelogFile',
      message: 'Changelog filename',
      initial: seed.changelog.file,
    },
    {
      type: 'confirm',
      name: 'releasesEnabled',
      message: 'Generate user-facing release notes from Release-Note: footers?',
      initial: seed.releases.enabled,
    },
    {
      type: (_prev, values) => (values.releasesEnabled ? 'text' : null),
      name: 'releasesFile',
      message: 'Release-notes filename',
      initial: seed.releases.file,
    },
    {
      type: (_prev, values) => (values.releasesEnabled ? 'text' : null),
      name: 'productName',
      message: 'Product name (shown in the release-notes header)',
      initial: seed.releases.productName,
    },
  ]

  if (pkgExists) {
    questions.push({
      type: 'confirm',
      name: 'versionHook',
      message: 'Wire an npm "version" hook to regenerate these on release?',
      initial: seed.versionHook,
    })
  }

  const ans = await prompts(questions, { onCancel })
  if (cancelled) throw new Error('Setup cancelled')

  return {
    release: {
      changelog: {
        enabled: ans.changelogEnabled,
        file: ans.changelogFile || seed.changelog.file,
      },
      releases: {
        enabled: ans.releasesEnabled,
        file: ans.releasesFile || seed.releases.file,
        productName: ans.productName || seed.releases.productName,
        scopeAreas: seed.releases.scopeAreas,
      },
      versionHook: pkgExists ? Boolean(ans.versionHook) : seed.versionHook,
    },
  }
}

module.exports = { promptSetup }

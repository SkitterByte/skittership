---
description: Permit or forbid publishing this spec's review for a reader off your network — bare toggles it, `on`/`off` set it explicitly
argument-hint: "[on | off]"
allowed-tools: Bash(pnpm exec skitterspec spec-env review allow remote:*)
disable-model-invocation: true
---
!`pnpm exec skitterspec spec-env review allow remote --set "$ARGUMENTS"`

Relay the engine output above verbatim. Add nothing to it.

**Then one thing, and only when the engine asked for it.** Where the output
carries a `review:` and a `publish:` line, typing this command **is** the ask
to publish that page: the banner named this command beside a review the reader
could not reach, so the link is what they are waiting for. Publish it exactly
as `/spec-diff` §6 describes (run the `publish:` command, publish the copy it
names with a store, write the URL file), then re-emit the review banner with
all three tiers, `remote` now carrying the URL. A wait already running keeps
running; do not restart it or the server. If the harness refuses the publish,
say so in one line and keep the banner as it was, because local and network
still work.

With no `publish:` line, run nothing else. Nothing has a page to publish, or
the tier was turned off.

**Bare toggles.** That is the common case: you are looking at a render whose
`remote:` line says which way it currently is, and what you want is the other
one. `on` and `off` are there for when you are not looking at it.

**It is per spec.** The engine resolves the spec from the worktree you are
standing in and records the permission in the gitignored review store, so
the base branch is untouched and no other spec may publish because of it.
`skitterspec spec-env review allow remote --project` is the committed,
every-spec form, for a team that wants it.

**A published page is one skitterspec cannot delete**, and a verdict pressed
on one needs `/spec-reviewed`, because nothing pushes from an artifact's store
into a conversation.

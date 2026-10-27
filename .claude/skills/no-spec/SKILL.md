---
name: no-spec
description: Do a piece of work that genuinely has no spec — a version bump, a lockfile refresh, a rename — on its own branch in its own worktree, reviewed on a page and landed on the verdict. Never on the base branch. Use when the user says "/no-spec", or asks for mechanical work that does not warrant a spec and should not sit on main.
---

# /no-spec — work with no spec, off the base branch

> Stay silent while this runs — speak only to ask something you cannot answer
> yourself, or to report a failure at the moment it happens. Read
> `.claude/rules/spec-reports.md` before reporting; it defines the block this
> skill ends with.

Some work has no spec and should not have one. Bumping four projects to a new
version, refreshing a lockfile, a rename across a package: writing a one-phase
document for it produces a spec nobody reads, and `spec --quick` would have been
that under a friendlier name.

**What it is not is an excuse to work on the base branch.** Two things follow
from doing it there, and both cost someone else something: the tree is left
dirty, so every in-flight spec has to replay over it and a release cannot be
cut; and no page is ever rendered, so the work gets no review at all. This skill
is the same lane every spec uses — branch, worktree, page, verdict, land —
with the document left out because there is nothing to put in it.

**It writes no spec, moves nothing through the lifecycle, and mints no ticket.**
There is no bucket, no status, no phase index and no `Refs:` trailer. If you
find yourself wanting any of those, the work wanted `/spec`.

## 1. Name it

Take a kebab-case name from the invocation. It becomes the branch
(`chore/<name>`) and the worktree folder, so it should describe the work:
`bump-deps`, `rename-widget-props`, `lockfile-refresh`.

**Ask if none was given.** Do not invent one — a name nobody chose is a branch
nobody recognises a week later, and this is the one thing the skill cannot infer
from the work.

**Refuse a name that is already a spec**, which the engine does for you: two
things answering to one name is how a teardown removes the wrong tree.

## 2. Provision

```
skitterspec spec-env nospec <name>
```

It records the name as a **specless branch** and prints the plan. Run the
`git worktree add` it prints, then move this session into the worktree with a
plain `cd` and run the `then, run:` line where there is one:

```
cd "<worktreePath>" && skitterspec spec-env bootstrap <name>
```

That seeds the project's gitignored files into the worktree, then runs its
`setup`, and stops at the first failing step, naming it. There is no stack: a
specless branch never gets an env file or Docker. The Bash working directory persists between calls, so from
here on the work happens on its own branch.

**The worktree steps are the engine's to run, never yours.** Seeding the
gitignored files, the env file, `setup` and the stack all happen inside
`skitterspec spec-env bootstrap <name>` — one call that names no file. Do not
reconstruct them as shell: they used to be printed that way, an agent's copy was
never faithful, and a project's secrets hook refused every rewrite that named a
`.env` path. `bootstrap --plan` says what it would do, for reading only.

**Confirm the move landed** rather than reading silence as success
(`.claude/rules/negative-checks.md` rule 1): `skitterspec spec-env resolve` with
no argument must name this branch, and report `no spec` as its bucket. If it
names something else, stop — say so and do nothing further, because the failure
this guards against is a session that writes a branch's worth of work into the
primary checkout while everything looks normal at the time.

**The record is not bookkeeping.** It is the only thing that makes a name with
nothing under `specs/**` resolvable, so without it `review`, `integrate`, `down`
and a bare `resolve` would all refuse this branch as a spec that does not exist.

**Where isolation is not configured** (`specs/.core/env.config.json` absent)
there is no worktree to make. Say so in one line and stop: this skill exists to
move work off the base branch, and without isolation there is nowhere to move it
to. Do not silently do the work in place — that is the outcome it exists to
prevent.

## 3. Do the work

Follow the project's rules in `.claude/rules/*.md` and `CLAUDE.md`, exactly as a
phase would. Tests are part of the work and not after it: extend or add whatever
covers the change, then run the project's typecheck and test commands. Do not
proceed to the page until they are green — and if they cannot be made green, say
so where it happens and report `❌`.

**Mechanical does not mean untested.** A version bump that breaks a build is the
commonest thing in this lane, which is why the gate is the same one a phase has.

## 4. Render the page and arm the gate

The work is done, the tests are green, and nothing is committed yet:

```
skitterspec spec-env review <name> --buttons nospec --run-reviewers
```

**This is free.** The engine reads git and splices text into a template; the
diff never passes through you however large it is.

`--buttons nospec` offers `Commit & Land` and `Commit`. It is its own set
because neither of the usual pairs fits: there is no next phase to continue and
nothing to put in flight.

**Then arm the gate:**

```
skitterspec spec-env review arm <name>
```

**This skill arms, and `/spec` does not.** That asymmetry is the rule in
`.claude/rules/spec-reports.md` rather than a choice made here: the gate asserts
that *finished work* owes an answer, and this is finished work. A written spec
owes no phase, so authoring arms nothing.

**Then offer `/spec-diff`. Do not run it.** The written review costs real tokens
because writing it means reading the diff, and that spend is the user's call.

## 5. Wait for the verdict

**The wait is a command. Do not write one.**

1. **Note the moment you start waiting**, as an ISO timestamp. That instant is
   the whole scope of what you may claim.
2. **Run the engine's wait, and end your turn** — under the harness's
   persistent watch primitive where one exists, else in the background
   (`.claude/rules/spec-reports.md` carries the preference):

   ```
   skitterspec spec-env review wait <name> --since <the timestamp>
   ```

   Pass no timeout. A reader who walks away from a diff is the normal case, and
   a bounded watch once lost a verdict to a lunch break.
3. **On waking, let the engine pick:**

**A watch that dies is re-armed on the same window**, silently and bounded by
the age of that window — `.claude/rules/spec-reports.md` carries the contract,
including when to stop and what the banner says instead. Do not restate it
here.

   ```
   skitterspec spec-env review <name> --claim-since <the timestamp> --json
   ```

   It claims the one pass that arrived inside the window, acts on nothing when
   none did, and refuses to choose when two did.

Relay the engine's **stack** — the `local:`, `network:` and `remote:` lines, all
three, in that order — never the bare `page:` path.
`.claude/rules/spec-reports.md` carries the shape and why every tier is named.

### Route on the verdict

- **`commit-land`** — hand off to `review.commitWith` (`/commit` by default),
  then land it, then tear the worktree down:

  ```
  skitterspec spec-env integrate <name>
  skitterspec spec-env down <name>
  ```

  `integrate` plans a rebase onto the base branch and a `merge --ff-only`; run
  the commands it prints. `down` removes the worktree, deletes the branch and
  **forgets the specless record**, which is what stops a torn-down name going on
  answering to every verb with a path that is no longer there.

  **Between the two, run the after-land commands.** Where the `integrate` plan
  ends with a `then, in the primary checkout (<path>), run:` section — the
  project's `afterLand` — run those commands there, in order, once the
  fast-forward has succeeded, and on an already-landed no-op too. Run only the
  lines under that heading; a `skipped (nothing in the land matched):` block
  lists conditional entries this land did not need, and is information, never
  commands. A lockfile
  refresh is exactly the land that needs them.
  **Stop at the first non-zero exit**: the run becomes `⚠️`, naming the command that failed and the ones that
  did not run, and it **never undoes the land and never stops the `down`**.

  **If the rebase conflicts, stop.** `git rebase --abort`, leave the commit on
  the branch, tear nothing down, and report `❌` with the conflict — there is a
  standing worktree, which is what separates `❌` from `⏸`.

- **`commit`** — the same commit, and **stop there**. The branch stands with the
  work on it, which is the right ending for work that turned out to be bigger
  than one sitting. Say in `Next` that `/spec-to-main` lands it later.
- **`changes`** — work the notes, record a resolution for each one so the next
  render shows it struck through with what changed, then
  **re-render and wait again**. The reader is still holding a decision.
- **`discuss`** — report and talk. Claim nothing, change nothing, tear nothing
  down.

**Never tear the worktree down on anything but `commit-land`.** It is the only
verdict that says the work is finished, and the cost of being wrong is somebody
else's branch removed from disk.

## Report

End with the block defined in `.claude/rules/spec-reports.md`. That file carries
the shape; this section carries only what is specific here.

**Verdicts**

- `✅` — the work is done, the tests are green, and the verdict was acted on.
- `⚠️` — done and green, with something worth knowing — an after-land command
  that failed, for one. `Notes` carries what the after-land commands ran and
  skipped, or where they stopped; nothing about them when none are configured.
- `❌` — the tests are red, or the land failed part-way. Quote the failure and
  say what is standing.
- `⏸` — refused before acting: no name given, the name is already a spec, the
  `cd` did not take, or the project has no isolation. Nothing changed.

**Fields:** `Branch` · `Built` · `Tests` · `Notes` · `Landed` · `Worktree` ·
`Review` · `Follow-ups` · `Next`

**No `Tracker` and no `Spec`, ever.** There is no ticket and no document, and a
row saying so would report an absence with nothing behind it — which
`spec-reports.md` forbids for exactly this reason.

`Landed` and `Worktree` appear only once a verdict has been acted on; a run
waiting on the page has neither, and **omits the `Review` row** in favour of the
banner, which carries the counts, the stack and the two exits:

---

## ⏸ Review ready — &lt;N&gt; files, +&lt;a&gt; −&lt;d&gt;

- **local** — &lt;the `local:` URL&gt;
- **network** — &lt;the `network:` URL, or off with the command that turns it on&gt;
- **remote** — &lt;the `remote:` URL, or off with the command that turns it on&gt;

I'm holding here until you send a verdict — the wait covers local and network.

`Commit & Land` finishes it · `Commit` keeps the branch

---

There `Next` names the page rather than a command, because the button is what
carries the work on.

**`Follow-ups` is where a spec gets offered.** This lane is for work with no
spec, so the thing it most often surfaces is work that *does* want one. Offer to
`/spec` it on the spot — and `/spec` provisions its own worktree, so there is
no caveat about where to write it.

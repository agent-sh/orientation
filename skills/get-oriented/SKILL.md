---
name: get-oriented
description: "Use when judging or planning around code not written this session: repo state, next steps, bug/dead-code calls, cleanup, or adding near existing code. Run orientation history before git/diff/README recon; after compaction, treat pre-compact work as unfamiliar."
---

# Get Oriented Before You Judge Unfamiliar Code

When you land in code you did not write this session, you do not know its
story yet. The trap is reading the code, README, diffs, and tests and then
reconstructing a plausible story. That reconstruction is often wrong. A tidy
README and a clean compile can make abandoned work look finished, or make
active work look stale.

This skill pulls the real orientation history from normalized agent work
events: the human goal behind the code, whether it shipped, how recently it was
touched, and which files moved with it.

## Frontmatter Safety

Keep this skill's YAML frontmatter to `name` and `description` only. Do not put
tool allowlists, arrays, nested objects, or host-specific metadata there. Some
hosts accept richer skill metadata and others reject it; this skill needs to
load everywhere. Treat the commands below as usage guidance, not frontmatter
schema.

Expected tool families when the host supports scoped permissions:

- `git rev-parse`
- `orientation`
- `node`
- file reads

## The Rule

The trigger is mechanical, not emotional. Ask one thing: did I edit this code
myself in this un-compacted session, and do I still recall its history? If no
to either, and you are about to answer a question about it or change it, run
orientation first.

Always run it before ordinary git/readme/diff recon when:

- answering "what's next here?", "what's the state?", or "what's left?"
- judging code as a bug, dead leftover, stale, or trustworthy
- deleting, gutting, or cleaning up something whose purpose you are inferring
- adding a function or feature into an existing file or area

After a compaction, "I wrote this earlier" is not a valid skip. Compaction
replaces the earlier turns with a lossy summary. Treat pre-compact work like
someone else's history and ask orientation for the actual goals and recency.

## How

```bash
git rev-parse --show-toplevel
orientation provenance "<root>" "<file>"
orientation related "<root>" "<file>"
```

Use `provenance` when judging, deleting, or understanding existing code. Use
`related` before adding near existing code.

If `orientation` is not on `PATH`, use the installed engine fallback. Prefer
the Eigen-local runtime when present, then the legacy compatibility path:

```bash
node ~/.eigen/orientation/consume.js --provenance "<root>" "<file>"
node ~/.eigen/orientation/consume.js --related "<root>" "<file>"
node ~/.claude/action-graph/consume.js --provenance "<root>" "<file>"
node ~/.claude/action-graph/consume.js --related "<root>" "<file>"
```

`<file>` may be a relative path, basename, or absolute path.

## Reading Provenance

The verdict line is recency-first. Uncommitted work is not abandoned by
default; in-flight work is usually uncommitted.

- `ACTIVELY IN FLIGHT`: someone is delivering this now. Continue it or ask;
  do not scrap it as stale.
- `DELIBERATE WORK`: committed, intentional work. Do not delete as cruft
  unless callers, exports, and tests prove the specific code is dead.
- `POSSIBLY STALE`: uncommitted and untouched for a long time. Verify with the
  user or real signals before treating it as dropped.
- `No recorded work`: silence is not permission. Judge from callers, exports,
  tests, and behavior.
- `Coupled neighbors`: files usually edited alongside this one. Check them
  before treating the target as isolated.

## Reading Related

Read the goals that already built in this area. Extend or reconcile with those
decisions instead of duplicating or contradicting them.

Read sibling files that orientation reports. Grep those files and the target
for the thing you are about to add before writing it.

## After

Say what the history showed and how it changed your read. If the orientation
verdict and the code seem to conflict, surface that conflict with the goal
cited instead of acting on your reconstruction alone.

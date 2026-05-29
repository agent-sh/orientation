---
name: get-oriented
description: "Use when judging or planning around code not written this session — 'what's next', 'what's the state', 'is this a bug', 'is this dead', or before deleting or adding near it. Run FIRST, before git status/diffs/README: those show only committed history, but live work is uncommitted and invisible to recon. Trigger on the situation, not on confidence — a clean compile and tidy README hide missing history. After a compact, run even for this-session work: the summary is lossy, pre-compact detail unrecallable."
allowed-tools: Bash(git rev-parse:*), Bash(node:*), Read
---

# Get Oriented Before You Judge Unfamiliar Code

When you land in code you didn't write this session — fresh start, post-compact, someone else's work — you don't know its story. The trap: you read the code, the README, the diffs, and you *reconstruct* a story. That reconstruction is often wrong. A tidy README and a clean compile make abandoned work look done, and make in-flight work look finished. You then act on the wrong story.

This skill pulls the **real** history from the action-graph (a record of past sessions in this project): the actual goal a human was pursuing when this code was written, whether it shipped, how recently it was touched, and what files moved with it. Facts, not your guess.

## The rule (do NOT wait to "feel unsure")

The decision is **mechanical, not a feeling**. Ask one thing: *did I edit this code myself this session AND do I still recall its history?* If no to either, and you're about to answer a question about it or change it → run this skill FIRST.

Don't rely on catching yourself mid-doubt. The failure mode is feeling *sure* — a clean compile and a tidy README make the missing history invisible, so the gap never registers as doubt. By the time you'd "feel" it, you've already concluded wrong. Trigger on the situation, not the sensation.

**After a compact, "I wrote this this session" is NOT a valid skip.** A compaction replaces the earlier turns with a lossy summary — work you did *before* the compact is your own, but you can no longer recall it accurately; the summary drops detail, exact goals, and which attempts stalled. Treat pre-compact work like someone else's history: the action-graph still holds the real goals and recency (the PreCompact hook refreshes it just before compaction), so look it up instead of trusting the summary. The danger is the opposite of the fresh-session case — here you *feel* you know the code because "I built it", but the recall is gone.

**Always run it, before any git/Read recon, when:**
- answering "what's next here?", "what's the state?", "what's left?" — these are planning questions but answering them *is* judging current state
- judging code — "is this a bug?", "is this dead/leftover?", "can I trust this?"
- deleting / gutting / "cleaning up" something whose purpose you're inferring
- adding a function/feature into a file/area that already exists

**Why FIRST, not after recon:** `git log` shows only *committed* history. Live, in-flight work is uncommitted — invisible to git status, diffs, and the README. Running four recon commands feels thorough but can entirely miss the active thread; the action-graph is the only source that tracks uncommitted in-flight goals. Orient first, then recon fills in detail.

## How

```
git rev-parse --show-toplevel          # project root
node ~/.claude/action-graph/consume.js --provenance "<root>" "<file>"   # judging / deleting / understanding
node ~/.claude/action-graph/consume.js --related    "<root>" "<file>"   # before adding near it
```

`<file>` takes any form — `src/auth.rs`, `auth.rs`, absolute.

## Reading `--provenance`

The verdict line is recency-first. **Uncommitted does NOT mean abandoned** — in-flight work is uncommitted by definition (you commit at the end).

- **⚠ ACTIVELY IN FLIGHT** (touched recently) — someone is delivering this right now. Don't treat as dead or stale; continue it or ask, don't scrap it. This is the case people get wrong.
- **⚠ DELIBERATE WORK** (committed, not recent) — built on purpose and shipped. Don't delete as cruft. A committed file can still hold one dead function, but the bar is now "I can show it's dead" (no callers/exports, tests pass), not "it looks unfamiliar".
- **POSSIBLY STALE (uncertain)** (uncommitted, untouched a long time) — *might* be paused, *might* be dropped. Verify with the user or real signals; uncommitted alone is never proof it's abandoned.
- **No recorded work** — silence isn't permission. Judge on the code (callers, exports, tests).
- **Coupled neighbors** — files usually edited alongside this one; check them for ripple before concluding it's isolated.

## Reading `--related` (before adding)

- **Goals that already built here** — read them; extend or reconcile instead of duplicating or contradicting an earlier decision.
- **Sibling files** — related logic likely lives here. Grep them + the target for what you're about to write, *before* writing it. The graph points at the area; you confirm the duplicate in the code.

## Examples

**Fires (situation matches):**
- "what's next for this repo?" on a project with uncommitted changes you didn't make → run `--provenance` on the changed files first. (Real case: the README roadmap said "structured output / scope" but the graph showed the live thread was a half-built model+indexing change — opposite conclusion.)
- "this function looks like dead leftover, safe to delete?" → `--provenance`; a recency verdict of ACTIVELY IN FLIGHT means stop.
- post-compact, asked to continue a feature → `--provenance` even though "you" built it; the summary lost which attempts stalled.

**Skips (do not run):**
- "fix this typo I just introduced" — wrote it this turn, recall intact.
- "add a brand-new file `metrics.rs`" — net-new, no existing area to orient on.
- continuing code you wrote earlier this same (un-compacted) session and still remember.

## After

Say what the history showed and how it changed your read. If a verdict and the code still seem to conflict, surface it to the user with the goal cited — don't act on your own reconstruction alone.

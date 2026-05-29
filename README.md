# orientation

**Stops an AI coding agent from guessing the story of code it didn't write this session — and acting on the wrong guess.**

A fresh or post-compact agent reads the code, the README, the diffs, and *reconstructs* a story. That reconstruction is often wrong: a tidy README and a clean compile make **abandoned** work look done and make **in-flight** work look finished. The agent then deletes deliberate work as "cruft", reinvents what already exists, or calls active development "abandoned".

orientation reconstructs the **real** history from Claude Code's own transcripts — the goal a human was actually pursuing, whether it shipped or is still in flight, how recently it was touched, and which files moved together — and hands it to the agent through the **`get-oriented`** skill at the moment it's about to judge unfamiliar code.

No model. No embeddings. Pure structural signal from the transcripts (validated: text similarity found *zero* useful links on real deictic prompts like "ok continue"; file-footprint found the threads).

## Install

```bash
npm install -g @agent-sh/orientation
```

`postinstall` (idempotent — safe to re-run):
1. copies the engine to `~/.claude/action-graph/`
2. installs the `get-oriented` skill to `~/.claude/skills/`
3. wires three Claude Code hooks into `~/.claude/settings.json`:
   - **SessionStart** → injects a thin pointer ("history exists; use get-oriented")
   - **Stop** + **PreCompact** → rebuild the graph (so post-compact reads are current)
4. seeds `~/.claude/action-graph/projects.txt` (the allowlist)

Then opt projects in — one cwd **prefix** per line:

```
echo /home/you/projects >> ~/.claude/action-graph/projects.txt
```

A prefix matches every repo (and nested repo) under it; each distinct project gets its own graph. Work normally — graphs refresh on session end and before every compaction.

## How it works

```
~/.claude/projects/**/*.jsonl        Claude Code transcripts (the source of truth)
        │  ingest.js      reparse → records (intent, edits, runs, commits, agent text)
        ▼
   raw.jsonl  → condense.js → episodes.json → graph.js → graph.json
        ▲                                                      │
   consume.js (get-oriented skill calls these) ◄───────────────┘
```

The graph: **goal** and **file** nodes; edges for `touched`, `coupled` (co-edit), `outcome` (committed/failed), and `resumes` (the same goal picked back up after a detour, found by IDF-cosine over file footprints — the connection text can't make).

## The skill in action

When the agent is about to **judge, plan around, delete, or add near** code it didn't write this session, `get-oriented` runs first and reads back a recency-first verdict:

- **⚠ ACTIVELY IN FLIGHT** — touched recently; someone is delivering this now. Don't scrap it. *(Uncommitted ≠ abandoned — in-flight work is uncommitted by definition.)*
- **⚠ DELIBERATE WORK** — committed, shipped; don't delete as cruft.
- **POSSIBLY STALE (uncertain)** — uncommitted and long-untouched; verify, don't assume dead.
- **Coupled neighbors / prior goals** — where related logic lives, so you extend instead of duplicate.

## CLI (manual queries)

```bash
orientation provenance <cwd> <file>   # history + verdict (judging / deleting)
orientation related    <cwd> <file>   # prior goals + sibling files (before adding)
orientation threads    <cwd>          # resume threads across detours
orientation coupled    <cwd> <file>   # files co-edited with this one
orientation refresh                   # rebuild graphs now
```

## Test

```bash
npm test        # synthetic end-to-end; asserts the recency verdict + thread invariants
```

## Known limits

- **File-level, not symbol/content.** Points at the area to read; it can't flag a literal duplicate line. Pair with grep/AST for that.
- **Verdict thresholds** (resume cosine ≥0.45, hub/passenger filters) calibrated on a handful of real projects, not labeled ground truth.
- **Staleness window** ≤ one session: graphs refresh on Stop/PreCompact, so a second session running *concurrently* can read slightly behind until the next boundary.
- **Activation is probabilistic.** `get-oriented` fires on the situation (categorical trigger), but it's a skill the model chooses to run, not a hard gate.

## License

MIT OR Apache-2.0

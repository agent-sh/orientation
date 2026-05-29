# Project Memory: orientation

> Reconstructs the real history of code (goal, shipped vs in-flight, coupled files) from Claude Code transcripts, surfaced to agents via the `get-oriented` skill — so they stop guessing the story of code they didn't write this session.

**Repository**: https://github.com/agent-sh/orientation

## Project Instruction Files

- `CLAUDE.md` is the project memory entrypoint for Claude Code.
- `AGENTS.md` is a byte-for-byte copy of `CLAUDE.md` for tools that read `AGENTS.md` (Codex CLI, OpenCode, Cursor, Cline, Copilot). Keep them identical.

## Layout

- `src/` — the engine (plain Node, no deps):
  - `classify.js` — shared: transcript event → record; commit-msg / agent-text / branch-marker extraction; noise filters.
  - `ingest.js` — reparse all allowlisted projects' transcripts → `raw.jsonl` (incremental via per-project mtime manifest).
  - `condense.js` — `raw.jsonl` → goal `episodes.json` + one-line prose.
  - `graph.js` — episodes → graph (`touched`/`coupled`/`outcome`/`resumes`); `--threads`, `--coupled`.
  - `consume.js` — SessionStart pointer inject; `--provenance`, `--related`, `--query`.
  - `refresh.sh` — ingest → condense → graph (called by Stop + PreCompact hooks).
- `skill/get-oriented/SKILL.md` — the user-facing skill.
- `install.js` — places engine at `~/.claude/action-graph/`, drops skill, wires hooks (idempotent).
- `bin/orientation` — CLI wrapper over the installed engine.
- `test/selftest.js` — synthetic end-to-end; `AG = ../src`.

## Critical rules

1. **Runtime home is `~/.claude/action-graph/`.** The engine, hooks, and skill all reference that absolute path. The repo is source; `install.js` deploys to the fixed location. `src/` scripts use `os.homedir()/.claude/action-graph` for data, NOT `__dirname`.
2. **No model, no deps.** Structural signal only (file footprint, co-edit, recency). Adding embeddings/AST was tested and rejected — it lost to file-overlap on deictic prompts. Keep it dependency-free.
3. **Verdict is recency-first.** Uncommitted ≠ abandoned. Recent touch → ACTIVELY IN FLIGHT. Never assert "abandoned" from absence-of-commit alone.
4. **Hooks idempotent.** `install.js` must never duplicate hooks or clobber unrelated settings; it matches on `action-graph` in the command string.
5. **`couple` map keys are NUL-joined (`\0`)** — filenames may contain spaces. Any code splitting a couple key splits on `'\0'`.
6. **Run `node test/selftest.js` after engine edits.** It guards the prior bugs: fail-then-pass≠FAILED, recency verdict (recent work not "abandoned"), resume cosine floor, thin-pointer inject.
7. **Skill description ≤512 chars, third-person, agnix-clean.** Body keeps second-person felt-need voice (that framing is what makes it fire); description does not.

## Lineage

Built and battle-tested in-place at `~/.claude/action-graph/` before extraction. Key findings that shaped it: text retrieval fails on deictic prompts (file-overlap wins); uncommitted-as-abandoned was a real harmful bug (fixed recency-first); skill activation needs categorical (situation-based) triggers, not "catch yourself" felt-state; post-compact, "I wrote this" is not a valid skip (recall is gone, graph still has it).

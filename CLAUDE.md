# Project Memory: orientation

> Reconstructs the real history of code (goal, shipped vs in-flight, coupled files) from Claude Code transcripts, surfaced to agents via the `get-oriented` skill — so they stop guessing the story of code they didn't write this session.

**Repository**: https://github.com/agent-sh/orientation

## Project Instruction Files

- `CLAUDE.md` is the project memory entrypoint for Claude Code.
- `AGENTS.md` is a byte-for-byte copy of `CLAUDE.md` for tools that read `AGENTS.md` (Codex CLI, OpenCode, Cursor, Cline, Copilot). Keep them identical.

## Layout

- `src/` — the engine (plain Node, no deps):
  - `paths.js` — shared runtime paths (`CLAUDE_CONFIG_DIR`, `ORIENTATION_HOME`, `ORIENTATION_PROJECTS_DIR`).
  - `classify.js` — shared: transcript event → record; commit-msg / agent-text / branch-marker extraction; noise filters.
  - `ingest.js` — reparse all allowlisted projects' transcripts → `raw.jsonl` (incremental via per-project mtime manifest).
  - `condense.js` — `raw.jsonl` → goal `episodes.json` + one-line prose.
  - `graph.js` — episodes → graph (`touched`/`coupled`/`outcome`/`resumes`); `--threads`, `--coupled`.
  - `consume.js` — SessionStart pointer inject; `--provenance`, `--related`, `--query`.
  - `refresh.sh` — ingest → condense → graph (called by Stop + PreCompact hooks).
- `skill/get-oriented/SKILL.md` — the user-facing skill.
- `install.js` — places engine in the runtime home, drops skill, wires hooks (idempotent).
- `bin/orientation` — CLI wrapper over the installed engine.
- `test/selftest.js` — synthetic end-to-end; `AG = ../src`.
- `test/install.js` — package install regression in a temp Claude config; never touches real `~/.claude`.

## Critical rules

1. **Runtime paths are centralized in `src/paths.js`.** Default runtime home is `~/.claude/action-graph/`, but `CLAUDE_CONFIG_DIR`, `ORIENTATION_HOME`, and `ORIENTATION_PROJECTS_DIR` are supported. Do not reintroduce hardcoded local user paths.
2. **No model, no deps.** Structural signal only (file footprint, co-edit, recency). Adding embeddings/AST was tested and rejected — it lost to file-overlap on deictic prompts. Keep it dependency-free.
3. **Verdict is recency-first.** Uncommitted ≠ abandoned. Recent touch → ACTIVELY IN FLIGHT. Never assert "abandoned" from absence-of-commit alone.
4. **Hooks idempotent.** `install.js` must never duplicate hooks or clobber unrelated settings; owned hooks carry `ORIENTATION_HOOK=1`, and legacy `action-graph` hooks are repaired in place.
5. **`couple` map keys are NUL-joined (`\0`)** — filenames may contain spaces. Any code splitting a couple key splits on `'\0'`. Keep the source as escaped `\\0`, not literal NUL bytes, so Git diffs stay text.
6. **Run `npm test` after engine or install edits.** It guards the prior bugs: fail-then-pass≠FAILED, recency verdict (recent work not "abandoned"), resume cosine floor, thin-pointer inject, frontmatter schema drift, and temp-only package install.
7. **Skill description ≤512 chars, third-person, agnix-clean.** Body keeps second-person felt-need voice (that framing is what makes it fire); description does not.

## Lineage

Built and battle-tested in-place at `~/.claude/action-graph/` before extraction. Key findings that shaped it: text retrieval fails on deictic prompts (file-overlap wins); uncommitted-as-abandoned was a real harmful bug (fixed recency-first); skill activation needs categorical (situation-based) triggers, not "catch yourself" felt-state; post-compact, "I wrote this" is not a valid skip (recall is gone, graph still has it).

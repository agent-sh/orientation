# Project Memory: orientation

> Reconstructs the real history of code (goal, shipped vs in-flight, coupled files) from Codex, Claude Code, and Eigen transcripts, surfaced to agents via the `get-oriented` skill — so they stop guessing the story of code they didn't write this session.

**Repository**: https://github.com/agent-sh/orientation

## Project Instruction Files

- `CLAUDE.md` is the project memory entrypoint for Claude Code.
- `AGENTS.md` is a byte-for-byte copy of `CLAUDE.md` for tools that read `AGENTS.md` (Codex CLI, OpenCode, Cursor, Cline, Copilot). Keep them identical.

## Layout

- `src/` — the engine (plain Node, no deps):
  - `state.js` — shared runtime paths and per-runtime homes (`CLAUDE_CONFIG_DIR`/`~/.claude/action-graph`, `CODEX_HOME`, `EIGEN_HOME`/`~/.eigen/orientation`, `ORIENTATION_HOME`, `ORIENTATION_ENGINE_DIR`). Default home stays `~/.claude/action-graph/` when the engine runs from there (legacy-compatible).
  - `project.js` — repo/worktree identity and project keys (git remote + worktree → stable key; legacy cwd-hash fallback).
  - `adapters.js` — per-runtime transcript adapters (`claude`, `codex`, `eigen-session`, `eigen-task`) → raw action-graph event schema.
  - `classify.js` — shared: transcript event → record; commit-msg / agent-text / branch-marker extraction; noise filters.
  - `ingest.js` — reparse all allowlisted projects' transcripts (Claude/Codex/Eigen) → `raw.jsonl` (incremental via per-project mtime manifest).
  - `condense.js` — `raw.jsonl` → goal `episodes.json` + one-line prose.
  - `graph.js` — episodes → graph (`touched`/`coupled`/`outcome`/`resumes`); `--threads`, `--coupled`.
  - `consume.js` — SessionStart pointer inject; `--provenance`, `--related`, `--query`, `--sources`.
  - `filters.js` — shared episode filters (branch, runtime, time window, keywords) for the query commands.
  - `hook.js` — runtime hook runner: cursor-ingest the current session source, rebuild only the affected project. Best-effort, quiet.
  - `hooks.js` — hook wiring/repair/remove across runtimes (Claude Code settings.json; Eigen hooks.json; Codex harness-owned contract).
  - `status.js` — public inventory: "what is indexed here?" / "which projects are indexed?".
  - `doctor.js` — read-only diagnosis of the installed runtime state (does not mutate).
  - `refresh.sh` — ingest → condense → graph (manual/backfill; hooks use `hook.js` for per-session cursor ingest).
- `skill/get-oriented/SKILL.md` — the user-facing skill.
- `install.js` — multi-target installer/sync (`--all|--codex|--claude|--eigen`, `--no-hooks`, `--dry-run`): places engine in each runtime home, drops skill, wires hooks (idempotent).
- `bin/orientation` — CLI wrapper over the engine; subcommands: `sync`/`install`, `refresh`, `status`, `doctor`, `provenance`, `related`, `query`, `sources`, `threads`, `coupled`, `ingest`, `hooks`.
- `test/selftest.js` — synthetic end-to-end (condense→graph→consume + codex adapter + multi-runtime install); `AG = ../src`.
- `test/skill-package.test.js` — skill frontmatter portability + agnix (claude-code, codex) package checks.

## Critical rules

1. **Runtime paths are centralized in `src/state.js`.** Default runtime home is `~/.claude/action-graph/` when the engine runs from there; Codex/Eigen default to `~/.eigen/orientation`. `CLAUDE_CONFIG_DIR`, `CODEX_HOME`, `EIGEN_HOME`, `ORIENTATION_HOME`, and `ORIENTATION_ENGINE_DIR` are supported. Do not reintroduce hardcoded local user paths. Do not bring back `paths.js`.
2. **No model, no deps.** Structural signal only (file footprint, co-edit, recency). Adding embeddings/AST was tested and rejected — it lost to file-overlap on deictic prompts. Keep it dependency-free.
3. **Verdict is recency-first.** Uncommitted ≠ abandoned. Recent touch → ACTIVELY IN FLIGHT. Never assert "abandoned" from absence-of-commit alone.
4. **Hooks idempotent.** Hook wiring must never duplicate hooks or clobber unrelated settings; owned hooks carry `ORIENTATION_HOOK=1`, and legacy `action-graph` hooks are repaired in place. Codex hooks are harness-owned (contract printed, not auto-wired).
5. **`couple` map keys are NUL-joined (`\0`)** — filenames may contain spaces. Any code splitting a couple key splits on `'\0'`. Keep the source as escaped `\\0`, not literal NUL bytes, so Git diffs stay text.
6. **Run `npm test` after engine or install edits.** It guards the prior bugs: fail-then-pass≠FAILED, recency verdict (recent work not "abandoned"), resume cosine floor, thin-pointer inject, codex apply_patch adapter, multi-runtime install, and frontmatter schema drift.
7. **Skill description ≤512 chars, third-person, agnix-clean.** Body keeps second-person felt-need voice (that framing is what makes it fire); description does not.

## Lineage

Built and battle-tested in-place at `~/.claude/action-graph/` before extraction, then generalized to multi-runtime (Codex + Claude + Eigen) via per-runtime adapters. This package merges the productized Claude-Code shell (`agent-sh/orientation`) with the multi-runtime engine that was developed in parallel as `get-oriented`. Key findings that shaped it: text retrieval fails on deictic prompts (file-overlap wins); uncommitted-as-abandoned was a real harmful bug (fixed recency-first); skill activation needs categorical (situation-based) triggers, not "catch yourself" felt-state; post-compact, "I wrote this" is not a valid skip (recall is gone, graph still has it).

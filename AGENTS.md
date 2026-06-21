# Project Memory: orientation

> Reconstructs the real history of code (goal, shipped vs in-flight, coupled files) from Codex, Claude Code, and Eigen transcripts, surfaced to agents via the `get-oriented` skill — so they stop guessing the story of code they didn't write this session.

**Repository**: https://github.com/agent-sh/orientation

## Project Instruction Files

- `CLAUDE.md` is the project memory entrypoint for Claude Code.
- `AGENTS.md` is a byte-for-byte copy of `CLAUDE.md` for tools that read `AGENTS.md` (Codex CLI, OpenCode, Cursor, Cline, Copilot). Keep them identical.

## Layout

orientation is **dual-shaped**: one repo that installs two ways — an npm package (`npm i -g`, runs `install.js` postinstall) AND a Claude Code marketplace plugin (`/plugin install`, which copies plugin-declared assets and runs NO npm lifecycle).

- `src/` — the engine (plain Node, no deps):
  - `state.js` — shared runtime paths. Home/engine-dir are SELF-LOCATING: `ORIENTATION_HOME`/`ORIENTATION_ENGINE_DIR` env wins, else the directory `state.js` lives in IS the home (installer copies the engine into its runtime home; the plugin points env at `${CLAUDE_PLUGIN_DATA}` + `${CLAUDE_PLUGIN_ROOT}/src`). No home is inferred by comparing `__dirname` to a recomputed default.
  - `project.js` — repo/worktree identity and project keys (git remote + worktree → stable key; legacy cwd-hash fallback).
  - `adapters.js` — per-runtime transcript adapters (`claude`, `codex`, `eigen-session`, `eigen-task`) → raw action-graph event schema. Eigen cwd resolves via meta sidecar then in-band rows.
  - `classify.js` — shared: transcript event → record; commit-msg / agent-text / branch-marker extraction; noise filters.
  - `ingest.js` — reparse all allowlisted projects' transcripts (Claude/Codex/Eigen) → `raw.jsonl` (incremental via per-project mtime manifest). Unresolvable cwd is a soft skip, never a hook-crashing throw.
  - `condense.js` — `raw.jsonl` → goal `episodes.json` + one-line prose.
  - `graph.js` — episodes → graph (`touched`/`coupled`/`outcome`/`resumes`); `--threads`, `--coupled`.
  - `consume.js` — SessionStart pointer inject; `--provenance`, `--related`, `--query`, `--sources`.
  - `filters.js` — shared episode filters (branch, runtime, time window, keywords) for the query commands.
  - `hook.js` — runtime hook runner: cursor-ingest the current session source, rebuild only the affected project. Best-effort, quiet.
  - `hooks.js` — hook wiring/repair/remove across runtimes (Claude Code settings.json; Eigen hooks.json; Codex harness-owned contract).
  - `status.js` — public inventory: "what is indexed here?" / "which projects are indexed?".
  - `doctor.js` — read-only diagnosis of the installed runtime state (does not mutate).
  - `refresh.sh` — ingest → condense → graph (manual/backfill; hooks use `hook.js` for per-session cursor ingest). Engine dir self-locates from the script's own directory.
- `skills/get-oriented/SKILL.md` — the user-facing skill (plural `skills/` so Claude Code plugin auto-discovery finds it; `install.js` also copies it for npm/Codex/Eigen).
- `.claude-plugin/plugin.json` — Claude Code plugin manifest (name `orientation`).
- `hooks/hooks.json` — declarative plugin hooks (SessionStart/Stop/PreCompact) that run the bundled engine with `ORIENTATION_HOME=${CLAUDE_PLUGIN_DATA}` and `ORIENTATION_ENGINE_DIR=${CLAUDE_PLUGIN_ROOT}/src`. This is what makes a marketplace install work WITHOUT npm postinstall.
- `install.js` — multi-target npm installer/sync (`--all|--codex|--claude|--eigen`, `--no-hooks`, `--dry-run`): places engine in each runtime home, drops skill, wires hooks (idempotent). NOT run by marketplace `/plugin install`.
- `bin/orientation` — CLI wrapper over the engine; subcommands: `sync`/`install`, `refresh`, `status`, `doctor`, `provenance`, `related`, `query`, `sources`, `threads`, `coupled`, `ingest`, `hooks`.
- `test/selftest.js` — synthetic end-to-end (condense→graph→consume + codex adapter + multi-runtime install + live hook wiring/fire/idempotency/remove + subcommand smoke); `AG = ../src`.
- `test/skill-package.test.js` — skill frontmatter portability, projects.txt generic-path guard, plugin-shape (plugin.json/hooks.json) checks, agnix (claude-code, codex).

## Critical rules

1. **Runtime paths are centralized in `src/state.js`, self-locating.** `ORIENTATION_HOME`/`ORIENTATION_ENGINE_DIR` env wins; otherwise the engine's own directory IS the home (the installer copies the engine into `~/.claude/action-graph` or `~/.eigen/orientation`; the plugin points env at `${CLAUDE_PLUGIN_DATA}`). Do NOT reintroduce the old `__dirname`-vs-recomputed-default inference (it leaked custom Eigen installs to the Claude legacy home). Do not reintroduce hardcoded local user paths. Do not bring back `paths.js`.
2. **No model, no deps.** Structural signal only (file footprint, co-edit, recency). Adding embeddings/AST was tested and rejected — it lost to file-overlap on deictic prompts. Keep it dependency-free.
3. **Verdict is recency-first.** Uncommitted ≠ abandoned. Recent touch → ACTIVELY IN FLIGHT. Never assert "abandoned" from absence-of-commit alone.
4. **Hooks idempotent + owned by a real sentinel.** Hook wiring must never duplicate hooks or clobber unrelated settings. Owned hooks carry the literal `ORIENTATION_HOOK=1` sentinel (baked into the env prefix by `commands()`); detection matches that sentinel or the `ORIENTATION_HOME=`/`ORIENTATION_ENGINE_DIR=` assignment markers — NOT a bare `action-graph` substring (that false-claimed coincidentally-named user hooks). `remove` is a clean inverse: emptied event keys are deleted. Codex hooks are harness-owned (contract printed, not auto-wired).
5. **`couple` map keys are NUL-joined (`\0`)** — filenames may contain spaces. Any code splitting a couple key splits on `'\0'`. Keep the source as escaped `\\0`, not literal NUL bytes, so Git diffs stay text.
6. **Run `npm test` after engine or install edits.** It guards the prior bugs: fail-then-pass≠FAILED, recency verdict (recent work not "abandoned"), resume cosine floor, thin-pointer inject, codex apply_patch adapter, multi-runtime install, frontmatter schema drift — AND the hook subsystem: wiring (sentinel present, unrelated hooks preserved), idempotency (0 changed on re-install), live fire (a wired `hook.js` actually ingests + rebuilds a synthetic transcript), clean remove, subcommand smoke, and plugin-shape (plugin.json/hooks.json) checks. Never gut the hook coverage back to `--no-hooks`.
7. **Skill description ≤512 chars, third-person, agnix-clean.** Body keeps second-person felt-need voice (that framing is what makes it fire); description does not.
8. **Dual-shaped, keep both install paths working.** Marketplace `/plugin install` runs NO npm postinstall — it relies on `.claude-plugin/plugin.json` + auto-discovered `skills/` + `hooks/hooks.json` pointing at `${CLAUDE_PLUGIN_ROOT}/src` and writable `${CLAUDE_PLUGIN_DATA}`. The skill lives once at `skills/get-oriented/` (plural). Do not split it back into `skill/` (singular) or the plugin loader stops finding it.

## Lineage

Built and battle-tested in-place at `~/.claude/action-graph/` before extraction, then generalized to multi-runtime (Codex + Claude + Eigen) via per-runtime adapters. This package merges the productized Claude-Code shell (`agent-sh/orientation`) with the multi-runtime engine that was developed in parallel as `get-oriented`. Key findings that shaped it: text retrieval fails on deictic prompts (file-overlap wins); uncommitted-as-abandoned was a real harmful bug (fixed recency-first); skill activation needs categorical (situation-based) triggers, not "catch yourself" felt-state; post-compact, "I wrote this" is not a valid skip (recall is gone, graph still has it).

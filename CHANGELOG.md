# Changelog

## 0.1.0

- Initial public package.
- Reconstructs goal, recency, outcome, coupled-file, and resume-thread history from Codex, Claude Code, and Eigen transcripts via per-runtime adapters.
- Installs the `get-oriented` skill and wires hooks for Claude Code (`settings.json`) and Eigen (`hooks.json`); prints the harness-owned hook contract for Codex. Multi-target installer: `sync --all|--codex|--claude|--eigen`.
- Dual-shaped: installable as a Claude Code marketplace plugin (`.claude-plugin/plugin.json` + auto-discovered `skills/` + declarative `hooks/hooks.json` resolving the engine via `${CLAUDE_PLUGIN_ROOT}` and writing to `${CLAUDE_PLUGIN_DATA}`) in addition to the npm package. Marketplace install needs no npm postinstall.
- CLI: `provenance`, `related`, `query`, `sources`, `threads`, `coupled`, `status`, `doctor`, `hooks`, `refresh`, `ingest`.
- `state.js` home resolution is self-locating (engine dir is its own home; env overrides win) - fixes a leak where a custom Eigen install could resolve to the Claude legacy home on bare invocation.
- Owned hooks carry an explicit `ORIENTATION_HOOK=1` sentinel; detection no longer false-claims user hooks via a bare `action-graph` substring. `remove` deletes emptied event keys (clean inverse).
- Eigen cwd resolves via meta sidecar then in-band rows; an unresolvable source is a soft skip instead of a hook-crashing exit. Codex discovery accepts `session-*.jsonl` as well as `rollout-*.jsonl`. `refresh.sh` self-locates its engine dir.
- Adds regression coverage for frontmatter portability, recency verdicts, graph invariants, the Codex `apply_patch` adapter, multi-runtime temp-only install, live hook wiring/fire/idempotency/remove, subcommand smoke, the `projects.txt` generic-path guard, and the plugin shape.

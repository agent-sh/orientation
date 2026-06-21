# Changelog

## 0.1.0

- Initial public package.
- Reconstructs goal, recency, outcome, coupled-file, and resume-thread history from Codex, Claude Code, and Eigen transcripts via per-runtime adapters.
- Installs the `get-oriented` skill and wires hooks for Claude Code (`settings.json`) and Eigen (`hooks.json`); prints the harness-owned hook contract for Codex. Multi-target installer: `sync --all|--codex|--claude|--eigen`.
- CLI: `provenance`, `related`, `query`, `sources`, `threads`, `coupled`, `status`, `doctor`, `hooks`, `refresh`, `ingest`.
- Adds regression coverage for frontmatter portability, recency verdicts, graph invariants, the Codex `apply_patch` adapter, and multi-runtime temp-only package install.

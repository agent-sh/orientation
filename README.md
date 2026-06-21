# orientation

[![CI](https://github.com/agent-sh/orientation/actions/workflows/ci.yml/badge.svg)](https://github.com/agent-sh/orientation/actions/workflows/ci.yml)

orientation reconstructs the real history of code from Codex, Claude Code, and Eigen transcripts and exposes it through the `get-oriented` skill, so an agent does not have to guess why unfamiliar code exists.

It answers the questions that matter before a cleanup, bug call, or nearby change:

- What human goal created or changed this file?
- Was the work committed, failed, paused, or still in flight?
- How recently was it touched relative to the rest of the project?
- Which files usually moved with it?

The engine is plain Node.js, has no runtime dependencies, and does not call a model or external service. It derives structural signal from local transcript JSONL: prompts, tool calls, edits, tests, commits, and file co-edits.

## Status

This repository is ready for public GitHub use and local installation from GitHub. The package name is reserved in `package.json` as `@agent-sh/orientation`, but it is not published to npm yet.

Current host support:

- Claude Code: installer copies the engine, installs the skill, and wires `SessionStart`, `Stop`, and `PreCompact` hooks in `settings.json`.
- Codex: installer copies the engine and skill; Codex hooks are harness-owned, so the installer prints the hook contract to wire into your harness instead of editing config.
- Eigen: installer copies the engine and skill and wires the `turn_done`, `session_stop`, and `note` hooks in `hooks.json`.

## Install

Install directly from GitHub:

```bash
npm install -g github:agent-sh/orientation
```

Or from a local clone:

```bash
git clone https://github.com/agent-sh/orientation.git
cd orientation
npm install -g .
```

The installer is idempotent. It can be re-run safely, and you can target one runtime or all:

```bash
orientation sync            # all runtimes (codex + claude + eigen)
orientation sync --claude   # Claude Code only
orientation sync --codex    # Codex only
orientation sync --eigen    # Eigen only
```

By default it writes to:

- `~/.claude/action-graph/` for the Claude engine and graph data, plus `~/.claude/skills/get-oriented/SKILL.md` and hooks in `~/.claude/settings.json`.
- `~/.eigen/orientation/` for the Codex/Eigen engine and graph data, plus skills under `~/.codex/skills/get-oriented/` and `~/.eigen/skills/get-oriented/` and Eigen hooks in `~/.eigen/hooks.json`.

## Quick Start

Opt projects into transcript indexing by adding one cwd prefix per line to the engine home's `projects.txt` (`~/.claude/action-graph/projects.txt` for Claude, `~/.eigen/orientation/projects.txt` for Codex/Eigen):

```bash
echo "$HOME/projects" >> ~/.claude/action-graph/projects.txt
```

Build the graph:

```bash
orientation refresh
```

Ask for provenance before judging a file:

```bash
orientation provenance "$PWD" src/example.js
```

Ask for related prior work before adding near a file:

```bash
orientation related "$PWD" src/example.js
```

If there are no transcripts for the project yet, orientation will say so. That is a useful result: no recorded provenance is not evidence that code is dead.

## What The Skill Does

The installed `get-oriented` skill tells an agent to check orientation before it:

- answers "what is the state here?" or "what is next?"
- judges unfamiliar code as broken, stale, dead, or trustworthy
- deletes or guts code whose purpose is being inferred
- adds behavior near existing code it did not write in the current un-compacted session

The key rule is recency-first:

- `ACTIVELY IN FLIGHT`: recent uncommitted work is work in progress, not abandoned.
- `DELIBERATE WORK`: committed work was built intentionally; do not delete as cruft without stronger evidence.
- `POSSIBLY STALE`: old uncommitted work needs verification; absence of a commit is not proof.
- `No recorded work`: orientation has no signal; use callers, tests, exports, and behavior.

## How It Works

```text
~/.claude/projects/**/*.jsonl   (Claude Code)
~/.codex/sessions/**/*.jsonl    (Codex)
~/.eigen/sessions|tasks/**       (Eigen)
        |
        | ingest.js  (per-runtime adapters)
        v
raw.jsonl
        |
        | condense.js
        v
episodes.json
        |
        | graph.js
        v
graph.json
        |
        | consume.js
        v
get-oriented / orientation CLI
```

The graph contains:

- `intent` nodes for user goals
- `file` nodes for edited files
- `touched` edges from goals to files
- `coupled` edges between files edited together
- `outcome` edges for committed, failed, edited, or explored goals
- `resumes` edges when file footprints show the same work resumed across detours

This is deliberately file-level. It points the agent at the area and prior goal to read; it is not a semantic code index.

## CLI

```bash
orientation sync [--all|--codex|--claude|--eigen]   install/sync homes
orientation refresh                                  rebuild indexes
orientation status [cwd]                             show project index state
orientation doctor [cwd]                             inspect install/runtime state
orientation provenance <cwd> <file>                  history + verdict
orientation related    <cwd> <file>                  prior goals + siblings
orientation query      <cwd> <words>                 search recorded goals
orientation sources    <cwd> <goal-id>               show evidence for a goal
orientation threads    <cwd>                          resume threads across detours
orientation coupled    <cwd> <file>                  co-edited files
orientation hooks status|install|repair|remove       hook wiring
```

Examples:

```bash
orientation threads "$PWD"
orientation coupled "$PWD" src/auth.js
orientation provenance "$PWD" README.md
orientation query "$PWD" auth token expiry
```

## Configuration

Set these before install or before running the CLI:

| Variable | Default | Purpose |
| --- | --- | --- |
| `CLAUDE_CONFIG_DIR` | `~/.claude` | Claude Code config directory (transcripts, skill, hooks). |
| `CODEX_HOME` | `~/.codex` | Codex config directory (sessions, skill). |
| `EIGEN_HOME` | `~/.eigen` | Eigen config directory (sessions/tasks, skill, hooks). |
| `ORIENTATION_HOME` | engine-home-relative (`~/.claude/action-graph` or `~/.eigen/orientation`) | Engine state, data, and `projects.txt` location. |
| `ORIENTATION_ENGINE_DIR` | same as `ORIENTATION_HOME` | Directory the engine scripts run from. |
| `EIGEN_ORIENTATION_DIR` | `~/.eigen/orientation` | Codex/Eigen engine home override. |
| `NODE` | `command -v node` | Node binary used by `refresh.sh`. |

Example isolated install:

```bash
CLAUDE_CONFIG_DIR="$HOME/.config/claude-test" \
ORIENTATION_HOME="$HOME/.local/share/orientation" \
npm install -g github:agent-sh/orientation
```

## Validation

Run the full regression suite:

```bash
npm test
```

It checks:

- end-to-end condense, graph, and consume behavior
- recency verdicts so recent uncommitted work is not labeled abandoned
- resume-thread scoring invariants
- the Codex `apply_patch` adapter records touched files
- multi-runtime install into temp Claude/Codex/Eigen homes (never touches your real config)
- `get-oriented` frontmatter portability, including replaying the old failing `allowed-tools` shape
- agnix validation for Claude Code and Codex when `agnix` is installed

Check the package contents:

```bash
npm run pack:check
```

## Limitations

- orientation only sees transcript history that exists locally.
- Codex hooks are harness-owned: the installer prints the hook contract rather than editing Codex config for you.
- Results are file-level, not symbol-level.
- Concurrent sessions can be behind until a session-end hook fires or a manual `orientation refresh`.
- Skill activation is model-mediated. The hook injects a pointer; the model still chooses when to use the skill.

## Security And Privacy

orientation reads local Codex, Claude Code, and Eigen transcript JSONL and writes derived graph data locally. It does not send transcript contents, source code, prompts, or graph data to a remote service.

The generated data can include prompt snippets, file paths, command names, and commit messages. Treat `~/.claude/action-graph/data/` as local developer data and do not commit it.

Report security issues privately; see [SECURITY.md](SECURITY.md).

## Contributing

Issues and pull requests are welcome. Please keep the engine dependency-free unless there is a strong reason to change that constraint, and run:

```bash
npm test
npm run pack:check
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for development notes.

## License

Licensed under either of:

- [MIT](LICENSE-MIT)
- [Apache-2.0](LICENSE-APACHE)

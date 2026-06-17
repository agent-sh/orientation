# orientation

[![CI](https://github.com/agent-sh/orientation/actions/workflows/ci.yml/badge.svg)](https://github.com/agent-sh/orientation/actions/workflows/ci.yml)

orientation reconstructs the real history of code from Claude Code transcripts and exposes it through the `get-oriented` skill, so an agent does not have to guess why unfamiliar code exists.

It answers the questions that matter before a cleanup, bug call, or nearby change:

- What human goal created or changed this file?
- Was the work committed, failed, paused, or still in flight?
- How recently was it touched relative to the rest of the project?
- Which files usually moved with it?

The engine is plain Node.js, has no runtime dependencies, and does not call a model or external service. It derives structural signal from local transcript JSONL: prompts, tool calls, edits, tests, commits, and file co-edits.

## Status

This repository is ready for public GitHub use and local installation from GitHub. The package name is reserved in `package.json` as `@agent-sh/orientation`, but it is not published to npm yet.

Current host support:

- Claude Code: installer copies the engine, installs the skill, and wires hooks.
- Codex and other skill hosts: the `get-oriented` skill frontmatter is linted for portability, but automatic hook installation is currently Claude Code-focused.

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

The installer is idempotent. It can be re-run safely:

```bash
orientation install
```

By default it writes to:

- `~/.claude/action-graph/` for the engine and graph data
- `~/.claude/skills/get-oriented/SKILL.md` for the skill
- `~/.claude/settings.json` for Claude Code `SessionStart`, `Stop`, and `PreCompact` hooks

## Quick Start

Opt projects into transcript indexing by adding one cwd prefix per line:

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

If there are no Claude Code transcripts for the project yet, orientation will say so. That is a useful result: no recorded provenance is not evidence that code is dead.

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
~/.claude/projects/**/*.jsonl
        |
        | ingest.js
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
orientation install
orientation refresh
orientation provenance <cwd> <file>
orientation related <cwd> <file>
orientation threads <cwd>
orientation coupled <cwd> <file>
```

Examples:

```bash
orientation threads "$PWD"
orientation coupled "$PWD" src/auth.js
orientation provenance "$PWD" README.md
```

## Configuration

Set these before install or before running the CLI:

| Variable | Default | Purpose |
| --- | --- | --- |
| `CLAUDE_CONFIG_DIR` | `~/.claude` | Claude Code config directory. |
| `ORIENTATION_HOME` | `$CLAUDE_CONFIG_DIR/action-graph` | Engine, data, and `projects.txt` location. |
| `ORIENTATION_PROJECTS_DIR` | `$CLAUDE_CONFIG_DIR/projects` | Claude Code transcript directory. |
| `ORIENTATION_NODE` | `command -v node` in hooks | Node binary used by `refresh.sh`. |
| `ORIENTATION_NODE_MAX_OLD_SPACE_SIZE` | `4096` | Heap limit for transcript ingest. |

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

- end-to-end ingest, condense, graph, and consume behavior
- recency verdicts so recent uncommitted work is not labeled abandoned
- resume-thread scoring invariants
- `get-oriented` frontmatter portability, including replaying the old failing `allowed-tools` shape
- agnix validation for Claude Code and Codex when `agnix` is installed
- package install behavior in a temporary Claude config

Check the package contents:

```bash
npm run pack:check
```

## Limitations

- orientation only sees transcript history that exists locally.
- The installer currently targets Claude Code's local config and hook schema.
- Results are file-level, not symbol-level.
- Concurrent sessions can be behind until `Stop`, `PreCompact`, or a manual `orientation refresh`.
- Skill activation is model-mediated. The hook injects a pointer; the model still chooses when to use the skill.

## Security And Privacy

orientation reads local Claude Code transcript JSONL and writes derived graph data locally. It does not send transcript contents, source code, prompts, or graph data to a remote service.

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

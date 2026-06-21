#!/usr/bin/env bash
# action-graph refresh — full ingest → condense → graph, for all allowlisted
# projects. This is the manual/backfill path. Hooks use hook.js for per-session
# cursor ingest, then rebuild only the affected project.
N="${NODE:-$(command -v node)}"
# Engine dir: explicit override wins; otherwise this script's own directory (the
# installer copies refresh.sh alongside the engine), so it works for every
# runtime home instead of assuming Claude's ~/.claude/action-graph.
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
A="${ORIENTATION_ENGINE_DIR:-$SELF_DIR}"
"$N" --max-old-space-size=4096 "$A/ingest.js" >/dev/null 2>&1 \
  && "$N" "$A/condense.js" >/dev/null 2>&1 \
  && "$N" "$A/graph.js" >/dev/null 2>&1
exit 0

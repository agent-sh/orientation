#!/usr/bin/env bash
# action-graph refresh — ingest (incremental) → condense → graph, for all
# allowlisted projects. Called by the Stop and PreCompact hooks so the graph is
# current both at session end AND right before a mid-session compaction (when the
# post-compact agent most needs accurate provenance). Silent + best-effort.
if [ -n "${ORIENTATION_HOME:-}" ]; then
  A="$ORIENTATION_HOME"
else
  C="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
  A="$C/action-graph"
fi

N="${ORIENTATION_NODE:-}"
if [ -z "$N" ]; then
  N="$(command -v node || true)"
fi
[ -n "$N" ] || exit 0

"$N" --max-old-space-size="${ORIENTATION_NODE_MAX_OLD_SPACE_SIZE:-4096}" "$A/ingest.js" >/dev/null 2>&1 \
  && "$N" "$A/condense.js" >/dev/null 2>&1 \
  && "$N" "$A/graph.js" >/dev/null 2>&1
exit 0

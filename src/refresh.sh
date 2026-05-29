#!/usr/bin/env bash
# action-graph refresh — ingest (incremental) → condense → graph, for all
# allowlisted projects. Called by the Stop and PreCompact hooks so the graph is
# current both at session end AND right before a mid-session compaction (when the
# post-compact agent most needs accurate provenance). Silent + best-effort.
N="/home/avifenesh/.nvm/versions/node/v25.9.0/bin/node"
A="/home/avifenesh/.claude/action-graph"
"$N" --max-old-space-size=4096 "$A/ingest.js" >/dev/null 2>&1 \
  && "$N" "$A/condense.js" >/dev/null 2>&1 \
  && "$N" "$A/graph.js" >/dev/null 2>&1
exit 0

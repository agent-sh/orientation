#!/usr/bin/env node
// action-graph consume — the payoff. Two modes:
//   node consume.js <cwd>            → SessionStart injector (prints additionalContext JSON)
//   node consume.js --query <cwd> <q> → grep episodes for a keyword, print matches
// Read-only. If episodes.json missing/stale, prints nothing (no noise into a fresh session).

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DATA: ROOT } = require('./paths');

function projectKey(cwd) {
  return crypto.createHash('sha1').update(cwd || 'unknown').digest('hex').slice(0, 12);
}

// human age from a millisecond delta
function fmtAge(deltaMs) {
  const h = deltaMs / 3600e3;
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}min ago`;
  if (h < 48) return `${Math.round(h)}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function load(cwd) {
  const f = path.join(ROOT, projectKey(cwd), 'episodes.json');
  if (!fs.existsSync(f)) return null;
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; }
}

function loadGraph(cwd) {
  const f = path.join(ROOT, projectKey(cwd), 'graph.json');
  if (!fs.existsSync(f)) return null;
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; }
}

// Resolve a user-supplied file path to a matcher over stored `parent/base` names.
// Prefer an EXACT parent/base hit; only fall back to bare-basename suffix match when
// no exact name exists in `known`. Without this, `rules/codex.rs` also matches
// `schemas/codex.rs` (same basename) — conflating two distinct files. `known` is the
// set of all filenames seen (episode filesTouched ∪ graph file nodes).
function makeMatcher(file, known) {
  const base = file.split('/').slice(-2).join('/'); // parent/base
  const bare = file.split('/').pop();
  const exactExists = known.has(base);
  const canonical = exactExists ? base : null;
  const match = f => exactExists ? f === base : (f === base || f.endsWith('/' + bare) || f === bare);
  return { match, canonical, base };
}


// SessionStart hook entry: inject a thin POINTER, not the data. The graph can be
// large; dumping recent goals + areas steals context the user wants for the task.
// Instead announce availability + the trigger, and let the agent pull provenance
// on demand via the check-provenance skill. Lazy, not eager.
function injectMode(cwd) {
  const data = load(cwd);
  if (!data || !data.episodes.length) { process.stdout.write('{}'); return; }
  const goals = data.episodes.filter(e => e.intent).length;
  if (!goals) { process.stdout.write('{}'); return; }

  const ctx =
    `action-graph has recorded history for this project (${goals} goals across prior sessions). ` +
    `If you find yourself judging, deleting, or building near code you didn't write this session — ` +
    `before you conclude it's a bug/dead/done, or act on it — use the get-oriented skill to look up its ` +
    `real history (the goal behind it, shipped vs in-flight, what changed with it) instead of guessing from the code. ` +
    `Loads on demand; nothing preloaded here.`;

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: ctx }
  }));
}

function queryMode(cwd, q) {
  const data = load(cwd);
  if (!data) { console.log('(no action-graph for this project yet)'); return; }
  const needle = q.toLowerCase();
  const hits = data.episodes.filter(e => {
    const hay = [e.intent, e.prose, ...(e.filesTouched || [])].join(' ').toLowerCase();
    return hay.includes(needle);
  });
  if (!hits.length) { console.log(`(no episodes match "${q}")`); return; }
  console.log(`${hits.length} episode(s) match "${q}":\n`);
  for (const e of hits.reverse()) {
    console.log(`[${e.t.slice(0, 10)}] ${e.prose}`);
    if (e.filesTouched.length) console.log(`    files: ${e.filesTouched.join(', ')}`);
    console.log('');
  }
}

// Provenance of a file — the "should I delete this?" guard. Answers:
//   was it deliberate (committed goals touched it)?  what was the goal?
//   what travels with it (coupled neighbors = blast radius)?  abandoned attempts?
// filesTouched is stored as parent/base; match on suffix so the agent can pass
// any path form (src/auth.js, auth.js, /abs/.../auth.js).
function provenanceMode(cwd, file) {
  const data = load(cwd);
  if (!data) { console.log('(no action-graph for this project — cannot judge; do not assume cruft)'); return; }
  const g0 = loadGraph(cwd);
  const known = new Set([
    ...data.episodes.flatMap(e => e.filesTouched || []),
    ...((g0 && g0.nodes) || []).filter(n => n.type === 'file').map(n => n.label),
  ]);
  const { match } = makeMatcher(file, known);

  const goals = data.episodes.filter(e => e.intent && (e.filesTouched || []).some(match));
  if (!goals.length) {
    console.log(`No recorded work touched "${file}". Action-graph has no provenance — either pre-dates tracking or genuinely untouched. Judge on code alone.`);
    return;
  }

  const ms = e => { const d = Date.parse(e.t || ''); return isNaN(d) ? 0 : d; };
  // "now" = newest activity anywhere in the project (clock-robust; no wall-clock dep)
  const now = Math.max(...data.episodes.map(ms), 0);
  const HOUR = 3600e3, DAY = 24 * HOUR;
  const lastTouch = Math.max(...goals.map(ms));
  const ageH = (now - lastTouch) / HOUR;
  const committed = goals.filter(e => (e.runs || []).some(r => r.kind === 'commit'));
  const uncommitted = goals.filter(e => !((e.runs || []).some(r => r.kind === 'commit')));

  console.log(`PROVENANCE: ${file}`);
  console.log(`${goals.length} goal(s) touched it — ${committed.length} committed, ${uncommitted.length} not committed. Last touched ${fmtAge(now - lastTouch)} (relative to latest project activity).\n`);

  // VERDICT — recency first. Uncommitted is NOT abandoned: in-flight work is
  // uncommitted by definition (you commit at the end). Recent activity => ACTIVE.
  // Abandonment requires uncommitted AND stale (no recent touch) — and even then
  // it's stated as uncertain, never asserted. This is the git-state-not-ship-status
  // rule applied to the tool itself: don't infer abandon from absence-of-commit.
  if (ageH <= 48) {
    console.log(`⚠ ACTIVELY IN FLIGHT — last touched ${fmtAge(now - lastTouch)}. ` +
      `${uncommitted.length ? 'Uncommitted edits here are work-in-progress, NOT abandoned — ' : ''}` +
      `someone is delivering this now. Do not treat as dead/stale; continue or ask, don't scrap.`);
  } else if (committed.length) {
    console.log('⚠ DELIBERATE WORK — committed and not recently active. Built on purpose; do not delete as cruft without cause.');
  } else if (ageH > 14 * 24) {
    console.log(`POSSIBLY STALE (uncertain) — uncommitted and untouched for ${fmtAge(now - lastTouch)}. ` +
      `MIGHT be abandoned, might be paused. Verify with the user / real signals before treating as dead — uncommitted alone is not proof of abandonment.`);
  } else {
    console.log(`Uncommitted, last touched ${fmtAge(now - lastTouch)}. Status unclear — could be paused mid-work. Don't assume abandoned; check intent below.`);
  }
  console.log('');

  console.log('Goals that touched it (newest first):');
  for (const e of [...goals].sort((a, b) => ms(b) - ms(a)).slice(0, 6)) {
    const c = (e.runs || []).some(r => r.kind === 'commit') ? '✓committed' : '·uncommitted';
    console.log(`  [${c}] ${e.intent.slice(0, 76)}`);
  }
  console.log('');

  // coupled neighbors = blast radius
  const g = loadGraph(cwd);
  if (g) {
    const fileNode = (g.nodes.find(n => n.type === 'file' && match(n.label)) || {}).id;
    if (fileNode) {
      const nb = [];
      for (const e of g.edges) {
        if (e.rel !== 'coupled') continue;
        if (e.from === fileNode) nb.push([e.to.replace('file:', ''), e.weight]);
        else if (e.to === fileNode) nb.push([e.from.replace('file:', ''), e.weight]);
      }
      if (nb.length) {
        console.log('Coupled neighbors (usually edited together — check before removing):');
        nb.sort((a, b) => b[1] - a[1]).slice(0, 6).forEach(([f, w]) => console.log(`  ${w}x  ${f}`));
      }
    }
  }
}

// Related prior work for a file you're ABOUT TO ADD code to. The reinvention /
// duplication / contradiction guard: before writing, see what already built this
// area and where sibling logic lives (coupled cluster), so you extend or reconcile
// instead of duplicating or contradicting an earlier decision. File-level: surfaces
// the AREA to read, not literal duplicate lines (no code-content index).
function relatedMode(cwd, file) {
  const data = load(cwd);
  if (!data) { console.log('(no action-graph for this project — no prior-work signal; proceed, but search the code yourself)'); return; }
  const g = loadGraph(cwd);
  const known = new Set([
    ...data.episodes.flatMap(e => e.filesTouched || []),
    ...((g && g.nodes) || []).filter(n => n.type === 'file').map(n => n.label),
  ]);
  const { match } = makeMatcher(file, known);

  const goals = data.episodes.filter(e => e.intent && (e.filesTouched || []).some(match));
  const committed = e => (e.runs || []).some(r => r.kind === 'commit');

  let nb = [];
  if (g) {
    // passenger files (always co-edited — CHANGELOG/tracking docs) are weak siblings;
    // compute df + max co-edit ratio from coupled edges and drop them, mirroring graph.js
    const df = new Map();
    for (const e of g.edges) if (e.rel === 'touched') df.set(e.to, (df.get(e.to) || 0) + 1);
    const maxCo = new Map();
    for (const e of g.edges) if (e.rel === 'coupled') {
      const ra = e.weight / (df.get(e.from) || 1), rb = e.weight / (df.get(e.to) || 1);
      if (ra > (maxCo.get(e.from) || 0)) maxCo.set(e.from, ra);
      if (rb > (maxCo.get(e.to) || 0)) maxCo.set(e.to, rb);
    }
    const isPassenger = id => (df.get(id) || 0) >= 4 && (maxCo.get(id) || 0) >= 0.8;

    const self = g.nodes.find(n => n.type === 'file' && match(n.label));
    const node = self && self.id;
    if (node) for (const e of g.edges) {
      if (e.rel !== 'coupled') continue;
      const other = e.from === node ? e.to : e.to === node ? e.from : null;
      if (!other || other === node) continue;        // skip self-loops
      if (isPassenger(other)) continue;              // skip passenger files
      nb.push([other.replace('file:', ''), e.weight]);
    }
    nb.sort((a, b) => b[1] - a[1]);
  }

  if (!goals.length && !nb.length) {
    console.log(`No prior work recorded on "${file}" or files coupled to it. Likely new ground — but still grep the codebase for similar logic before adding.`);
    return;
  }

  console.log(`RELATED PRIOR WORK: ${file}\n`);
  if (goals.length) {
    console.log(`${goals.length} goal(s) already built in this file — read before adding, to extend rather than duplicate or contradict:`);
    // committed first (decisions that stuck), then most recent
    goals.sort((a, b) => (committed(b) - committed(a)));
    for (const e of goals.slice(0, 6)) console.log(`  ${committed(e) ? '✓' : '·'} ${e.intent.slice(0, 78)}`);
    console.log('');
  }
  if (nb.length) {
    console.log('Sibling files (edited alongside this one — similar/related logic likely lives here):');
    nb.slice(0, 6).forEach(([f, w]) => console.log(`  ${w}x  ${f}`));
    console.log('\nGrep these + this file for the function/behavior you intend to add before writing it.');
  }
}

const args = process.argv.slice(2);
if (args[0] === '--related') {
  relatedMode(args[1] || process.cwd(), args.slice(2).join(' '));
} else if (args[0] === '--provenance') {
  provenanceMode(args[1] || process.cwd(), args.slice(2).join(' '));
} else if (args[0] === '--query') {
  queryMode(args[1] || process.cwd(), args.slice(2).join(' '));
} else if (args[0]) {
  // explicit cwd passed (manual/test use)
  injectMode(args[0]);
} else {
  // hook use: cwd arrives on stdin JSON. Read it, then inject.
  let input = '';
  process.stdin.on('data', c => { input += c; });
  process.stdin.on('end', () => {
    let cwd = process.cwd();
    try { cwd = JSON.parse(input).cwd || cwd; } catch {}
    injectMode(cwd);
  });
}

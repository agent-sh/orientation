#!/usr/bin/env node
// action-graph ingest — single source of truth. Reparses Claude Code transcripts
// (the JSONL that already records EVERYTHING: user prompts, agent text, tool calls,
// todos, commits) into raw.jsonl. Replaces live capture + backport: no lossy hooks,
// no live/backfill divergence, no append-ordering. Full rebuild each run (idempotent).
//
//   node ingest.js            → rebuild every allowlisted project (incremental)
//   node ingest.js <cwd>      → rebuild one project (force)
//   node ingest.js --force    → rebuild all, ignore mtime cache
//
// Allowlist entries are cwd PREFIXES. A line `/home/you/projects` matches
// every project (and nested repo) under it — each distinct session cwd becomes its
// own project. Discovery reads the real cwd from each transcript (dir-name dashing
// is ambiguous); incremental skip via per-project mtime manifest keeps Stop fast
// even across ~1GB / 185 dirs.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { classify, ok, cleanIntent, gistText, branchMarker } = require('./classify');
const { ACTION_GRAPH: AG, DATA: ROOT, PROJECTS_DIR } = require('./paths');

function projectKey(cwd) {
  return crypto.createHash('sha1').update(cwd || 'unknown').digest('hex').slice(0, 12);
}

function allowlist() {
  const f = path.join(AG, 'projects.txt');
  if (!fs.existsSync(f)) return [];
  return fs.readFileSync(f, 'utf8').split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#'));
}

// Read the real cwd a transcript dir belongs to. Dir names dash-encode the path
// ambiguously (a literal '-' is indistinguishable from a '/' separator), so we
// trust the `cwd` field inside the records instead of decoding the name.
function dirCwd(dir) {
  let f;
  try { f = fs.readdirSync(dir).find(x => x.endsWith('.jsonl')); } catch { return null; }
  if (!f) return null;
  // scan first N lines for a cwd field (first record sometimes lacks it)
  const lines = readHead(path.join(dir, f), 200);
  for (const line of lines) {
    if (!line.trim()) continue;
    try { const o = JSON.parse(line); if (o.cwd) return o.cwd; } catch {}
  }
  return null;
}

// Read up to n lines without loading a 160MB file whole.
function readHead(file, n) {
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(64 * 1024);
    let data = '', read;
    while ((data.match(/\n/g) || []).length < n && (read = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
      data += buf.toString('utf8', 0, read);
    }
    return data.split('\n').slice(0, n);
  } finally { fs.closeSync(fd); }
}

// Latest mtime across a dir's transcripts — the incremental-skip key.
function dirMtime(dir) {
  let m = 0;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.jsonl')) continue;
    const mt = fs.statSync(path.join(dir, f)).mtimeMs;
    if (mt > m) m = mt;
  }
  return m;
}

function parseTranscript(file) {
  const rows = [];
  const data = fs.readFileSync(file, 'utf8').split('\n');
  for (const line of data) {
    if (!line.trim()) continue;
    try { rows.push(JSON.parse(line)); } catch {}
  }
  // index tool_result by id for success detection
  const resultById = new Map();
  for (const d of rows) {
    if (d.type !== 'user') continue;
    const c = d.message && d.message.content;
    if (!Array.isArray(c)) continue;
    for (const b of c) if (b && b.type === 'tool_result') resultById.set(b.tool_use_id, b.content);
  }

  const out = [];
  let activeTodo = null; // current in_progress todo content = best subgoal label
  let pendingInterrupt = false; // last user action was a hard interrupt

  for (const d of rows) {
    const t = d.timestamp || '';
    const session = (d.sessionId || '').slice(0, 8);

    if (d.type === 'user') {
      // interruption = user cut the agent off mid-work. Unambiguous branch-away
      // point, free from the transcript, no model. Mark it as its own node.
      if (isInterruption(d.message && d.message.content)) {
        out.push({ t, session, kind: 'interrupt' });
        pendingInterrupt = true;
        continue;
      }
      const intent = userIntent(d.message && d.message.content);
      if (intent) {
        const rec = { t, session, kind: 'intent', text: intent.slice(0, 300) };
        // branch source priority: explicit lexical marker > structural (post-interrupt).
        // A prompt right after an interrupt is a steer-away even with no marker —
        // catches the deictic silent branches text alone can't ("the location is wrong").
        const br = branchMarker(intent);
        if (br) rec.branch = br;
        else if (pendingInterrupt) { rec.branch = 'steer'; rec.branchSrc = 'interrupt'; }
        out.push(rec);
        pendingInterrupt = false;
      }
      continue;
    }
    if (d.type !== 'assistant') continue;

    const blocks = (d.message && d.message.content) || [];
    const turn = (d.uuid || (d.message && d.message.id) || '').slice(-12);

    for (const b of blocks) {
      if (!b) continue;
      if (b.type === 'text') {
        const g = gistText(b.text);
        if (g) out.push({ t, session, turn, kind: 'say', text: g.text, cue: g.cue });
        continue;
      }
      if (b.type !== 'tool_use') continue;

      // TodoWrite updates the active-subgoal pointer; not itself an action
      if (b.name === 'TodoWrite') {
        const todos = Array.isArray(b.input && b.input.todos) ? b.input.todos : [];
        const ip = todos.find(x => x && x.status === 'in_progress');
        activeTodo = ip ? ip.content : activeTodo;
        out.push({ t, session, turn, kind: 'todo', active: activeTodo, items: todos.length });
        continue;
      }

      const c = classify(b.name, b.input);
      c.t = t; c.session = session; c.tool = b.name; c.turn = turn;
      if (activeTodo) c.subgoal = activeTodo; // best-effort subgoal tag from todo lens
      if (!ok(resultById.get(b.id))) c.failed = true;
      out.push(c);
    }
  }
  return out;
}

function isInterruption(content) {
  if (Array.isArray(content)) {
    return content.some(b => b && b.type === 'text' && /^\[Request interrupted/.test(b.text || ''));
  }
  return typeof content === 'string' && /^\[Request interrupted/.test(content);
}

function userIntent(content) {
  if (typeof content === 'string') return cleanIntent(content);
  if (Array.isArray(content)) {
    if (content.some(b => b && b.type === 'tool_result')) return null;
    const textBlk = content.find(b => b && b.type === 'text');
    return textBlk ? cleanIntent(textBlk.text) : null;
  }
  return null;
}

function rebuildProject(dir, cwd) {
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl'))
    .map(f => path.join(dir, f))
    .sort((a, b) => fs.statSync(a).mtimeMs - fs.statSync(b).mtimeMs); // oldest first

  let all = [];
  for (const f of files) all = all.concat(parseTranscript(f));

  const outDir = path.join(ROOT, projectKey(cwd));
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'raw.jsonl'), all.map(r => JSON.stringify(r)).join('\n') + '\n');
  fs.writeFileSync(path.join(outDir, '.manifest.json'), JSON.stringify({ cwd, srcMtime: dirMtime(dir), records: all.length }));
  return { cwd, key: projectKey(cwd), records: all.length, sessions: files.length };
}

function prefixMatch(cwd, prefixes) {
  return prefixes.some(p => cwd === p || cwd.startsWith(p.endsWith('/') ? p : p + '/'));
}

// Already-built and source unchanged since last build?
function isFresh(cwd, dir) {
  const mf = path.join(ROOT, projectKey(cwd), '.manifest.json');
  if (!fs.existsSync(mf)) return false;
  try { return JSON.parse(fs.readFileSync(mf, 'utf8')).srcMtime === dirMtime(dir); } catch { return false; }
}

function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const target = args.find(a => !a.startsWith('--'));

  // Explicit single-cwd mode: map cwd→dir by re-dashing (force rebuild).
  if (target) {
    const dir = path.join(PROJECTS_DIR, target.replace(/\//g, '-'));
    if (!fs.existsSync(dir)) { console.log(`no transcript dir for ${target}`); return; }
    const r = rebuildProject(dir, target);
    console.log(`ingested ${r.records} records (${r.sessions} sessions) → ${r.key} (${target})`);
    return;
  }

  const prefixes = allowlist();
  if (!prefixes.length) { console.log('no projects in allowlist'); return; }
  if (!fs.existsSync(PROJECTS_DIR)) { console.log(`no transcript directory at ${PROJECTS_DIR}`); return; }

  let built = 0, skipped = 0, nomatch = 0, errored = 0;
  for (const name of fs.readdirSync(PROJECTS_DIR)) {
    const dir = path.join(PROJECTS_DIR, name);
    try {
      if (!fs.statSync(dir).isDirectory()) continue;
      const cwd = dirCwd(dir);
      if (!cwd || !prefixMatch(cwd, prefixes)) { nomatch++; continue; }
      if (!force && isFresh(cwd, dir)) { skipped++; continue; }
      const r = rebuildProject(dir, cwd);
      console.log(`ingested ${r.records} records (${r.sessions} sessions) → ${r.key} (${cwd})`);
      built++;
    } catch (e) {
      // one malformed transcript must not abort the whole batch
      errored++;
      console.log(`error ${name}: ${e.message}`);
    }
  }
  console.log(`done: ${built} built, ${skipped} unchanged, ${nomatch} outside allowlist, ${errored} errored`);
}

main();

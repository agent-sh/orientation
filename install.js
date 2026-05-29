#!/usr/bin/env node
// orientation installer — places the engine, the skill, and wires the Claude Code
// hooks. Idempotent: safe to re-run; never duplicates hooks or clobbers unrelated
// settings. Run automatically on `npm install`, or manually: `node install.js`.
//
// What it does:
//   1. copy src/*.js + refresh.sh        → ~/.claude/action-graph/
//   2. copy skill/get-oriented/SKILL.md  → ~/.claude/skills/get-oriented/
//   3. seed projects.txt (allowlist)     → ~/.claude/action-graph/ (if absent)
//   4. wire SessionStart, Stop, PreCompact hooks → ~/.claude/settings.json
//
// The engine is hardcoded to run from ~/.claude/action-graph/ (hooks + skill
// reference that path), so installation is a fixed-location copy, not a symlink.

const fs = require('fs');
const path = require('path');
const os = require('os');

const HERE = __dirname;
const CLAUDE = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const AG = path.join(CLAUDE, 'action-graph');
const SKILLS = path.join(CLAUDE, 'skills', 'get-oriented');
const SETTINGS = path.join(CLAUDE, 'settings.json');

// Resolve the node binary the hooks should call (absolute, for hook reliability).
const NODE = process.execPath;

function log(m) { console.log(`[orientation] ${m}`); }

function copyEngine() {
  fs.mkdirSync(path.join(AG, 'data'), { recursive: true });
  const src = path.join(HERE, 'src');
  for (const f of fs.readdirSync(src)) {
    fs.copyFileSync(path.join(src, f), path.join(AG, f));
    if (f.endsWith('.sh')) fs.chmodSync(path.join(AG, f), 0o755);
  }
  log(`engine → ${AG}`);
}

function copySkill() {
  fs.mkdirSync(SKILLS, { recursive: true });
  fs.copyFileSync(path.join(HERE, 'skill', 'get-oriented', 'SKILL.md'), path.join(SKILLS, 'SKILL.md'));
  log(`skill → ${SKILLS}`);
}

function seedAllowlist() {
  const dst = path.join(AG, 'projects.txt');
  if (fs.existsSync(dst)) { log('projects.txt exists — left as-is'); return; }
  const example = path.join(HERE, 'projects.txt.example');
  if (fs.existsSync(example)) fs.copyFileSync(example, dst);
  else fs.writeFileSync(dst, '# orientation allowlist — one cwd PREFIX per line.\n# e.g. /home/you/projects\n');
  log(`projects.txt seeded → ${dst} (edit to opt projects in)`);
}

// Wire a command hook into one event, only if an equivalent isn't already present.
function ensureHook(hooks, event, command, extra = {}) {
  hooks[event] = hooks[event] || [];
  const already = hooks[event].some(grp =>
    (grp.hooks || []).some(h => typeof h.command === 'string' && h.command.includes('action-graph')));
  if (already) return false;
  hooks[event].push({ hooks: [{ type: 'command', command, ...extra }] });
  return true;
}

function wireHooks() {
  let settings = {};
  if (fs.existsSync(SETTINGS)) {
    try { settings = JSON.parse(fs.readFileSync(SETTINGS, 'utf8')); }
    catch { log('settings.json unparseable — skipping hook wiring; wire manually (see README)'); return; }
  }
  settings.hooks = settings.hooks || {};

  const consume = `"${NODE}" "${path.join(AG, 'consume.js')}"`;
  const refresh = `bash ${path.join(AG, 'refresh.sh')}`;

  let n = 0;
  if (ensureHook(settings.hooks, 'SessionStart', consume, { timeout: 5, statusMessage: 'Loading orientation...' })) n++;
  if (ensureHook(settings.hooks, 'Stop', refresh, { timeout: 60 })) n++;
  if (ensureHook(settings.hooks, 'PreCompact', refresh, { timeout: 60 })) n++;

  if (n) {
    fs.writeFileSync(SETTINGS, JSON.stringify(settings, null, 2));
    log(`wired ${n} hook(s) → ${SETTINGS}`);
  } else {
    log('hooks already present — settings untouched');
  }
}

function main() {
  log('installing...');
  copyEngine();
  copySkill();
  seedAllowlist();
  wireHooks();
  log('done. Edit ' + path.join(AG, 'projects.txt') + ' to opt projects in, then work normally.');
}

main();

#!/usr/bin/env node
// orientation installer - places the engine, the skill, and wires the Claude Code
// hooks. Idempotent: safe to re-run; never duplicates hooks or clobbers unrelated
// settings. Run automatically on `npm install`, or manually: `node install.js`.
//
// What it does:
//   1. copy src/*.js + refresh.sh        -> runtime home
//   2. copy skill/get-oriented/SKILL.md  -> Claude skills directory
//   3. seed projects.txt (allowlist)     -> runtime home (if absent)
//   4. wire SessionStart, Stop, PreCompact hooks -> Claude settings.json
//
// Defaults match Claude Code's standard config layout. Set CLAUDE_CONFIG_DIR or
// ORIENTATION_HOME before install to target another location.

const fs = require('fs');
const path = require('path');
const { CLAUDE, ACTION_GRAPH: AG } = require('./src/paths');

const HERE = __dirname;
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

function normalized(s) {
  return String(s || '').replace(/\\/g, '/');
}

function isOwnedHook(command, scriptName, desiredCommand) {
  const s = normalized(command);
  const desired = normalized(desiredCommand);
  return s === desired ||
    s.includes('ORIENTATION_HOOK=1') ||
    (s.includes('/action-graph/') && s.includes(`/${scriptName}`));
}

function sameHook(hook, desired) {
  return hook.type === desired.type &&
    hook.command === desired.command &&
    hook.timeout === desired.timeout &&
    hook.statusMessage === desired.statusMessage;
}

// Wire or repair a command hook into one event without disturbing unrelated hooks.
function ensureHook(hooks, event, scriptName, command, extra = {}) {
  hooks[event] = hooks[event] || [];
  const desired = { type: 'command', command, ...extra };
  for (const grp of hooks[event]) {
    for (const h of (grp.hooks || [])) {
      if (typeof h.command !== 'string' || !isOwnedHook(h.command, scriptName, command)) continue;
      if (sameHook(h, desired)) return false;
      Object.assign(h, desired);
      return true;
    }
  }
  hooks[event].push({ hooks: [desired] });
  return true;
}

function wireHooks() {
  let settings = {};
  if (fs.existsSync(SETTINGS)) {
    try { settings = JSON.parse(fs.readFileSync(SETTINGS, 'utf8')); }
    catch { log('settings.json unparseable — skipping hook wiring; wire manually (see README)'); return; }
  }
  settings.hooks = settings.hooks || {};

  const consume = `ORIENTATION_HOOK=1 "${NODE}" "${path.join(AG, 'consume.js')}"`;
  const refresh = `ORIENTATION_HOOK=1 bash "${path.join(AG, 'refresh.sh')}"`;

  let n = 0;
  if (ensureHook(settings.hooks, 'SessionStart', 'consume.js', consume, { timeout: 5, statusMessage: 'Loading orientation...' })) n++;
  if (ensureHook(settings.hooks, 'Stop', 'refresh.sh', refresh, { timeout: 60 })) n++;
  if (ensureHook(settings.hooks, 'PreCompact', 'refresh.sh', refresh, { timeout: 60 })) n++;

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

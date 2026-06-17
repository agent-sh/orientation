#!/usr/bin/env node
// Package install regression. Runs the public CLI install path against a temp
// Claude config so tests never touch the developer's real ~/.claude tree.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const NODE = process.execPath;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orientation-install-'));
const claude = path.join(tmp, 'claude');
const runtime = path.join(tmp, 'custom-runtime');
const settingsPath = path.join(claude, 'settings.json');
let failures = 0;

function assert(cond, msg) {
  if (cond) console.log(`  ok   ${msg}`);
  else {
    console.log(`  FAIL ${msg}`);
    failures++;
  }
}

function readSettings() {
  return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
}

function commandHooks(settings, event) {
  return ((settings.hooks && settings.hooks[event]) || [])
    .flatMap(group => group.hooks || [])
    .filter(hook => hook.type === 'command');
}

function ownedHooks(settings, event) {
  return commandHooks(settings, event)
    .filter(hook => String(hook.command || '').includes('ORIENTATION_HOOK=1'));
}

function runInstall(env) {
  return execFileSync(NODE, [path.join(ROOT, 'bin', 'orientation'), 'install'], {
    cwd: ROOT,
    env,
    encoding: 'utf8',
  });
}

function run() {
  fs.mkdirSync(claude, { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify({
    hooks: {
      SessionStart: [{ hooks: [{ type: 'command', command: '"/usr/bin/node" "/tmp/old/.claude/action-graph/consume.js"', timeout: 1 }] }],
      Stop: [{ hooks: [{ type: 'command', command: 'bash /tmp/old/.claude/action-graph/refresh.sh', timeout: 1 }] }],
      PreCompact: [{ hooks: [{ type: 'command', command: 'echo unrelated', timeout: 2 }] }],
    },
  }, null, 2));

  const env = {
    ...process.env,
    CLAUDE_CONFIG_DIR: claude,
    ORIENTATION_HOME: runtime,
    ORIENTATION_NODE: NODE,
  };

  runInstall(env);
  runInstall(env);

  console.log('install invariants:');
  assert(fs.existsSync(path.join(runtime, 'consume.js')), 'engine copied to ORIENTATION_HOME');
  assert(fs.existsSync(path.join(runtime, 'paths.js')), 'shared path module copied');
  assert((fs.statSync(path.join(runtime, 'refresh.sh')).mode & 0o111) !== 0, 'refresh.sh is executable');
  assert(fs.existsSync(path.join(claude, 'skills', 'get-oriented', 'SKILL.md')), 'skill installed under CLAUDE_CONFIG_DIR');

  const projects = fs.readFileSync(path.join(runtime, 'projects.txt'), 'utf8');
  assert(projects.includes('/home/you/projects'), 'allowlist example is generic');
  assert(!/\/home\/(?!you\/)[^/]+\/projects/.test(projects), 'allowlist example has no concrete Linux user path');

  const settings = readSettings();
  for (const event of ['SessionStart', 'Stop', 'PreCompact']) {
    const hooks = ownedHooks(settings, event);
    assert(hooks.length === 1, `${event} has exactly one orientation hook`);
    assert(hooks[0] && hooks[0].command.includes(runtime), `${event} hook points at custom runtime`);
  }
  assert(commandHooks(settings, 'PreCompact').some(h => h.command === 'echo unrelated'), 'unrelated hook is preserved');

  execFileSync(NODE, [path.join(ROOT, 'bin', 'orientation'), 'refresh'], {
    cwd: ROOT,
    env,
    encoding: 'utf8',
  });
  const provenance = execFileSync(NODE, [path.join(ROOT, 'bin', 'orientation'), 'provenance', '/__missing__', 'README.md'], {
    cwd: ROOT,
    env,
    encoding: 'utf8',
  });
  assert(/no action-graph/i.test(provenance), 'installed CLI reads from temp runtime');
}

try {
  run();
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(failures ? `\nFAILED (${failures})` : '\nPASS');
process.exit(failures ? 1 : 0);

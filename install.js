#!/usr/bin/env node
// orientation installer/sync tool.
//
// Idempotently syncs the local engine and get-oriented skill into:
//   - Codex:  ~/.codex/skills/get-oriented plus ~/.eigen/orientation runtime
//   - Claude: ~/.claude/skills/get-oriented plus ~/.claude/action-graph runtime
//   - Eigen:  ~/.eigen/skills/get-oriented plus ~/.eigen/orientation runtime/hooks

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const PKG = __dirname;
const SRC = path.join(PKG, 'src');
const SKILL = path.join(PKG, 'skills', 'get-oriented', 'SKILL.md');
const PROJECTS_EXAMPLE = path.join(PKG, 'projects.txt.example');
const HOME = os.homedir();

const CODEX = process.env.CODEX_HOME || path.join(HOME, '.codex');
const CLAUDE = process.env.CLAUDE_CONFIG_DIR || path.join(HOME, '.claude');
const EIGEN = process.env.EIGEN_HOME || path.join(HOME, '.eigen');

const CODEX_ENGINE = process.env.EIGEN_ORIENTATION_DIR || path.join(EIGEN, 'orientation');
const CLAUDE_ENGINE = path.join(CLAUDE, 'action-graph');
const EIGEN_SKILL = path.join(EIGEN, 'skills', 'get-oriented');
const CODEX_SKILL = path.join(CODEX, 'skills', 'get-oriented');
const CLAUDE_SKILL = path.join(CLAUDE, 'skills', 'get-oriented');

const NODE = process.execPath;

function log(message) {
  console.log(`[orientation] ${message}`);
}

function usage() {
  console.log(`usage:
  node install.js [--all|--codex|--claude|--eigen] [--no-hooks] [--dry-run]

defaults:
  node install.js              same as --all

targets:
  --codex                      sync Codex skill and ~/.eigen/orientation runtime
  --claude                     sync Claude skill, ~/.claude/action-graph runtime, hooks
  --eigen                      sync Eigen skill/runtime/hooks
  --all                        sync all targets

environment:
  CODEX_HOME                   default ${CODEX}
  CLAUDE_CONFIG_DIR            default ${CLAUDE}
  EIGEN_HOME                   default ${EIGEN}
  EIGEN_ORIENTATION_DIR        default ${CODEX_ENGINE}`);
}

function parseArgs(argv) {
  const targets = new Set();
  let hooks = true;
  let dryRun = false;

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
    } else if (arg === '--all') {
      targets.add('codex');
      targets.add('claude');
      targets.add('eigen');
    } else if (arg === '--codex') {
      targets.add('codex');
    } else if (arg === '--claude') {
      targets.add('claude');
    } else if (arg === '--eigen') {
      targets.add('eigen');
    } else if (arg === '--no-hooks') {
      hooks = false;
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else {
      throw new Error(`unknown option: ${arg}`);
    }
  }

  if (!targets.size) {
    targets.add('codex');
    targets.add('claude');
    targets.add('eigen');
  }

  return { targets, hooks, dryRun };
}

function mkdir(dir, dryRun) {
  if (dryRun) {
    log(`would create ${dir}`);
    return;
  }
  fs.mkdirSync(dir, { recursive: true });
}

function copyFile(src, dst, dryRun) {
  if (dryRun) {
    log(`would copy ${src} -> ${dst}`);
    return;
  }
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  if (src.endsWith('.sh') || path.basename(src) === 'orientation') {
    fs.chmodSync(dst, 0o755);
  }
}

function copyEngine(dst, dryRun) {
  mkdir(dst, dryRun);
  for (const name of fs.readdirSync(SRC)) {
    const src = path.join(SRC, name);
    const st = fs.statSync(src);
    if (!st.isFile()) continue;
    copyFile(src, path.join(dst, name), dryRun);
  }
  seedProjects(dst, dryRun);
  log(`engine -> ${dst}`);
}

function copySkill(dst, dryRun) {
  mkdir(dst, dryRun);
  copyFile(SKILL, path.join(dst, 'SKILL.md'), dryRun);
  log(`skill -> ${dst}`);
}

function readSeed() {
  try {
    return fs.readFileSync(PROJECTS_EXAMPLE, 'utf8');
  } catch {
    return '# orientation allowlist - one cwd prefix per line.\n# e.g. /home/you/projects\n';
  }
}

function seedProjects(engineDir, dryRun) {
  const dst = path.join(engineDir, 'projects.txt');
  if (dryRun) {
    log(fs.existsSync(dst) ? `projects.txt exists -> ${dst}` : `would seed ${dst}`);
    return;
  }
  // Exclusive create ('wx'): never clobbers an existing allowlist and is atomic,
  // so there is no check-then-write TOCTOU window.
  try {
    fs.writeFileSync(dst, readSeed(), { flag: 'wx' });
    log(`projects.txt seeded -> ${dst}`);
  } catch (err) {
    if (err.code === 'EEXIST') { log(`projects.txt exists -> ${dst}`); return; }
    throw err;
  }
}

function runHookManager(engineDir, runtime, dryRun) {
  const script = path.join(engineDir, 'hooks.js');
  const env = {
    ...process.env,
    ORIENTATION_HOME: engineDir,
    ORIENTATION_ENGINE_DIR: engineDir,
  };
  const args = [script, 'install', '--runtime', runtime];
  if (dryRun) {
    log(`would run ${NODE} ${args.join(' ')}`);
    return;
  }
  const result = spawnSync(NODE, args, { stdio: 'inherit', env });
  if (result.status !== 0) {
    throw new Error(`hook install failed for ${runtime}`);
  }
}

function syncCodex(opts) {
  copyEngine(CODEX_ENGINE, opts.dryRun);
  copySkill(CODEX_SKILL, opts.dryRun);
  copySkill(EIGEN_SKILL, opts.dryRun);
  if (opts.hooks) runHookManager(CODEX_ENGINE, 'eigen', opts.dryRun);
}

function syncClaude(opts) {
  copyEngine(CLAUDE_ENGINE, opts.dryRun);
  copySkill(CLAUDE_SKILL, opts.dryRun);
  if (opts.hooks) runHookManager(CLAUDE_ENGINE, 'claude-code', opts.dryRun);
}

function syncEigen(opts) {
  copyEngine(CODEX_ENGINE, opts.dryRun);
  copySkill(EIGEN_SKILL, opts.dryRun);
  if (opts.hooks) runHookManager(CODEX_ENGINE, 'eigen', opts.dryRun);
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  log(`syncing from ${PKG}`);
  if (opts.targets.has('codex')) syncCodex(opts);
  if (opts.targets.has('claude')) syncClaude(opts);
  if (opts.targets.has('eigen') && !opts.targets.has('codex')) syncEigen(opts);
  log('done');
}

try {
  main();
} catch (error) {
  console.error(`[orientation] ${error.message}`);
  process.exit(1);
}

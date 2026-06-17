#!/usr/bin/env node
// Regression guard for get-oriented skill metadata. Keep this independent of
// any host's YAML parser so it catches shape drift before Codex or agnix does.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SKILL_DIR = path.join(ROOT, 'skill', 'get-oriented');
const SKILL_MD = path.join(SKILL_DIR, 'SKILL.md');
const AGNIX_CONFIG = path.join(SKILL_DIR, '.agnix.toml');
const ALLOWED_KEYS = new Set(['name', 'description']);

const OLD_FRONTMATTER_FAILURE = `---
name: get-oriented
description: "Use when judging unfamiliar code."
allowed-tools:
  - Bash(git rev-parse:*)
  - Bash(orientation:*)
  - Bash(node:*)
  - Read
---
`;

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log(`  ok   ${msg}`);
  else {
    console.log(`  FAIL ${msg}`);
    failures++;
  }
}

function frontmatterLines(text) {
  const lines = text.split(/\r?\n/);
  assert(lines[0] === '---', 'frontmatter opens with ---');
  const end = lines.indexOf('---', 1);
  assert(end > 0, 'frontmatter closes with ---');
  return lines.slice(1, end);
}

function parseSimpleFrontmatter(text) {
  const parsed = {};
  let listKey = null;
  for (const line of frontmatterLines(text)) {
    if (!line.trim()) continue;
    if (line.startsWith('  - ') && listKey) {
      parsed[listKey].push(line.slice(4).trim());
      continue;
    }
    if (/^\s/.test(line)) {
      throw new Error(`unsupported nested frontmatter line: ${line}`);
    }
    const idx = line.indexOf(':');
    if (idx < 0) throw new Error(`frontmatter line is not key/value: ${line}`);
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (value) {
      parsed[key] = value.replace(/^"(.*)"$/, '$1');
      listKey = null;
    } else {
      parsed[key] = [];
      listKey = key;
    }
  }
  return parsed;
}

function isCodexSafe(frontmatter) {
  return Object.entries(frontmatter).every(([key, value]) =>
    ALLOWED_KEYS.has(key) && typeof value === 'string' && value.length > 0
  );
}

function runAgnix(target) {
  const result = spawnSync('agnix', [
    '--format', 'json',
    '--config', AGNIX_CONFIG,
    '--target', target,
    SKILL_DIR,
  ], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert(result.status === 0, `agnix exits 0 for ${target}`);
  assert(result.stderr === '', `agnix emits no stderr for ${target}`);
  if (result.status !== 0 || result.stderr) {
    console.log(result.stderr || result.stdout);
    return;
  }
  const payload = JSON.parse(result.stdout);
  assert(payload.summary.errors === 0, `agnix reports 0 errors for ${target}`);
  assert(payload.summary.warnings === 0, `agnix reports 0 warnings for ${target}`);
  assert(payload.summary.info === 0, `agnix reports 0 info diagnostics for ${target}`);
}

console.log('skill frontmatter regression:');

const oldFrontmatter = parseSimpleFrontmatter(OLD_FRONTMATTER_FAILURE);
assert(Array.isArray(oldFrontmatter['allowed-tools']), 'old allowed-tools list shape is replayed');
assert(!isCodexSafe(oldFrontmatter), 'old frontmatter shape is rejected by local guard');

const skill = fs.readFileSync(SKILL_MD, 'utf8');
const frontmatter = parseSimpleFrontmatter(skill);
assert(frontmatter.name === 'get-oriented', 'skill name is get-oriented');
assert(typeof frontmatter.description === 'string', 'skill description is scalar');
assert(isCodexSafe(frontmatter), 'current frontmatter is Codex-safe');
assert(!Object.hasOwn(frontmatter, 'allowed-tools'), 'current frontmatter omits allowed-tools');

for (const expected of [
  'Frontmatter Safety',
  'orientation provenance',
  'orientation related',
  '~/.eigen/orientation/consume.js',
  '~/.claude/action-graph/consume.js',
]) {
  assert(skill.includes(expected), `skill body keeps ${expected}`);
}

const agnix = spawnSync('agnix', ['--version'], { encoding: 'utf8' });
if (agnix.status === 0) {
  runAgnix('claude-code');
  runAgnix('codex');
} else {
  console.log('  skip agnix not installed');
}

console.log(failures ? `\nFAILED (${failures})` : '\nPASS');
process.exit(failures ? 1 : 0);

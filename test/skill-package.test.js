#!/usr/bin/env node
// Package checks for the get-oriented skill. Keep these in Node so the
// JavaScript package has one test entrypoint: npm test.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SKILL_DIR = path.join(ROOT, 'skill', 'get-oriented');
const SKILL_MD = path.join(SKILL_DIR, 'SKILL.md');
const AGNIX_CONFIG = path.join(SKILL_DIR, '.agnix.toml');
const ALLOWED_FRONTMATTER_KEYS = new Set(['name', 'description']);

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
function assert(cond, msg, detail = '') {
  if (cond) console.log(`  ok   ${msg}`);
  else {
    console.log(`  FAIL ${msg}${detail ? `\n${detail}` : ''}`);
    failures++;
  }
}

function ensure(cond, msg) {
  if (!cond) throw new Error(msg);
}

function frontmatterLines(text) {
  const lines = text.split(/\r?\n/);
  ensure(lines[0] === '---', 'frontmatter missing opening fence');
  const end = lines.indexOf('---', 1);
  ensure(end !== -1, 'frontmatter missing closing fence');
  return lines.slice(1, end);
}

function parseSimpleFrontmatter(text) {
  const parsed = {};
  let currentListKey = null;
  for (const rawLine of frontmatterLines(text)) {
    if (!rawLine.trim()) continue;
    if (rawLine.startsWith('  - ') && currentListKey) {
      parsed[currentListKey] ||= [];
      ensure(Array.isArray(parsed[currentListKey]), `${currentListKey} mixes scalar and list values`);
      parsed[currentListKey].push(rawLine.slice(4).trim());
      continue;
    }
    ensure(!rawLine.startsWith(' '), `unsupported nested frontmatter line: ${rawLine}`);
    const idx = rawLine.indexOf(':');
    ensure(idx !== -1, `frontmatter line is not key/value: ${rawLine}`);
    const key = rawLine.slice(0, idx).trim();
    const value = rawLine.slice(idx + 1).trim();
    if (value) {
      parsed[key] = value.replace(/^"(.*)"$/, '$1');
      currentListKey = null;
    } else {
      parsed[key] = [];
      currentListKey = key;
    }
  }
  return parsed;
}

function isCodexSafeFrontmatter(frontmatter) {
  return Object.entries(frontmatter).every(([key, value]) => (
    ALLOWED_FRONTMATTER_KEYS.has(key) && typeof value === 'string' && value.length > 0
  ));
}

function agnixAvailable() {
  const result = spawnSync('agnix', ['--version'], { encoding: 'utf8' });
  return !result.error && result.status === 0;
}

function agnixCheck(target) {
  return spawnSync('agnix', [
    '--format', 'json',
    '--config', AGNIX_CONFIG,
    '--target', target,
    SKILL_DIR,
  ], {
    cwd: ROOT,
    encoding: 'utf8',
  });
}

function main() {
  console.log('skill package invariants:');

  const old = parseSimpleFrontmatter(OLD_FRONTMATTER_FAILURE);
  assert(Array.isArray(old['allowed-tools']), 'old allowed-tools frontmatter parses as unsafe list');
  assert(!isCodexSafeFrontmatter(old), 'old allowed-tools frontmatter is rejected by package guard');

  const text = fs.readFileSync(SKILL_MD, 'utf8');
  const frontmatter = parseSimpleFrontmatter(text);
  assert(frontmatter.name === 'get-oriented', 'skill name is get-oriented');
  assert(String(frontmatter.description || '').includes('orientation history'), 'skill description names orientation history');
  assert(isCodexSafeFrontmatter(frontmatter), 'skill frontmatter stays Codex-safe');
  assert(!Object.hasOwn(frontmatter, 'allowed-tools'), 'skill frontmatter omits allowed-tools');

  for (const needle of [
    'orientation provenance',
    'orientation related',
    '~/.eigen/orientation/consume.js',
    '~/.claude/action-graph/consume.js',
    'Frontmatter Safety',
  ]) {
    assert(text.includes(needle), `skill body keeps ${needle}`);
  }

  if (!agnixAvailable()) {
    console.log('  skip agnix validation (agnix not installed)');
  } else {
    for (const target of ['claude-code', 'codex']) {
      const result = agnixCheck(target);
      assert(result.status === 0, `agnix accepts package for ${target}`, result.stderr || result.stdout);
      assert(result.stderr === '', `agnix ${target} stderr is empty`, result.stderr);
      if (result.stdout) {
        const payload = JSON.parse(result.stdout);
        const summary = payload.summary || {};
        assert(summary.errors === 0, `agnix ${target} has zero errors`, result.stdout);
        assert(summary.warnings === 0, `agnix ${target} has zero warnings`, result.stdout);
        assert(summary.info === 0, `agnix ${target} has zero info messages`, result.stdout);
      }
    }
  }

  console.log(failures ? `\nFAILED (${failures})` : '\nPASS');
  process.exit(failures ? 1 : 0);
}

main();

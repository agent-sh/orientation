#!/usr/bin/env node
// action-graph selftest — synthetic end-to-end check. No real transcripts.
// Feeds a known raw.jsonl through condense→graph→consume and asserts the
// invariants that prior bugs violated. Run: node selftest.js
// Exit 0 = pass, 1 = fail. Keeps the pipeline honest after edits.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { projectKey } = require('../src/project');
const { parseRows } = require('../src/adapters');

const AG = path.join(__dirname, '..', 'src'); // engine scripts live in src/ in the repo
const TEST_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'orientation-selftest-'));
const ROOT = path.join(TEST_HOME, 'data');
const NODE = process.execPath;
const FIX_CWD = '/__selftest__/proj';
const key = projectKey(FIX_CWD);
const dir = path.join(ROOT, key);
const TEST_ENV = {
  ...process.env,
  ORIENTATION_HOME: TEST_HOME,
  ORIENTATION_ENGINE_DIR: AG,
  CODEX_HOME: path.join(TEST_HOME, 'codex'),
  CLAUDE_CONFIG_DIR: path.join(TEST_HOME, 'claude'),
  EIGEN_HOME: path.join(TEST_HOME, 'eigen'),
};

let failures = 0;
function assert(cond, msg) {
  if (cond) { console.log(`  ok   ${msg}`); }
  else { console.log(`  FAIL ${msg}`); failures++; }
}

// --- synthetic raw.jsonl exercising every known edge case -------------------
const T = '2026-01-01T00:00:00.000Z';
// Sized so HUB cutoff (>25% of goals) and gap filter (>=3) behave realistically:
// 8 file-goals, the popup/profile thread split by >=3 unrelated detour goals,
// and connector files (popup.js, profile.js) each touched by only 2 goals (<25%).
const edit = (turn, ...files) => ({ t: T, session: 's1', turn, kind: 'edit', files, tool: 'Edit' });
const raw = [
  // goal 1: edit, fail-then-pass test, commit (must read "Tests ran", not FAILED)
  { t: T, session: 's1', kind: 'intent', text: 'fix the auth token expiry bug' },
  edit('a1', 'src/auth.js'),
  { t: T, session: 's1', turn: 'a2', kind: 'test', cmd: 'npm test', reason: 'run suite', failed: true },
  edit('a3', 'src/auth.js'),
  { t: T, session: 's1', turn: 'a4', kind: 'test', cmd: 'npm test', reason: 'run suite' },
  { t: T, session: 's1', turn: 'a5', kind: 'commit', cmd: 'git commit', msg: 'fix auth token expiry' },
  // interruption → next intent is a structural steer
  { t: T, session: 's1', kind: 'interrupt' },
  // goal 2: the popup/profile thread STARTS here (idx 1)
  { t: T, session: 's1', kind: 'intent', text: 'the popup is not closing on click' },
  edit('b1', 'src/popup.js', 'src/profile.js'),
  // --- detour goals (idx 2,3,4) so the resume is non-adjacent (gap>=3) ---
  { t: T, session: 's1', kind: 'intent', text: 'update the readme with install steps' },
  edit('c1', 'README.md'),
  { t: T, session: 's1', kind: 'intent', text: 'bump the dependency versions' },
  edit('c2', 'package.json'),
  { t: T, session: 's1', kind: 'intent', text: 'tidy the eslint config' },
  edit('c3', '.eslintrc'),
  // goal 6: explicit resume marker, returns to popup+profile (idx 5, gap 4 from idx 1)
  { t: T, session: 's1', kind: 'intent', text: 'back to the popup, also touch profile again' },
  edit('d1', 'src/popup.js', 'src/profile.js'),
];

function run() {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'raw.jsonl'), raw.map(r => JSON.stringify(r)).join('\n') + '\n');

  execFileSync(NODE, [path.join(AG, 'condense.js'), key], { encoding: 'utf8', env: TEST_ENV });
  execFileSync(NODE, [path.join(AG, 'graph.js'), key], { encoding: 'utf8', env: TEST_ENV });

  const eps = JSON.parse(fs.readFileSync(path.join(dir, 'episodes.json'), 'utf8')).episodes;
  const graph = JSON.parse(fs.readFileSync(path.join(dir, 'graph.json'), 'utf8'));

  console.log('condense invariants:');
  const authEp = eps.find(e => e.intent && e.intent.includes('auth token expiry'));
  assert(!!authEp, 'auth goal episode exists');
  // fail-then-pass must NOT report Tests FAILED (last outcome wins)
  assert(authEp && !/Tests FAILED/.test(authEp.prose), 'fail-then-pass reads as passed, not FAILED');
  assert(authEp && /Committed/.test(authEp.prose), 'committed goal marked committed');
  assert(authEp && authEp.deadEnds >= 1, 'dead-end (the failed test) preserved in count');

  console.log('graph invariants:');
  const rels = graph.edges.reduce((m, e) => (m[e.rel] = (m[e.rel] || 0) + 1, m), {});
  assert((rels.touched || 0) > 0, 'touched edges exist');
  assert((rels.coupled || 0) > 0, 'coupled edges exist (popup+auth co-edited)');
  assert((rels.outcome || 0) > 0, 'outcome edges exist');
  // popup.js + auth.js co-edited in two non-adjacent goals → resume edge
  const resume = graph.edges.filter(e => e.rel === 'resumes');
  assert(resume.length >= 1, 'at least one resume edge (popup/auth thread)');
  assert(resume.every(e => e.weight >= 0.45), 'all resume edges meet cosine floor 0.45');

  console.log('consume invariants:');
  const out = execFileSync(NODE, [path.join(AG, 'consume.js'), FIX_CWD], { encoding: 'utf8', env: TEST_ENV });
  const ctx = JSON.parse(out).hookSpecificOutput.additionalContext;
  // inject is a thin POINTER, not a data dump: names the skill + goal count, no goal text
  assert(/get-oriented/.test(ctx), 'inject points to the get-oriented skill');
  assert(/\d+ goals/.test(ctx), 'inject states the goal count');
  assert(!/auth token expiry/.test(ctx) && !/popup/.test(ctx), 'inject does NOT dump goal text (no context theft)');

  // provenance verdict — regression guard for the uncommitted≠abandoned bug.
  // Fixture records are all "now" (same timestamp), so recent work must read as
  // IN FLIGHT / deliberate, NEVER abandoned. This is the failure that mislabeled
  // active codex-wrapper-updater work as abandoned.
  const prov = execFileSync(NODE, [path.join(AG, 'consume.js'), '--provenance', FIX_CWD, 'src/auth.js'], { encoding: 'utf8', env: TEST_ENV });
  assert(/IN FLIGHT|DELIBERATE/.test(prov), 'recent work reads as in-flight/deliberate');
  assert(!/abandoned/i.test(prov) || /not.*abandon|NOT abandoned/i.test(prov), 'recent work is NOT labeled abandoned');
  assert(/Last touched/.test(prov), 'provenance reports recency (the decisive signal)');

  console.log('codex adapter invariants:');
  const codex = parseRows('codex', [
    { type: 'session_meta', payload: { id: '01234567-89ab-cdef-0123-456789abcdef', cwd: FIX_CWD } },
    {
      timestamp: T,
      type: 'response_item',
      payload: {
        type: 'custom_tool_call',
        call_id: 'patch-call',
        name: 'functions.apply_patch',
        input: '*** Begin Patch\n*** Update File: README.md\n@@\n-old\n+new\n*** End Patch\n',
      },
    },
  ], { source: '/tmp/rollout.jsonl', cwd: FIX_CWD });
  const patch = codex.find(r => r.kind === 'edit');
  assert(patch && patch.files.includes('README.md'), 'codex apply_patch input records touched files');

  console.log('install invariants:');
  // Install WITH hooks (not --no-hooks) so hook wiring is actually exercised.
  // Seed an unrelated user hook first; it must survive the install.
  const claudeSettingsPath = path.join(TEST_ENV.CLAUDE_CONFIG_DIR, 'settings.json');
  fs.mkdirSync(TEST_ENV.CLAUDE_CONFIG_DIR, { recursive: true });
  fs.writeFileSync(claudeSettingsPath, JSON.stringify({
    hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo unrelated-user-hook', timeout: 3 }] }] },
  }, null, 2));

  execFileSync(NODE, [path.join(__dirname, '..', 'install.js'), '--all'], {
    encoding: 'utf8',
    env: TEST_ENV,
  });
  assert(fs.existsSync(path.join(TEST_ENV.CODEX_HOME, 'skills', 'get-oriented', 'SKILL.md')), 'codex skill installed');
  assert(fs.existsSync(path.join(TEST_ENV.CLAUDE_CONFIG_DIR, 'skills', 'get-oriented', 'SKILL.md')), 'claude skill installed');
  assert(fs.existsSync(path.join(TEST_ENV.EIGEN_HOME, 'skills', 'get-oriented', 'SKILL.md')), 'eigen skill installed');
  assert(fs.existsSync(path.join(TEST_ENV.EIGEN_HOME, 'orientation', 'consume.js')), 'eigen orientation engine installed');
  assert(fs.existsSync(path.join(TEST_ENV.CLAUDE_CONFIG_DIR, 'action-graph', 'consume.js')), 'claude orientation engine installed');

  console.log('hook wiring invariants:');
  const ownedClaude = (settings) => ['SessionStart', 'Stop', 'PreCompact'].map(ev =>
    (settings.hooks?.[ev] || []).flatMap(g => g.hooks || []).filter(h => /ORIENTATION_HOOK=1/.test(h.command || '')));
  let claudeSettings = JSON.parse(fs.readFileSync(claudeSettingsPath, 'utf8'));
  const [ss, stop, pre] = ownedClaude(claudeSettings);
  assert(ss.length === 1 && /consume\.js/.test(ss[0].command), 'SessionStart wires consume.js with ORIENTATION_HOOK=1 sentinel');
  assert(stop.length === 1 && /hook\.js/.test(stop[0].command), 'Stop wires hook.js with sentinel');
  assert(pre.length === 1 && /hook\.js/.test(pre[0].command), 'PreCompact wires hook.js with sentinel');
  // unrelated user hook preserved
  const unrelated = (claudeSettings.hooks.Stop || []).flatMap(g => g.hooks || []).filter(h => h.command === 'echo unrelated-user-hook');
  assert(unrelated.length === 1, 'unrelated user Stop hook preserved through install');
  // eigen hooks.json wired
  const eigenHooksPath = path.join(TEST_ENV.EIGEN_HOME, 'hooks.json');
  assert(fs.existsSync(eigenHooksPath), 'eigen hooks.json written');
  const eigenCfg = JSON.parse(fs.readFileSync(eigenHooksPath, 'utf8'));
  const eigenEvents = new Set((eigenCfg.hooks || []).map(h => h.event));
  assert(['turn_done', 'session_stop', 'note'].every(e => eigenEvents.has(e)), 'eigen turn_done/session_stop/note wired');

  console.log('idempotency invariants:');
  // Re-running install must change nothing (0 changed) and not duplicate hooks.
  const rerun = execFileSync(NODE, [path.join(__dirname, '..', 'install.js'), '--claude'], { encoding: 'utf8', env: TEST_ENV });
  assert(/already present|\(0 changed\)/.test(rerun), 'claude hook re-install reports 0 changed (idempotent)');
  claudeSettings = JSON.parse(fs.readFileSync(claudeSettingsPath, 'utf8'));
  const [ss2, stop2, pre2] = ownedClaude(claudeSettings);
  assert(ss2.length === 1 && stop2.length === 1 && pre2.length === 1, 'no duplicate orientation hooks after re-install');

  console.log('live hook fire invariants:');
  // Build a minimal real Claude transcript and fire the wired Stop hook (hook.js)
  // the way the harness does: cwd + transcript_path on stdin. allowUnlisted so the
  // fresh allowlist does not gate it. Then assert it ingested + rebuilt the graph.
  const HOOK_CWD = path.join(TEST_HOME, 'hookproj');
  fs.mkdirSync(HOOK_CWD, { recursive: true });
  const transcript = path.join(TEST_HOME, 'transcript.jsonl');
  const tRows = [
    { type: 'user', cwd: HOOK_CWD, timestamp: T, message: { content: [{ type: 'text', text: 'add a healthcheck endpoint to the server' }] } },
    { type: 'assistant', uuid: 'u-aaaaaaaaaaaa', timestamp: T, message: { content: [{ type: 'tool_use', id: 'tu1', name: 'Edit', input: { file_path: 'src/server.js' } }] } },
    { type: 'user', cwd: HOOK_CWD, timestamp: T, message: { content: [{ type: 'tool_result', tool_use_id: 'tu1', content: 'ok' }] } },
  ];
  fs.writeFileSync(transcript, tRows.map(r => JSON.stringify(r)).join('\n') + '\n');
  const claudeEngine = path.join(TEST_ENV.CLAUDE_CONFIG_DIR, 'action-graph');
  const HOOK_ENV = { ...TEST_ENV, ORIENTATION_HOME: claudeEngine, ORIENTATION_ENGINE_DIR: claudeEngine, ORIENTATION_HOOK: '1' };
  execFileSync(NODE, [path.join(claudeEngine, 'hook.js')], {
    encoding: 'utf8',
    env: HOOK_ENV,
    input: JSON.stringify({ cwd: HOOK_CWD, hook_event_name: 'Stop', transcript_path: transcript, session_id: 'selftestsess', allowUnlisted: true }),
  });
  const hookKey = projectKey(HOOK_CWD);
  const hookData = path.join(claudeEngine, 'data', hookKey);
  assert(fs.existsSync(path.join(hookData, 'raw.jsonl')), 'wired Stop hook ingested transcript to raw.jsonl');
  assert(fs.existsSync(path.join(hookData, 'graph.json')), 'wired Stop hook rebuilt graph.json');
  // SessionStart consume.js fires on the same home and emits the history pointer
  const ssOut = execFileSync(NODE, [path.join(claudeEngine, 'consume.js')], {
    encoding: 'utf8', env: HOOK_ENV, input: JSON.stringify({ cwd: HOOK_CWD, hook_event_name: 'SessionStart' }),
  });
  assert(/get-oriented|goals/.test(ssOut), 'wired SessionStart consume.js emits history pointer once data exists');

  console.log('clean remove invariants:');
  execFileSync(NODE, [path.join(claudeEngine, 'hooks.js'), 'remove', '--runtime', 'claude-code'], { encoding: 'utf8', env: HOOK_ENV });
  claudeSettings = JSON.parse(fs.readFileSync(claudeSettingsPath, 'utf8'));
  const ownedAfter = ownedClaude(claudeSettings).flat();
  assert(ownedAfter.length === 0, 'remove deletes all orientation hooks');
  assert(!('SessionStart' in claudeSettings.hooks) && !('PreCompact' in claudeSettings.hooks), 'remove drops emptied event keys (clean inverse)');
  const survivor = (claudeSettings.hooks.Stop || []).flatMap(g => g.hooks || []).filter(h => h.command === 'echo unrelated-user-hook');
  assert(survivor.length === 1, 'unrelated user hook survives remove');

  console.log('subcommand smoke invariants:');
  const bin = path.join(__dirname, '..', 'bin', 'orientation');
  const smoke = (args) => execFileSync(NODE, [bin, ...args], { encoding: 'utf8', env: HOOK_ENV });
  assert(/episode\(s\) match|healthcheck/.test(smoke(['query', HOOK_CWD, 'healthcheck'])), 'query subcommand runs and finds the goal');
  assert(smoke(['status', HOOK_CWD]).length > 0, 'status subcommand produces output');
  assert(/engine|state|skill/i.test(smoke(['doctor', HOOK_CWD])), 'doctor subcommand reports runtime state');
  assert(smoke(['coupled', HOOK_CWD, 'src/server.js']) !== undefined, 'coupled subcommand runs without error');

  // cleanup
  fs.rmSync(TEST_HOME, { recursive: true, force: true });

  console.log(failures ? `\nFAILED (${failures})` : '\nPASS');
  process.exit(failures ? 1 : 0);
}

run();

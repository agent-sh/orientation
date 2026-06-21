const path = require('path');
const os = require('os');

const HOME = os.homedir();
const CLAUDE = process.env.CLAUDE_CONFIG_DIR || path.join(HOME, '.claude');
const CODEX = process.env.CODEX_HOME || path.join(HOME, '.codex');
const EIGEN = process.env.EIGEN_HOME || path.join(HOME, '.eigen');

// Self-locating home: the installer copies the engine INTO its runtime home
// (~/.claude/action-graph for Claude, ~/.eigen/orientation for Codex/Eigen), so
// the directory this file lives in IS the default home and engine dir. This is
// self-consistent for every install target and avoids inferring the home by
// comparing against a recomputed default (which leaked a custom Eigen install
// back to the Claude legacy home on bare invocation). Env always wins: managed
// hooks and bin/orientation export ORIENTATION_HOME/ORIENTATION_ENGINE_DIR, and
// the marketplace plugin points ORIENTATION_HOME at the writable plugin data dir.
const LEGACY_HOME = path.join(CLAUDE, 'action-graph');
const EIGEN_ORIENTATION_HOME = process.env.EIGEN_ORIENTATION_HOME ||
  process.env.EIGEN_ORIENTATION_DIR ||
  path.join(EIGEN, 'orientation');
const SELF = path.resolve(__dirname);
const ORIENTATION_HOME = process.env.ORIENTATION_HOME || SELF;
const ENGINE_DIR = process.env.ORIENTATION_ENGINE_DIR || SELF;
const DATA_DIR = path.join(ORIENTATION_HOME, 'data');
const ALLOWLIST_FILE = path.join(ORIENTATION_HOME, 'projects.txt');
const CLAUDE_PROJECTS_DIR = path.join(CLAUDE, 'projects');
const CODEX_SESSIONS_DIR = path.join(CODEX, 'sessions');
const EIGEN_DIR = EIGEN;

module.exports = {
  HOME,
  CLAUDE,
  CODEX,
  EIGEN,
  LEGACY_HOME,
  EIGEN_ORIENTATION_HOME,
  ORIENTATION_HOME,
  ENGINE_DIR,
  DATA_DIR,
  ALLOWLIST_FILE,
  CLAUDE_PROJECTS_DIR,
  CODEX_SESSIONS_DIR,
  EIGEN_DIR,
};

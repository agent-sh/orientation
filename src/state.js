const path = require('path');
const os = require('os');

const HOME = os.homedir();
const CLAUDE = process.env.CLAUDE_CONFIG_DIR || path.join(HOME, '.claude');
const CODEX = process.env.CODEX_HOME || path.join(HOME, '.codex');
const EIGEN = process.env.EIGEN_HOME || path.join(HOME, '.eigen');

// Compatibility default: the original extracted runtime lived here. New installs
// can move state independently by setting ORIENTATION_HOME.
const LEGACY_HOME = path.join(CLAUDE, 'action-graph');
const EIGEN_ORIENTATION_HOME = process.env.EIGEN_ORIENTATION_HOME ||
  process.env.EIGEN_ORIENTATION_DIR ||
  path.join(EIGEN, 'orientation');
const HERE = path.resolve(__dirname);
const EIGEN_DEFAULT_HOME = path.resolve(EIGEN_ORIENTATION_HOME);
const DEFAULT_HOME = HERE === EIGEN_DEFAULT_HOME ? EIGEN_ORIENTATION_HOME : LEGACY_HOME;
const ORIENTATION_HOME = process.env.ORIENTATION_HOME || DEFAULT_HOME;
const ENGINE_DIR = process.env.ORIENTATION_ENGINE_DIR || DEFAULT_HOME;
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

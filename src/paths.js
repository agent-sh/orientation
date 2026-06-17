const os = require('os');
const path = require('path');

const CLAUDE = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const ACTION_GRAPH = process.env.ORIENTATION_HOME || path.join(CLAUDE, 'action-graph');
const DATA = path.join(ACTION_GRAPH, 'data');
const PROJECTS_DIR = process.env.ORIENTATION_PROJECTS_DIR || path.join(CLAUDE, 'projects');

module.exports = {
  CLAUDE,
  ACTION_GRAPH,
  DATA,
  PROJECTS_DIR,
};

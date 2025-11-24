/**
 * Talent Match Tools Registry
 * Central registry for all talent matching MCP tools
 */

const MatchBestApplicantsTool = require('./matchBestApplicants');

// Create tool instances
const matchBestApplicantsTool = new MatchBestApplicantsTool();

// Export tools and handlers
const tools = [
  matchBestApplicantsTool.getDefinition()
];

const handlers = {
  match_best_applicants: (args, context) => matchBestApplicantsTool.execute(args, context)
};

module.exports = {
  getTools: () => tools,
  getHandlers: () => handlers
};


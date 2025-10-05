/**
 * MCP Routes Index
 * Centralized exports for all MCP-related routes
 */

const aiJobCreationMCPRoutes = require('./aiJobCreationMCP.route');
const aiCallSchedulerMCPRoutes = require('./aiCallSchedulerMCP.route');

module.exports = {
  aiJobCreationMCPRoutes,
  aiCallSchedulerMCPRoutes
};

/**
 * MCP Routes Index
 * Centralized exports for all MCP-related routes
 */

const aiJobCreationRoutes = require('./aiJobCreation.route');
const aiCallSchedulerRoutes = require('./aiCallScheduler.route');

module.exports = {
  aiJobCreationRoutes,
  aiCallSchedulerRoutes
};

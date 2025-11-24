/**
 * MCP Routes Index
 * Centralized exports for all MCP-related routes
 */

const chatRoutes = require('./chat.route');
const aiJobCreationRoutes = require('./aiJobCreation.route'); // Kept for backward compatibility
const talentMatchRoutes = require('./talentMatch.route');

module.exports = {
  chatRoutes,
  aiJobCreationRoutes, // Legacy - use chatRoutes instead
  talentMatchRoutes
};

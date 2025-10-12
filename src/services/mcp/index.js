/**
 * MCP Services Index
 * Centralized exports for all MCP-related services
 */

const AIJobCreationService = require('./AIJobCreationService');
const RestaurantContextService = require('./RestaurantContextService');
const JobCreationProcessor = require('./JobCreationProcessor');

// Legacy export for backward compatibility
const AIJobCreationServiceMCP = require('./aiJobCreationServiceMCP');

module.exports = {
  // New clean services
  AIJobCreationService,
  RestaurantContextService,
  JobCreationProcessor,
  
  // Legacy service (deprecated)
  AIJobCreationServiceMCP
};

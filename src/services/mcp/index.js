/**
 * MCP Services Index
 * Centralized exports for all MCP-related services
 */

const RestaurantContextService = require('./RestaurantContextService');
const JobCreationProcessor = require('./JobCreationProcessor');

// Main service (current implementation)
const AIJobCreationServiceMCP = require('./aiJobCreationServiceMCP');

module.exports = {
  // Main services
  RestaurantContextService,
  JobCreationProcessor,
  
  // AI Job Creation Service (main export)
  AIJobCreationServiceMCP
};

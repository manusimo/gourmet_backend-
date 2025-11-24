/**
 * MCP Tools Registry
 * Central registry for all available MCP tools
 */

const jobTools = require('./job');
const schedulingTools = require('./scheduling');
const talentMatchTools = require('./talentMatch');
const communicationTools = require('./communication');
const restaurantTools = require('./restaurant');

/**
 * Get all available tools
 */
function getAllTools() {
  return [
    ...jobTools.getTools(),
    ...schedulingTools.getTools(),
    ...talentMatchTools.getTools(),
    ...communicationTools.getTools(),
    ...restaurantTools.getTools()
  ];
}

/**
 * Get tool handler by name
 */
function getToolHandler(toolName) {
  const handlers = {
    ...jobTools.getHandlers(),
    ...schedulingTools.getHandlers(),
    ...talentMatchTools.getHandlers(),
    ...communicationTools.getHandlers(),
    ...restaurantTools.getHandlers()
  };
  
  return handlers[toolName];
}

/**
 * Validate tool exists
 */
function toolExists(toolName) {
  const allTools = getAllTools();
  return allTools.some(tool => tool.name === toolName);
}

module.exports = {
  getAllTools,
  getToolHandler,
  toolExists
};

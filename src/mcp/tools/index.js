/**
 * MCP Tools Registry
 * Central registry for all available MCP tools
 */

const jobTools = require('./job');
const schedulingTools = require('./schedulingTools');
const dataTools = require('./dataTools');
const notificationTools = require('./notificationTools');

/**
 * Get all available tools
 */
function getAllTools() {
  return [
    ...jobTools.getTools(),
    ...schedulingTools.getTools(),
    ...dataTools.getTools(),
    ...notificationTools.getTools()
  ];
}

/**
 * Get tool handler by name
 */
function getToolHandler(toolName) {
  const handlers = {
    ...jobTools.getHandlers(),
    ...schedulingTools.getHandlers(),
    ...dataTools.getHandlers(),
    ...notificationTools.getHandlers()
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

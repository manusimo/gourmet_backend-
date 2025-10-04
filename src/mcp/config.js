/**
 * MCP Server Configuration
 */

const config = {
  server: {
    name: 'gourmet-jobs-mcp',
    version: '1.0.0',
    description: 'MCP Server for Gourmet Jobs Platform'
  },
  
  capabilities: {
    tools: {}
  },
  
  logging: {
    level: process.env.MCP_LOG_LEVEL || 'info',
    enableDebug: process.env.MCP_DEBUG === 'true'
  },
  
  database: {
    maxConnections: 10,
    connectionTimeout: 30000
  },
  
  tools: {
    timeout: 30000, // 30 seconds
    maxRetries: 3,
    retryDelay: 1000
  }
};

module.exports = config;

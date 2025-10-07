#!/usr/bin/env node

/**
 * MCP Server Startup Script
 * Starts the MCP server for agent communication
 */

const GourmetMCPServer = require('./server.js');

async function startMCPServer() {
  console.log('🚀 Starting Gourmet MCP Server...');
  
  const server = new GourmetMCPServer();
  
  try {
    await server.start();
    console.log('✅ MCP Server is running and ready for connections');
  } catch (error) {
    console.error('❌ Failed to start MCP Server:', error);
    process.exit(1);
  }
  
  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down MCP Server...');
    await server.stop();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    console.log('\n🛑 Shutting down MCP Server...');
    await server.stop();
    process.exit(0);
  });
}

// Start the server
startMCPServer().catch(console.error);

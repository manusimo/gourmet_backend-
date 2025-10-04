#!/usr/bin/env node

/**
 * MCP Server Startup Script
 * Handles graceful startup and shutdown of the MCP server
 */

const GourmetMCPServer = require('./mcpServer');
const config = require('./config');

class MCPServerManager {
  constructor() {
    this.server = null;
    this.isShuttingDown = false;
  }

  async start() {
    try {
      console.log('🚀 [MCP] Starting Gourmet Jobs MCP Server...');
      
      // Create server instance
      this.server = new GourmetMCPServer();
      
      // Setup graceful shutdown handlers
      this.setupGracefulShutdown();
      
      // Start the server
      await this.server.start();
      
      console.log('✅ [MCP] Server started successfully');
      console.log(`📋 [MCP] Server: ${config.server.name} v${config.server.version}`);
      
    } catch (error) {
      console.error('❌ [MCP] Failed to start server:', error);
      process.exit(1);
    }
  }

  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      if (this.isShuttingDown) return;
      
      this.isShuttingDown = true;
      console.log(`\n🛑 [MCP] Received ${signal}, shutting down gracefully...`);
      
      try {
        if (this.server) {
          await this.server.cleanup();
        }
        console.log('✅ [MCP] Server shutdown complete');
        process.exit(0);
      } catch (error) {
        console.error('❌ [MCP] Error during shutdown:', error);
        process.exit(1);
      }
    };

    // Handle different shutdown signals
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGUSR2', () => shutdown('SIGUSR2')); // For nodemon
    
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('❌ [MCP] Uncaught Exception:', error);
      shutdown('uncaughtException');
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      console.error('❌ [MCP] Unhandled Rejection at:', promise, 'reason:', reason);
      shutdown('unhandledRejection');
    });
  }
}

// Start server if this file is run directly
if (require.main === module) {
  const manager = new MCPServerManager();
  manager.start().catch(console.error);
}

module.exports = MCPServerManager;

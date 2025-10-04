/**
 * Example: How to integrate Embedded MCP Server into your main backend
 * Add this to your main app.js or server.js file
 */

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const EmbeddedMCPServer = require('./mcp/embeddedServer');

// Your existing app setup
const app = express();
const prisma = new PrismaClient();

// Your existing middleware and routes
app.use(express.json());
// ... your existing routes ...

// Initialize Embedded MCP Server
const mcpServer = new EmbeddedMCPServer(app, prisma);

// Start your server
const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    // Start MCP server
    await mcpServer.start();
    
    // Start Express server
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🔗 MCP endpoint: http://localhost:${PORT}/mcp`);
      console.log(`❤️ Health check: http://localhost:${PORT}/mcp/health`);
    });
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 Shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

startServer();

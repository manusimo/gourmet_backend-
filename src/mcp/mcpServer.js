const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const { PrismaClient } = require('@prisma/client');
const { getAllTools, getToolHandler, toolExists } = require('./tools');

/**
 * MCP Server for Gourmet Jobs Platform
 * Provides tools for AI agents to interact with the system
 */
class GourmetMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'gourmet-jobs-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.prisma = new PrismaClient();
    this.setupToolHandlers();
  }

  setupToolHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: getAllTools()
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        // Validate tool exists
        if (!toolExists(name)) {
          throw new Error(`Unknown tool: ${name}`);
        }

        // Get tool handler
        const handler = getToolHandler(name);
        if (!handler) {
          throw new Error(`No handler found for tool: ${name}`);
        }

        // Execute tool with context
        const context = { prisma: this.prisma };
        return await handler(args, context);

      } catch (error) {
        console.error(`❌ [MCP] Error executing tool ${name}:`, error);
        return {
          content: [
            {
              type: 'text',
              text: `Error executing tool ${name}: ${error.message}`
            }
          ],
          isError: true
        };
      }
    });
  }


  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.log('🚀 [MCP] Gourmet Jobs MCP Server started');
  }

  async cleanup() {
    try {
      console.log('🧹 [MCP] Cleaning up server resources...');
      
      // Disconnect from database
      if (this.prisma) {
        await this.prisma.$disconnect();
        console.log('✅ [MCP] Database connection closed');
      }
      
      // Disconnect MCP server
      if (this.server) {
        await this.server.close();
        console.log('✅ [MCP] MCP server disconnected');
      }
      
    } catch (error) {
      console.error('❌ [MCP] Error during cleanup:', error);
      throw error;
    }
  }
}

module.exports = GourmetMCPServer;

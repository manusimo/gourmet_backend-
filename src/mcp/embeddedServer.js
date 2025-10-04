const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { SSEServerTransport } = require('@modelcontextprotocol/sdk/server/sse.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const { getAllTools, getToolHandler, toolExists } = require('./tools');

/**
 * Embedded MCP Server for Gourmet Jobs Platform
 * Runs as part of the Express backend
 */
class EmbeddedMCPServer {
  constructor(app, prisma) {
    this.app = app;
    this.prisma = prisma;
    this.server = new Server(
      {
        name: 'gourmet-jobs-mcp-embedded',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );
    
    this.setupToolHandlers();
    this.setupRoutes();
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
        if (!toolExists(name)) {
          throw new Error(`Unknown tool: ${name}`);
        }

        const handler = getToolHandler(name);
        if (!handler) {
          throw new Error(`No handler found for tool: ${name}`);
        }

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

  setupRoutes() {
    // MCP endpoint for agents to connect to
    this.app.use('/mcp', async (req, res) => {
      try {
        // Handle MCP requests
        const transport = new SSEServerTransport('/mcp', res);
        await this.server.connect(transport);
      } catch (error) {
        console.error('❌ [MCP] Error handling MCP request:', error);
        res.status(500).json({ error: 'MCP server error' });
      }
    });

    // Health check endpoint
    this.app.get('/mcp/health', (req, res) => {
      res.json({
        status: 'healthy',
        server: 'gourmet-jobs-mcp-embedded',
        version: '1.0.0',
        tools: getAllTools().length,
        timestamp: new Date().toISOString()
      });
    });
  }

  async start() {
    console.log('🚀 [MCP] Embedded MCP Server initialized');
    console.log(`📋 [MCP] Available tools: ${getAllTools().length}`);
    console.log(`🔗 [MCP] MCP endpoint: /mcp`);
    console.log(`❤️ [MCP] Health check: /mcp/health`);
  }

  async cleanup() {
    try {
      console.log('🧹 [MCP] Cleaning up embedded MCP server...');
      
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

module.exports = EmbeddedMCPServer;

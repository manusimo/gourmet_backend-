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
    // SSE stream endpoint at /mcp/stream
    this.app.get('/mcp/stream', async (req, res) => {
      try {
        console.log('🔌 [MCP] Incoming SSE connection to /mcp/stream');
        // Keep connection open & prevent buffering
        req.socket.setKeepAlive(true);
        res.flushHeaders?.();
        // Ensure proper SSE headers for Node EventSource clients
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        // CORS (helpful for local dev when hitting from a different origin)
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
        const transport = new SSEServerTransport(req, res);
        await this.server.connect(transport);
      } catch (error) {
        console.error('❌ [MCP] Error handling MCP SSE request:', error);
        if (!res.headersSent) {
          res.status(500).json({ error: 'MCP server error' });
        }
      }
    });

    // The MCP SDK sends POST messages to the same endpoint; accept them here
    this.app.post('/mcp/stream', async (req, res) => {
      try {
        // Keep connection open & prevent buffering
        req.socket.setKeepAlive(true);
        res.flushHeaders?.();
        // Some SDK flows POST to the stream endpoint as part of handshake
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        // CORS (helpful for local dev when hitting from a different origin)
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
        const transport = new SSEServerTransport(req, res);
        await this.server.connect(transport);
      } catch (error) {
        console.error('❌ [MCP] Error handling MCP POST to /mcp/stream:', error);
        if (!res.headersSent) {
          res.status(500).json({ error: 'MCP server error' });
        }
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
    console.log(`🔗 [MCP] MCP stream endpoint: /mcp/stream`);
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

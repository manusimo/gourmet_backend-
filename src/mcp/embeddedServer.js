const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { SSEServerTransport } = require('@modelcontextprotocol/sdk/server/sse.js');
const { CallToolRequestSchema, ListToolsRequestSchema, InitializeRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
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
    
    // Store active transports by session ID
    this.activeTransports = new Map();
    
    this.setupToolHandlers();
    this.setupRoutes();
  }

  setupToolHandlers() {
    // Handle initialization requests
    this.server.setRequestHandler(InitializeRequestSchema, async (request) => {
      console.log('🔄 [MCP] Handling initialize request:', request);
      const response = {
        protocolVersion: '2025-06-18',
        capabilities: {
          tools: {}
        },
        serverInfo: {
          name: 'gourmet-jobs-mcp-embedded',
          version: '1.0.0'
        }
      };
      console.log('📤 [MCP] Sending initialize response:', response);
      return response;
    });

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
        
        // Let MCP SDK handle all headers - don't set them manually
        // The endpoint should be the same URL for POST requests
        const transport = new SSEServerTransport('/mcp/stream', res);
        
        // Store transport for POST requests (we'll get the session ID after connection)
        console.log('🔗 [MCP] Connecting server to transport...');
        await this.server.connect(transport);
        console.log('✅ [MCP] Server connected to transport');
        
        // Add debugging for MCP protocol messages
        transport.onmessage = (message) => {
          console.log('📨 [MCP] Received message from client:', message);
          console.log('🔍 [MCP] Message method:', message.method);
        };
        
        // Add debugging for server message handling
        this.server.onmessage = (message) => {
          console.log('📤 [MCP] Server sending message:', message);
        };
        
        transport.onerror = (error) => {
          console.error('❌ [MCP] Transport error:', error);
        };
        
        // Ensure the endpoint event is sent properly
        console.log('📤 [MCP] Sending endpoint event to client');
        
        // Get the session ID from the transport and store it
        const sessionId = transport._sessionId;
        this.activeTransports.set(sessionId, transport);
        console.log(`💾 [MCP] Stored transport for sessionId: ${sessionId}`);
        
        // Clean up transport when connection closes
        res.on('close', () => {
          console.log(`🔌 [MCP] SSE connection closed, cleaning up transport for sessionId: ${sessionId}`);
          this.activeTransports.delete(sessionId);
        });
      } catch (error) {
        console.error('❌ [MCP] Error handling MCP SSE request:', error);
        if (!res.headersSent) {
          res.status(500).json({ error: 'MCP server error' });
        }
      }
    });

    // The MCP SDK sends POST messages to the same endpoint with session ID
    this.app.post('/mcp/stream', async (req, res) => {
      try {
        const sessionId = req.query.sessionId;
        console.log(`📨 [MCP] Incoming POST to /mcp/stream with sessionId: ${sessionId}`);
        
        // Find the transport for this session
        const transport = this.activeTransports.get(sessionId);
        if (!transport) {
          console.error(`❌ [MCP] No transport found for sessionId: ${sessionId}`);
          res.status(404).json({ error: 'Session not found' });
          return;
        }
        
      // Handle the POST message using the existing transport
      console.log('🔄 [MCP] Processing POST message with transport...');
      await transport.handlePostMessage(req, res);
      console.log('✅ [MCP] POST message processed');
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

    // Debug: catch all MCP routes to see what's being requested
    this.app.all('/mcp/*', (req, res, next) => {
      console.log(`🔍 [MCP DEBUG] ${req.method} ${req.path} - Headers:`, req.headers);
      next();
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

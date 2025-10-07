/**
 * Production MCP Server Implementation
 * Real MCP server for agent communication and tool management
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const { getToolHandler, getAllTools } = require('./tools');

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

    this.setupHandlers();
  }

  setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools = getAllTools();
      return {
        tools: tools.map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema
        }))
      };
    });

    // Handle tool calls with production error handling
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const startTime = Date.now();
      
      try {
        console.log(`🔧 [MCP Server] Tool called: ${name}`, {
          timestamp: new Date().toISOString(),
          args: args ? Object.keys(args) : []
        });
        
        const handler = getToolHandler(name);
        if (!handler) {
          throw new Error(`Tool '${name}' not found`);
        }

        // Execute the tool with timeout
        const toolPromise = handler(args, { prisma: require('../db.js').prisma });
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Tool execution timeout')), 30000)
        );
        
        const result = await Promise.race([toolPromise, timeoutPromise]);
        const executionTime = Date.now() - startTime;
        
        console.log(`✅ [MCP Server] Tool '${name}' executed successfully`, {
          executionTime: `${executionTime}ms`,
          timestamp: new Date().toISOString()
        });
        
        return {
          content: [
            {
              type: 'text',
              text: typeof result === 'string' ? result : JSON.stringify(result)
            }
          ]
        };
      } catch (error) {
        const executionTime = Date.now() - startTime;
        console.error(`❌ [MCP Server] Tool '${name}' failed:`, {
          error: error.message,
          executionTime: `${executionTime}ms`,
          timestamp: new Date().toISOString(),
          stack: error.stack
        });
        
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`
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
    console.log('🚀 [MCP Server] Server started and listening for connections');
  }

  async stop() {
    await this.server.close();
    console.log('🛑 [MCP Server] Server stopped');
  }
}

// Start server if this file is run directly
if (require.main === module) {
  const server = new GourmetMCPServer();
  server.start().catch(console.error);
  
  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 [MCP Server] Shutting down...');
    await server.stop();
    process.exit(0);
  });
}

module.exports = GourmetMCPServer;

/**
 * Production MCP Client
 * Real MCP protocol client for production use
 */

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const { spawn } = require('child_process');
const path = require('path');
const net = require('net');

class MCPClient {
  constructor() {
    this.client = null;
    this.connected = false;
    this.status = 'disconnected';
    this.serverProcess = null;
    this.retryCount = 0;
    this.maxRetries = 3;
    this.retryDelay = 1000;
  }

  /**
   * Connect to MCP server via proper MCP protocol
   */
  async connect() {
    try {
      
      // Get server path
      const serverPath = path.join(__dirname, 'server.js');

      // Create MCP client with proper transport (StdioClientTransport handles the spawn)
      const transport = new StdioClientTransport({
        command: 'node',
        args: [serverPath]
      });

      this.client = new Client(
        {
          name: 'gourmet-backend-client',
          version: '1.0.0',
        },
        {
          capabilities: {
            tools: {},
          },
        }
      );

      // Connect to server with timeout
      const connectPromise = this.client.connect(transport);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Connection timeout')), 10000)
      );

      await Promise.race([connectPromise, timeoutPromise]);
      
      this.connected = true;
      this.status = 'connected';
      this.retryCount = 0;
      
      return true;
    } catch (error) {
      console.error('❌ [MCP Client] Connection failed:', error.message);
      this.status = 'error';
      this.connected = false;
      
      // Clean up failed connection
      if (this.serverProcess) {
        this.serverProcess.kill();
        this.serverProcess = null;
      }
      
      throw error;
    }
  }

  /**
   * Disconnect from MCP server
   */
  async disconnect() {
    try {
      if (this.client) {
        await this.client.close();
      }
      
      this.connected = false;
      this.status = 'disconnected';
    } catch (error) {
      console.error('❌ [MCP Client] Error disconnecting:', error);
    }
  }

  /**
   * Get connection status
   */
  getStatus() {
    return {
      connected: this.connected,
      status: this.status,
      retryCount: this.retryCount
    };
  }

  /**
   * Wait until connected with retry logic
   */
  async waitUntilConnected(timeout = 15000) {
    const start = Date.now();
    while (!this.connected && (Date.now() - start) < timeout) {
      if (this.retryCount < this.maxRetries && this.status === 'error') {
        console.log(`🔄 [MCP Client] Retrying connection (${this.retryCount + 1}/${this.maxRetries})...`);
        this.retryCount++;
        try {
          await this.connect();
        } catch (error) {
          console.error(`❌ [MCP Client] Retry ${this.retryCount} failed:`, error.message);
          await new Promise(resolve => setTimeout(resolve, this.retryDelay * this.retryCount));
        }
      } else {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    return this.connected;
  }

  /**
   * Call any MCP tool generically
   * This is the main method for interacting with MCP tools
   */
  async callTool(toolName, args = {}) {
    try {
      // Auto-connect if not connected
      if (!this.connected || !this.client) {
        await this.connect();
      }

      const result = await this.client.callTool({
        name: toolName,
        arguments: args
      });

      if (result.content && result.content[0]) {
        const responseText = result.content[0].text;
        try {
          return JSON.parse(responseText);
        } catch (parseError) {
          // If not JSON, return as text
          return { text: responseText };
        }
      }
      
      throw new Error('Invalid MCP response format');

    } catch (error) {
      console.error(`❌ [MCP Client] Error calling tool ${toolName}:`, error);
      
      // If connection lost, mark as disconnected
      if (error.message.includes('not connected') || error.message.includes('connection')) {
        this.connected = false;
        this.status = 'error';
      }
      
      throw error;
    }
  }

  /**
   * List available tools via MCP protocol
   */
  async listTools() {
    try {
      if (!this.connected || !this.client) {
        throw new Error('MCP client not connected');
      }

      const result = await this.client.listTools();
      return result.tools;
    } catch (error) {
      console.error('❌ [MCP Client] Error listing tools:', error);
      throw error;
    }
  }

  /**
   * Health check with MCP protocol
   */
  async healthCheck() {
    try {
      if (!this.connected) {
        return { healthy: false, reason: 'Not connected' };
      }

      // Try to list tools as a health check
      await this.listTools();
      
      return {
        healthy: true,
        status: this.status,
        retryCount: this.retryCount,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        healthy: false,
        reason: error.message,
        retryCount: this.retryCount,
        timestamp: new Date().toISOString()
      };
    }
  }
}

module.exports = MCPClient;

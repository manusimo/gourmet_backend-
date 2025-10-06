// Ensure EventSource exists in Node BEFORE importing MCP SDK, so it picks it up
let EventSourceAvailable = false;
try {
  if (!globalThis.EventSource) {
    // eslint-disable-next-line global-require
    const EventSource = require('eventsource');
    globalThis.EventSource = EventSource;
    EventSourceAvailable = true;
    console.log('✅ [MCP Client] EventSource polyfill loaded');
  } else {
    EventSourceAvailable = true;
  }
} catch (error) {
  console.warn('⚠️ [MCP Client] EventSource not available:', error.message);
  EventSourceAvailable = false;
}

// Node 20+ has native fetch support
const FetchAvailable = !!globalThis.fetch;
if (FetchAvailable) {
  console.log('✅ [MCP Client] Using native fetch (Node 20+)');
} else {
  console.warn('⚠️ [MCP Client] fetch not available - requires Node 20+');
}

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { SSEClientTransport } = require('@modelcontextprotocol/sdk/client/sse.js');

/**
 * Embedded MCP Client for Gourmet Jobs Platform
 * Connects to the embedded MCP server running in the same backend
 */
class EmbeddedMCPClient {
  constructor(baseUrl = 'http://localhost:3000') {
    this.baseUrl = this.normalizeBaseUrl(baseUrl);
    this.client = new Client(
      {
        name: 'gourmet-jobs-agent',
        version: '1.0.0',
      },
      {
        capabilities: {},
      }
    );
    this.isConnected = false;
    this.connectionAttempts = 0;
    this.maxConnectionAttempts = 3;
    this.healthCheckInterval = null;
  }

  normalizeBaseUrl(baseUrl) {
    if (!baseUrl) {
      throw new Error('[MCP Client] Base URL is required');
    }

    let url = String(baseUrl).trim();
    
    // Ensure protocol is present
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = `http://${url}`;
    }
    
    // Remove trailing slashes
    url = url.replace(/\/+$/, '');
    
    return url;
  }

  validateUrl(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch (error) {
      return false;
    }
  }

  async connect() {
    if (this.isConnected) return true;

    if (!EventSourceAvailable) {
      throw new Error('[MCP Client] EventSource not available - install eventsource package');
    }

    const streamUrl = `${this.baseUrl}/mcp/stream`;
    
    if (!this.validateUrl(streamUrl)) {
      throw new Error(`[MCP Client] Invalid stream URL: ${streamUrl}`);
    }

    console.log(`[MCP Client] Connecting to SSE: ${streamUrl}`);
    
    try {
      const transport = new SSEClientTransport(new URL(streamUrl), {
        // Node 20+ has native fetch support
      });

      console.log('🔄 [MCP Client] Starting connection to MCP server...');
      
      // Add debugging for the connection process
      transport.onmessage = (message) => {
        console.log('📨 [MCP Client] Received message from server:', message);
      };
      
      transport.onerror = (error) => {
        console.error('❌ [MCP Client] Transport error:', error);
      };
      
      await this.client.connect(transport);
      this.isConnected = true;
      this.connectionAttempts = 0;
      console.log('🔗 [MCP Client] Connected to embedded MCP server');

      // Start health monitoring
      this.startHealthMonitoring();
      
      return true;
    } catch (error) {
      this.connectionAttempts++;
      this.isConnected = false;
      
      console.error(`❌ [MCP Client] Connection failed (attempt ${this.connectionAttempts}):`, error.message);
      
      if (this.connectionAttempts >= this.maxConnectionAttempts) {
        console.error('❌ [MCP Client] Max connection attempts reached, giving up');
        throw new Error(`Failed to connect to MCP server after ${this.maxConnectionAttempts} attempts: ${error.message}`);
      }
      
      throw error;
    }
  }

  async disconnect() {
    this.stopHealthMonitoring();
    
    if (this.isConnected) {
      try {
        await this.client.close();
        this.isConnected = false;
        console.log('🔌 [MCP Client] Disconnected from embedded MCP server');
      } catch (error) {
        console.error('❌ [MCP Client] Error during disconnect:', error);
        this.isConnected = false;
      }
    }
  }

  startHealthMonitoring() {
    // Check health every 30 seconds
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.healthCheck();
      } catch (error) {
        console.warn('⚠️ [MCP Client] Health check failed:', error.message);
        this.isConnected = false;
      }
    }, 30000);
  }

  stopHealthMonitoring() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  async healthCheck() {
    if (!this.isConnected) {
      return { healthy: false, reason: 'Not connected' };
    }

    try {
      // Simple list tools call to verify connection
      await this.client.request({
        method: 'tools/list',
        params: {}
      }, 5000); // 5 second timeout
      
      return { healthy: true };
    } catch (error) {
      this.isConnected = false;
      return { healthy: false, reason: error.message };
    }
  }

  async listTools() {
    await this.ensureConnected();
    const response = await this.client.request({
      method: 'tools/list'
    });
    return response.tools;
  }

  async callTool(name, args) {
    await this.ensureConnected();
    
    try {
      const response = await this.client.request({
        method: 'tools/call',
        params: {
          name,
          arguments: args
        }
      }, 30000); // 30 second timeout for tool execution
      
      return response;
    } catch (error) {
      console.error(`❌ [MCP Client] Tool call failed for ${name}:`, error);
      throw error;
    }
  }

  async ensureConnected() {
    if (!this.isConnected) {
      await this.connect();
    }
    
    // Verify connection is actually healthy
    const health = await this.healthCheck();
    if (!health.healthy) {
      throw new Error(`MCP connection unhealthy: ${health.reason}`);
    }
  }

  // Convenience methods for common operations
  async processJobCreation(jobCreationData) {
    const response = await this.callTool('process_job_creation', jobCreationData);
    return this.parseResponse(response);
  }

  async createJobOffer(jobData) {
    const response = await this.callTool('create_job_offer', jobData);
    return this.parseResponse(response);
  }

  async scheduleInterviewCall(callData) {
    const response = await this.callTool('schedule_interview_call', callData);
    return this.parseResponse(response);
  }

  async getJobApplications(jobPostId) {
    const response = await this.callTool('get_job_applications', { jobPostId });
    return this.parseResponse(response);
  }

  async getRestaurantInfo(restaurantId) {
    const response = await this.callTool('get_restaurant_info', { restaurantId });
    return this.parseResponse(response);
  }

  async getEmployeeInfo(employeeId) {
    const response = await this.callTool('get_employee_info', { employeeId });
    return this.parseResponse(response);
  }

  async sendNotification(notificationData) {
    const response = await this.callTool('send_notification', notificationData);
    return this.parseResponse(response);
  }

  parseResponse(response) {
    if (response.isError) {
      const errorText = response.content?.[0]?.text || 'Unknown MCP error';
      throw new Error(`MCP tool error: ${errorText}`);
    }
    
    try {
      const content = response.content?.[0]?.text;
      if (!content) {
        throw new Error('Empty response from MCP tool');
      }
      
      // Handle both JSON and plain text responses
      if (typeof content === 'string') {
        return JSON.parse(content);
      }
      
      return content;
    } catch (error) {
      console.error('❌ [MCP Client] Failed to parse response:', error);
      throw new Error(`Failed to parse MCP response: ${error.message}`);
    }
  }

  /**
   * Get client status for monitoring
   */
  getStatus() {
    return {
      isConnected: this.isConnected,
      connectionAttempts: this.connectionAttempts,
      eventSourceAvailable: EventSourceAvailable,
      baseUrl: this.baseUrl
    };
  }
}

module.exports = EmbeddedMCPClient;
// Ensure EventSource exists in Node BEFORE importing MCP SDK, so it picks it up
try {
  if (!globalThis.EventSource) {
    // eslint-disable-next-line global-require
    const EventSource = require('eventsource');
    globalThis.EventSource = EventSource;
  }
} catch (_) {
  // If eventsource is not available, the transport will likely fail; user should install it
}
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { SSEClientTransport } = require('@modelcontextprotocol/sdk/client/sse.js');

/**
 * Embedded MCP Client for Gourmet Jobs Platform
 * Connects to the embedded MCP server running in the same backend
 */
class EmbeddedMCPClient {
  constructor(baseUrl = 'http://localhost:3000') {
    this.baseUrl = String(baseUrl || '').trim();
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
  }

  async connect() {
    if (this.isConnected) return;

    const streamUrl = `${this.baseUrl.replace(/\/$/, '')}/mcp/stream`;
    if (!/^https?:\/\//.test(streamUrl)) {
      throw new Error(`[MCP Client] Invalid stream URL: ${streamUrl}`);
    }
    console.log(`[MCP Client] Connecting to SSE: ${streamUrl}`);
    const transport = new SSEClientTransport(streamUrl);
    await this.client.connect(transport);
    this.isConnected = true;
    console.log('🔗 [MCP Client] Connected to embedded MCP server');
  }

  async disconnect() {
    if (this.isConnected) {
      await this.client.close();
      this.isConnected = false;
      console.log('🔌 [MCP Client] Disconnected from embedded MCP server');
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
    const response = await this.client.request({
      method: 'tools/call',
      params: {
        name,
        arguments: args
      }
    });
    return response;
  }

  async ensureConnected() {
    if (!this.isConnected) {
      await this.connect();
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
      throw new Error(response.content[0].text);
    }
    
    try {
      return JSON.parse(response.content[0].text);
    } catch (error) {
      return response.content[0].text;
    }
  }
}

module.exports = EmbeddedMCPClient;

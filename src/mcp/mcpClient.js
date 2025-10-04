const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

/**
 * MCP Client for Gourmet Jobs Platform
 * Provides a clean interface for agents to interact with the MCP server
 */
class GourmetMCPClient {
  constructor() {
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

    const transport = new StdioClientTransport({
      command: 'node',
      args: [require.resolve('./mcpServer.js')]
    });

    await this.client.connect(transport);
    this.isConnected = true;
    console.log('🔗 [MCP Client] Connected to MCP server');
  }

  async disconnect() {
    if (this.isConnected) {
      await this.client.close();
      this.isConnected = false;
      console.log('🔌 [MCP Client] Disconnected from MCP server');
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

module.exports = GourmetMCPClient;

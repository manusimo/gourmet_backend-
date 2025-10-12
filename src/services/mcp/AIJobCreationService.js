/**
 * AI Job Creation Service
 * Clean, focused service for handling job creation requests
 */

const RestaurantContextService = require('./RestaurantContextService');
const JobCreationProcessor = require('./JobCreationProcessor');

class AIJobCreationService {
  constructor() {
    this.mcpClient = null;
    this.restaurantService = new RestaurantContextService();
    this.jobProcessor = new JobCreationProcessor(this);
    this.isInitialized = false;
  }

  /**
   * Initialize the service
   */
  async initialize() {
    if (this.isInitialized) {
      return;
    }

    try {
      // Initialize MCP client if enabled
      if (process.env.MCP_CLIENT_ENABLED === 'true') {
        const MCPClient = require('../../mcp/standaloneClient.js');
        this.mcpClient = new MCPClient();
        await this.mcpClient.connect();
        console.log('✅ [AI Job Creation] MCP client connected');
      } else {
        console.log('ℹ️  [AI Job Creation] MCP client disabled, using fallback');
      }

      this.isInitialized = true;
      console.log('✅ [AI Job Creation] Service initialized');
    } catch (error) {
      console.error('❌ [AI Job Creation] Failed to initialize:', error);
      this.mcpClient = null;
      this.isInitialized = true; // Still mark as initialized to allow fallback
    }
  }

  /**
   * Process job creation request from HTTP route
   */
  async processJobCreationRequest(requestBody, restaurantUserId) {
    try {
      // Validate input
      const validation = this._validateRequest(requestBody);
      if (!validation.isValid) {
        return this._createErrorResponse(validation.error, validation.statusCode);
      }

      // Ensure service is initialized
      if (!this.isInitialized) {
        await this.initialize();
      }

      // Get restaurant context
      const restaurant = await this.restaurantService.getRestaurant(requestBody.restaurantId);
      const restaurantContext = this.restaurantService.buildContext(
        restaurant,
        restaurantUserId,
        requestBody.locationId
      );

      // Process the message
      const result = await this.jobProcessor.processMessage(
        requestBody.message.trim(),
        requestBody.conversationHistory || [],
        restaurantContext
      );

      return { success: true, data: result };

    } catch (error) {
      console.error('❌ [AI Job Creation] Error processing request:', error);
      return this._createErrorResponse('Failed to process job creation request', 500);
    }
  }

  /**
   * Check if MCP client is available
   */
  isMCPAvailable() {
    return this.mcpClient && this.mcpClient.connected;
  }

  /**
   * Get MCP client
   */
  getMCPClient() {
    return this.mcpClient;
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      const mcpStatus = this.mcpClient ? this.mcpClient.getStatus() : { connected: false };
      
      return {
        success: true,
        status: 'healthy',
        mcp: mcpStatus,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        success: false,
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    try {
      if (this.mcpClient) {
        await this.mcpClient.disconnect();
      }
      this.mcpClient = null;
      this.isInitialized = false;
      console.log('✅ [AI Job Creation] Service cleaned up');
    } catch (error) {
      console.error('❌ [AI Job Creation] Error during cleanup:', error);
    }
  }

  /**
   * Validate request input
   */
  _validateRequest(requestBody) {
    const { message, restaurantId } = requestBody;

    if (!message?.trim()) {
      return { isValid: false, error: 'Message is required', statusCode: 400 };
    }

    if (!restaurantId) {
      return { isValid: false, error: 'Restaurant ID is required', statusCode: 400 };
    }

    return { isValid: true };
  }

  /**
   * Create error response
   */
  _createErrorResponse(message, statusCode = 500) {
    return {
      success: false,
      error: message,
      statusCode
    };
  }
}

module.exports = AIJobCreationService;

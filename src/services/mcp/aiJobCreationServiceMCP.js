const EmbeddedMCPClient = require('../../mcp/embeddedClient.js');
const { prisma } = require('../../db.js');

/**
 * AI Job Creation Service with MCP Integration
 * Clean, organized service for handling job creation requests
 */
class AIJobCreationServiceMCP {
  constructor() {
    this.initializeMCPClient();
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  initializeMCPClient() {
    this.mcpClient = new EmbeddedMCPClient();
  }

  // ============================================================================
  // PUBLIC API METHODS
  // ============================================================================

  /**
   * Process job creation request from route handler
   */
  async processJobCreationRequest(requestBody, restaurantUserId) {
    try {
      const { message, conversationHistory = [], restaurantId, locationId } = requestBody;

      // Validate input
      const validation = this.validateRequestInput(message, restaurantId);
      if (!validation.isValid) {
        return this.createErrorResponse(validation.error, validation.statusCode);
      }

      // Get restaurant context
      const restaurant = await this.getRestaurantContext(restaurantId);
      if (!restaurant) {
        return this.createErrorResponse('Restaurant not found', 404);
      }

      // Build context and process
      const restaurantContext = this.buildRestaurantContext(restaurant, restaurantUserId, locationId);
      const result = await this.processMessage(message.trim(), conversationHistory, restaurantContext);

      return { success: true, data: result };

    } catch (error) {
      console.error('❌ [AI JOB CREATION] Error:', error);
      return this.createErrorResponse('Failed to process job creation request', 500);
    }
  }


  /**
   * Initialize MCP connection
   */
  async initialize() {
    try {
      await this.mcpClient.connect();
      console.log('✅ [AI JOB CREATION MCP] MCP client initialized');
    } catch (error) {
      console.error('❌ [AI JOB CREATION MCP] Failed to initialize MCP client:', error);
      throw error;
    }
  }

  /**
   * Cleanup MCP connection
   */
  async cleanup() {
    try {
      await this.mcpClient.disconnect();
      console.log('✅ [AI JOB CREATION MCP] MCP client disconnected');
    } catch (error) {
      console.error('❌ [AI JOB CREATION MCP] Error disconnecting MCP client:', error);
    }
  }

  // ============================================================================
  // CORE PROCESSING METHODS
  // ============================================================================

  /**
   * Process user message using MCP tools
   */
  async processMessage(userMessage, conversationHistory = [], restaurantContext = {}) {
    try {
      console.log('🤖 [AI JOB CREATION MCP] Processing message via MCP:', userMessage);

      // Use MCP to process the job creation request
      const mcpResult = await this.mcpClient.processJobCreation({
        userMessage,
        conversationHistory,
        restaurantContext
      });

      return mcpResult;

    } catch (error) {
      console.error('❌ [AI JOB CREATION MCP] Error processing message:', error);
      return this.createErrorAIResponse();
    }
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  validateRequestInput(message, restaurantId) {
    if (!message?.trim()) {
      return { isValid: false, error: 'Message is required', statusCode: 400 };
    }
    if (!restaurantId) {
      return { isValid: false, error: 'Restaurant ID is required', statusCode: 400 };
    }
    return { isValid: true };
  }

  async getRestaurantContext(restaurantId) {
    return await prisma.restaurant.findUnique({
      where: { id: parseInt(restaurantId) },
      include: { user: true }
    });
  }

  buildRestaurantContext(restaurant, restaurantUserId, locationId) {
    return {
      id: restaurant.id,
      name: restaurant.name,
      userId: restaurantUserId,
      locationId: locationId || 1
    };
  }

  createErrorResponse(message, statusCode) {
    return {
      success: false,
      error: message,
      statusCode
    };
  }

  createErrorAIResponse() {
    return {
      status: "error",
      message: "Lo siento, estoy teniendo dificultades técnicas. ¿Podrías intentar de nuevo?",
      extractedData: {},
      missingFields: [],
      suggestions: []
    };
  }
}

module.exports = AIJobCreationServiceMCP;
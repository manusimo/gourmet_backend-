const { prisma } = require('../../db.js');
const { getToolHandler } = require('../../mcp/tools');

const MCP_CLIENT_ENABLED = process.env.MCP_CLIENT_ENABLED === 'true';

/**
 * AI Job Creation Service with MCP Integration
 * Clean, organized service for handling job creation requests
 */
class AIJobCreationServiceMCP {
  constructor() {
    this.mcpClient = null;
    this.mcpAvailable = false;
    this.initializeMCPClient();
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  initializeMCPClient() {
    if (!MCP_CLIENT_ENABLED) {
      console.log('ℹ️  [AI JOB CREATION MCP] Embedded MCP client disabled (MCP_CLIENT_ENABLED=false). Using fallback.');
      this.mcpClient = null;
      this.mcpAvailable = false;
      return;
    }

    try {
      // Lazy-require to avoid crashing if SDK/client is missing
      // eslint-disable-next-line global-require, import/no-dynamic-require
      const EmbeddedMCPClient = require('../../mcp/embeddedClient.js');
      this.mcpClient = new EmbeddedMCPClient();
      this.mcpAvailable = true;
    } catch (error) {
      console.warn('⚠️  [AI JOB CREATION MCP] MCP client unavailable, falling back to direct tool handler:', error.message);
      this.mcpClient = null;
      this.mcpAvailable = false;
    }
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
      if (this.mcpAvailable && this.mcpClient) {
        await this.mcpClient.connect();
        console.log('✅ [AI JOB CREATION MCP] MCP client initialized');
      } else {
        console.log('ℹ️  [AI JOB CREATION MCP] Using direct tool handler fallback');
      }
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
      if (this.mcpAvailable && this.mcpClient) {
        await this.mcpClient.disconnect();
        console.log('✅ [AI JOB CREATION MCP] MCP client disconnected');
      }
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

      if (this.mcpAvailable && this.mcpClient) {
        // Use MCP client when available
        const mcpResult = await this.mcpClient.processJobCreation({
          userMessage,
          conversationHistory,
          restaurantContext
        });
        return mcpResult;
      }

      // Fallback: call the tool handler directly in-process
      const handler = getToolHandler('process_job_creation');
      if (!handler) {
        console.error('❌ [AI JOB CREATION MCP] process_job_creation handler not found');
        return this.createErrorAIResponse();
      }
      const response = await handler({ userMessage, conversationHistory, restaurantContext }, { prisma });
      return this.parseMCPStyleResponse(response);

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

  parseMCPStyleResponse(response) {
    try {
      if (response?.isError) {
        const txt = response?.content?.[0]?.text || 'Tool error';
        throw new Error(txt);
      }
      const txt = response?.content?.[0]?.text;
      if (!txt) return this.createErrorAIResponse();
      return JSON.parse(txt);
    } catch (e) {
      console.error('❌ [AI JOB CREATION MCP] Failed to parse tool response:', e);
      return this.createErrorAIResponse();
    }
  }
}

module.exports = AIJobCreationServiceMCP;
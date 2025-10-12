const { prisma } = require('../../db.js');
const { getToolHandler } = require('../../mcp/tools');

const MCP_CLIENT_ENABLED = process.env.MCP_CLIENT_ENABLED === 'true';
const MCP_DEBUG = process.env.MCP_DEBUG === 'true';
const withTs = (level, parts) => {
  const ts = new Date().toISOString();
  // eslint-disable-next-line no-console
  console[level](`[${ts}]`, ...parts);
};
const dbg = (...parts) => {
  if (MCP_DEBUG) withTs('log', ['🐛 [AI JOB CREATION MCP DEBUG]', ...parts]);
};

/**
 * AI Job Creation Service with MCP Integration
 * Clean, organized service for handling job creation requests
 */

class AIJobCreationServiceMCP {
  
  constructor() {
    this.mcpClient = null;
    this.mcpAvailable = false;
    this.initializationPromise = null;
    this.initializeMCPClient();
    dbg('Service constructed. MCP_CLIENT_ENABLED:', MCP_CLIENT_ENABLED);
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  initializeMCPClient() {
    if (!MCP_CLIENT_ENABLED) {
      console.log('ℹ️  [AI JOB CREATION MCP] MCP client disabled (MCP_CLIENT_ENABLED=false). Using fallback.');
      this.mcpClient = null;
      this.mcpAvailable = false;
      return;
    }

    try {
      // Use real MCP client (connects to MCP server)
      // eslint-disable-next-line global-require, import/no-dynamic-require
      const MCPClient = require('../../mcp/standaloneClient.js');
      console.log('🔗 [AI JOB CREATION MCP] Using MCP client');
      
      this.mcpClient = new MCPClient();
      this.mcpAvailable = true;
      dbg('MCP client created. Status:', this.mcpClient.getStatus?.());
      
      // Initialize asynchronously to prevent blocking constructor
      this.initializationPromise = this.initialize();
    } catch (error) {
      if (MCP_DEBUG) {
        withTs('warn', ['⚠️  [AI JOB CREATION MCP] MCP client unavailable (stack):', error]);
      } else {
        console.warn('⚠️  [AI JOB CREATION MCP] MCP client unavailable, falling back to direct tool handler:', error.message);
      }
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

      // Wait for MCP initialization to complete if it's in progress
      if (this.initializationPromise) {
        await this.initializationPromise;
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
        dbg('Initializing MCP client connection...');
        await this.mcpClient.connect();
        const status = this.mcpClient.getStatus?.();
        console.log('✅ [AI JOB CREATION MCP] MCP client initialized');
        dbg('MCP client status after init:', status);

        // Wait briefly until connection is actually healthy
        const becameHealthy = await (this.mcpClient.waitUntilConnected?.(8000) || Promise.resolve(false));
        if (!becameHealthy) {
          const postHealth = this.mcpClient.getStatus?.();
          console.warn('⚠️  [AI JOB CREATION MCP] MCP client not healthy after init; will fallback on failure', postHealth);
        } else {
          dbg('MCP client confirmed healthy after init');
        }
      } else {
        console.log('ℹ️  [AI JOB CREATION MCP] Using direct tool handler fallback');
      }
    } catch (error) {
      if (MCP_DEBUG) {
        withTs('error', ['❌ [AI JOB CREATION MCP] Failed to initialize MCP client (stack):', error]);
      } else {
        console.error('❌ [AI JOB CREATION MCP] Failed to initialize MCP client:', error.message || error);
      }
      
      // Mark MCP as unavailable on connection failure
      this.mcpAvailable = false;
      this.mcpClient = null;
      
      // Don't throw the error - allow fallback to work
      console.log('🔄 [AI JOB CREATION MCP] Falling back to direct tool execution');
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
      if (MCP_DEBUG) {
        withTs('error', ['❌ [AI JOB CREATION MCP] Error disconnecting MCP client (stack):', error]);
      } else {
        console.error('❌ [AI JOB CREATION MCP] Error disconnecting MCP client:', error.message || error);
      }
    } finally {
      this.mcpAvailable = false;
      this.mcpClient = null;
      this.initializationPromise = null;
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
      console.log('🤖 [AI JOB CREATION MCP] Processing message:', userMessage);
      dbg('Context:', { conversationHistoryPreview: Array.isArray(conversationHistory) ? conversationHistory.length : typeof conversationHistory, restaurantContext });

      // Try MCP client first if available and healthy
      if (this.mcpAvailable && this.mcpClient) {
        try {
          console.log('🔄 [AI JOB CREATION MCP] Using MCP client');
          dbg('Calling processJobCreation via MCP client...');
          const mcpResult = await this.mcpClient.processJobCreation({
            userMessage,
            conversationHistory,
            restaurantContext
          });
          dbg('MCP result:', mcpResult);
          
          // Check if MCP result indicates an error
          if (mcpResult && mcpResult.isError) {
            console.log('🚨 [AI JOB CREATION MCP] MCP tool returned error:', {
              isError: mcpResult.isError,
              content: mcpResult.content,
              contentLength: mcpResult.content?.length,
              firstContent: mcpResult.content?.[0]
            });
          }
          
          return mcpResult;
        } catch (mcpError) {
          if (MCP_DEBUG) {
            withTs('warn', ['⚠️  [AI JOB CREATION MCP] MCP client failed (stack):', mcpError]);
          } else {
            console.warn('⚠️  [AI JOB CREATION MCP] MCP client failed, falling back to direct handler:', mcpError.message);
          }
          this.mcpAvailable = false; // Disable MCP on failure
        }
      }

      // Fallback: call the tool handler directly in-process
      console.log('🔄 [AI JOB CREATION MCP] Using direct tool handler fallback');
      const handler = getToolHandler('process_job_creation');
      if (!handler) {
        console.error('❌ [AI JOB CREATION MCP] process_job_creation handler not found');
        return this.createErrorAIResponse();
      }
      
      dbg('Invoking direct tool handler process_job_creation...');
      const response = await handler({ userMessage, conversationHistory, restaurantContext }, { prisma });
      dbg('Direct handler response envelope:', response);
      return this.parseMCPStyleResponse(response);

    } catch (error) {
      if (MCP_DEBUG) {
        withTs('error', ['❌ [AI JOB CREATION MCP] Error processing message (stack):', error]);
      } else {
        console.error('❌ [AI JOB CREATION MCP] Error processing message:', error.message || error);
      }
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
      
      // Handle both stringified JSON and direct object responses
      if (typeof txt === 'string') {
        return JSON.parse(txt);
      } else if (typeof txt === 'object') {
        return txt;
      } else {
        return this.createErrorAIResponse();
      }
    } catch (e) {
      console.error('❌ [AI JOB CREATION MCP] Failed to parse tool response:', e);
      return this.createErrorAIResponse();
    }
  }

  /**
   * Health check for MCP client
   */
  async healthCheck() {
    if (!this.mcpAvailable || !this.mcpClient) {
      return { healthy: false, reason: 'MCP client not available' };
    }

    try {
      // Add a simple health check method to your embeddedClient if needed
      if (typeof this.mcpClient.healthCheck === 'function') {
        return await this.mcpClient.healthCheck();
      }
      
      // If no health check method, assume healthy if client exists
      return { healthy: true };
    } catch (error) {
      return { healthy: false, reason: error.message };
    }
  }
}

module.exports = AIJobCreationServiceMCP;
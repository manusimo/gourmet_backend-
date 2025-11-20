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

  initializeMCPClient() {
    if (!MCP_CLIENT_ENABLED) {
      console.log('ℹ️  [AI JOB CREATION MCP] MCP client disabled (MCP_CLIENT_ENABLED=false). Using fallback.');
      this.mcpClient = null;
      this.mcpAvailable = false;
      return;
    }

    try {
      const MCPClient = require('../../mcp/standaloneClient.js');
      
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
            // Fall through to fallback handler
            throw new Error(mcpResult.error || 'MCP tool returned error');
          }
          
          // Check if result has success: false
          if (mcpResult && mcpResult.success === false) {
            console.error('🚨 [AI JOB CREATION MCP] MCP tool returned success: false:', {
              error: mcpResult.error,
              message: mcpResult.message
            });
            // Fall through to fallback handler
            throw new Error(mcpResult.error || 'MCP tool returned success: false');
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
    // locationId can be:
    // - A valid number (specific location)
    // - null (not specified - will be selected by user in frontend)
    // - undefined (not provided - will be selected by user in frontend)
    // We should NOT default to 1, as that might be incorrect
    return {
      id: restaurant.id,
      name: restaurant.name,
      userId: restaurantUserId,
      locationId: locationId !== undefined ? locationId : null // Don't default to 1, let user select
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
        // Try to parse the error message if it's JSON
        try {
          const parsedError = JSON.parse(txt);
          if (parsedError.success === false) {
            return {
              status: "error",
              message: parsedError.error || parsedError.message || "Lo siento, estoy teniendo dificultades técnicas. ¿Podrías intentar de nuevo?",
              extractedData: parsedError.extractedData || {},
              missingFields: parsedError.missingFields || [],
              suggestions: parsedError.suggestions || []
            };
          }
        } catch {
          // If not JSON, use as plain error message
        }
        throw new Error(typeof txt === 'string' ? txt : 'Tool error');
      }
      const txt = response?.content?.[0]?.text;
      if (!txt) return this.createErrorAIResponse();
      
      // Handle both stringified JSON and direct object responses
      let parsed;
      if (typeof txt === 'string') {
        try {
          parsed = JSON.parse(txt);
        } catch (parseError) {
          console.error('❌ [AI JOB CREATION MCP] Failed to parse JSON response:', parseError.message);
          console.error('❌ [AI JOB CREATION MCP] Raw response text:', txt.substring(0, 500));
          return this.createErrorAIResponse();
        }
      } else if (typeof txt === 'object') {
        parsed = txt;
      } else {
        return this.createErrorAIResponse();
      }
      
      // Check if parsed response has success: false
      if (parsed && parsed.success === false) {
        console.error('❌ [AI JOB CREATION MCP] Parsed response has success: false:', {
          error: parsed.error,
          message: parsed.message
        });
        // Return error response but with proper structure
        return {
          status: "error",
          message: parsed.error || parsed.message || "Lo siento, estoy teniendo dificultades técnicas. ¿Podrías intentar de nuevo?",
          extractedData: parsed.extractedData || {},
          missingFields: parsed.missingFields || [],
          suggestions: parsed.suggestions || []
        };
      }
      
      return parsed;
    } catch (e) {
      console.error('❌ [AI JOB CREATION MCP] Failed to parse tool response:', e.message || e);
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
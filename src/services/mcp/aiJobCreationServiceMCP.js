const { prisma } = require('../../db.js');
const { getToolHandler } = require('../../mcp/tools');
const MCPClient = require('../../mcp/standaloneClient.js');
const { 
  validateJobCreationMCPResult, 
  logJobCreationMCPError, 
  logJobCreationMCPResultError,
  createErrorAIResponse: createErrorAIResponseHelper,
  parseJobCreationMCPStyleResponse
} = require('./helpers/aiJobCreationHelpers');
const { 
  getRestaurant, 
  buildRestaurantContext 
} = require('./contexts/restaurantContext');

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
    this.createMCPClient();
    dbg('Service constructed. MCP_CLIENT_ENABLED:', MCP_CLIENT_ENABLED);
  }

  /**
   * Create MCP client instance (synchronous)
   * The actual connection happens asynchronously in connectMCPClient()
   */
  createMCPClient() {
    if (!MCP_CLIENT_ENABLED) {
      this.mcpClient = null;
      this.mcpAvailable = false;
      return;
    }

    try {
      this.mcpClient = new MCPClient();
      this.mcpAvailable = true;
      dbg('MCP client created. Status:', this.mcpClient.getStatus?.());
      
      // Connect asynchronously to prevent blocking constructor
      this.initializationPromise = this.connectMCPClient();
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
      const restaurant = await getRestaurant(restaurantId);
      if (!restaurant) {
        return this.createErrorResponse('Restaurant not found', 404);
      }

      // Build context and process
      const restaurantContext = buildRestaurantContext(restaurant, restaurantUserId, locationId);
      const result = await this.processMessage(message.trim(), conversationHistory, restaurantContext);

      return { success: true, data: result };

    } catch (error) {
      console.error('❌ [AI JOB CREATION] Error:', error);
      return this.createErrorResponse('Failed to process job creation request', 500);
    }
  }

  /**
   * Connect to MCP server (asynchronous)
   * This is called after createMCPClient() to establish the actual connection
   */
  async connectMCPClient() {
    try {
      if (this.mcpAvailable && this.mcpClient) {
        dbg('Initializing MCP client connection...');
        await this.mcpClient.connect();
        const status = this.mcpClient.getStatus?.();
        dbg('MCP client status after init:', status);

        // Wait briefly until connection is actually healthy
        const becameHealthy = await (this.mcpClient.waitUntilConnected?.(8000) || Promise.resolve(false));
        if (!becameHealthy) {
          const postHealth = this.mcpClient.getStatus?.();
          console.warn('⚠️  [AI JOB CREATION MCP] MCP client not healthy after init; will fallback on failure', postHealth);
        } else {
          dbg('MCP client confirmed healthy after init');
        }
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
      dbg('Context:', { conversationHistoryPreview: Array.isArray(conversationHistory) ? conversationHistory.length : typeof conversationHistory, restaurantContext });

      // Try MCP client first if available
      const mcpResult = await this.tryMCPClient(userMessage, conversationHistory, restaurantContext);
      if (mcpResult) {
        return mcpResult;
      }

      // Fallback to direct tool handler
      return await this.fallbackToDirectHandler(userMessage, conversationHistory, restaurantContext);

    } catch (error) {
      if (MCP_DEBUG) {
        withTs('error', ['❌ [AI JOB CREATION MCP] Error processing message (stack):', error]);
      } else {
        console.error('❌ [AI JOB CREATION MCP] Error processing message:', error.message || error);
      }
      return this.createErrorAIResponse();
    }
  }

  /**
   * Try to process message via MCP client
   * Returns result if successful, null if should fallback
   */
  async tryMCPClient(userMessage, conversationHistory, restaurantContext) {
    if (!this.mcpAvailable || !this.mcpClient) {
      return null;
    }

    try {
      dbg('Calling process_job_creation tool via MCP client...');
      const mcpResult = await this.mcpClient.callTool('process_job_creation', {
        userMessage,
        conversationHistory,
        restaurantContext
      });
      dbg('MCP result:', mcpResult);
      
      // Validate result (throws if error)
      validateJobCreationMCPResult(mcpResult);
      
      return mcpResult;
    } catch (mcpError) {
      logJobCreationMCPError(mcpError, MCP_DEBUG);
      this.mcpAvailable = false; // Disable MCP on failure
      return null; // Signal to fallback
    }
  }

  /**
   * Fallback to direct tool handler (in-process)
   */
  async fallbackToDirectHandler(userMessage, conversationHistory, restaurantContext) {
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


  createErrorResponse(message, statusCode) {
    return {
      success: false,
      error: message,
      statusCode
    };
  }

  createErrorAIResponse() {
    return createErrorAIResponseHelper();
  }

  parseMCPStyleResponse(response) {
    return parseJobCreationMCPStyleResponse(response, () => this.createErrorAIResponse());
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
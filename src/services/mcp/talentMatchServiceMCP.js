const { prisma } = require('../../db.js');
const { getToolHandler } = require('../../mcp/tools');
const MCPClient = require('../../mcp/standaloneClient.js');
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
  if (MCP_DEBUG) withTs('log', ['🐛 [TALENT MATCH MCP DEBUG]', ...parts]);
};

/**
 * Talent Match Service with MCP Integration
 * Handles candidate matching for jobs
 */
class TalentMatchServiceMCP {
  
  constructor() {
    this.mcpClient = null;
    this.mcpAvailable = false;
    this.initializationPromise = null;
    this.createMCPClient();
    dbg('Service constructed. MCP_CLIENT_ENABLED:', MCP_CLIENT_ENABLED);
  }

  /**
   * Create MCP client instance (synchronous)
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
        withTs('warn', ['⚠️  [TALENT MATCH MCP] MCP client unavailable (stack):', error]);
      } else {
        console.warn('⚠️  [TALENT MATCH MCP] MCP client unavailable, falling back to direct tool handler:', error.message);
      }
      this.mcpClient = null;
      this.mcpAvailable = false;
    }
  }

  /**
   * Connect to MCP server (asynchronous)
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
          console.warn('⚠️  [TALENT MATCH MCP] MCP client not healthy after init; will fallback on failure', postHealth);
        } else {
          dbg('MCP client confirmed healthy after init');
        }
      } 
    } catch (error) {
      if (MCP_DEBUG) {
        withTs('error', ['❌ [TALENT MATCH MCP] Failed to initialize MCP client (stack):', error]);
      } else {
        console.error('❌ [TALENT MATCH MCP] Failed to initialize MCP client:', error.message || error);
      }
      
      // Mark MCP as unavailable on connection failure
      this.mcpAvailable = false;
      this.mcpClient = null;
      
      // Don't throw the error - allow fallback to work
      console.log('🔄 [TALENT MATCH MCP] Falling back to direct tool execution');
    }
  }

  /**
   * Match best applicants for a job
   */
  async matchBestApplicants(jobId, options = {}) {
    try {
      const { 
        limit = 10, 
        includeAlreadyApplied = false,
        minSimilarityScore = 50 
      } = options;

      // Wait for MCP initialization to complete if it's in progress
      if (this.initializationPromise) {
        await this.initializationPromise;
      }

      // Try MCP client first if available
      const mcpResult = await this.tryMCPClient(jobId, { limit, includeAlreadyApplied, minSimilarityScore });
      if (mcpResult) {
        return { success: true, data: mcpResult };
      }

      // Fallback to direct tool handler
      const result = await this.fallbackToDirectHandler(jobId, { limit, includeAlreadyApplied, minSimilarityScore });
      return { success: true, data: result };

    } catch (error) {
      console.error('❌ [TALENT MATCH] Error:', error);
      return { 
        success: false, 
        error: 'Failed to match applicants',
        message: error.message 
      };
    }
  }

  /**
   * Try to process via MCP client
   */
  async tryMCPClient(jobId, options) {
    if (!this.mcpAvailable || !this.mcpClient) {
      return null;
    }

    try {
      dbg('Calling match_best_applicants tool via MCP client...');
      const mcpResult = await this.mcpClient.callTool('match_best_applicants', {
        jobId: parseInt(jobId),
        ...options
      });
      dbg('MCP result:', mcpResult);
      
      // Check for errors
      if (mcpResult && (mcpResult.isError || mcpResult.success === false)) {
        throw new Error(mcpResult.error || mcpResult.message || 'MCP tool returned error');
      }
      
      return mcpResult;
    } catch (mcpError) {
      if (MCP_DEBUG) {
        withTs('warn', ['⚠️  [TALENT MATCH MCP] MCP client failed (stack):', mcpError]);
      } else {
        console.warn('⚠️  [TALENT MATCH MCP] MCP client failed, falling back to direct handler:', mcpError.message);
      }
      this.mcpAvailable = false; // Disable MCP on failure
      return null; // Signal to fallback
    }
  }

  /**
   * Fallback to direct tool handler (in-process)
   */
  async fallbackToDirectHandler(jobId, options) {
    console.log('🔄 [TALENT MATCH MCP] Using direct tool handler fallback');
    const handler = getToolHandler('match_best_applicants');
    
    if (!handler) {
      throw new Error('match_best_applicants handler not found');
    }
    
    dbg('Invoking direct tool handler match_best_applicants...');
    const response = await handler(
      { jobId: parseInt(jobId), ...options }, 
      { prisma }
    );
    
    dbg('Direct handler response:', response);
    
    // Parse MCP-style response
    if (response?.isError) {
      const errorText = response?.content?.[0]?.text || 'Tool error';
      throw new Error(typeof errorText === 'string' ? errorText : 'Tool error');
    }
    
    const textContent = response?.content?.[0]?.text;
    if (!textContent) {
      throw new Error('No response content');
    }
    
    // Parse JSON response
    if (typeof textContent === 'string') {
      return JSON.parse(textContent);
    } else if (typeof textContent === 'object') {
      return textContent;
    }
    
    throw new Error('Invalid response format');
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
        withTs('error', ['❌ [TALENT MATCH MCP] Error disconnecting MCP client (stack):', error]);
      } else {
        console.error('❌ [TALENT MATCH MCP] Error disconnecting MCP client:', error.message || error);
      }
    } finally {
      this.mcpAvailable = false;
      this.mcpClient = null;
      this.initializationPromise = null;
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
      if (typeof this.mcpClient.healthCheck === 'function') {
        return await this.mcpClient.healthCheck();
      }
      
      return { healthy: true };
    } catch (error) {
      return { healthy: false, reason: error.message };
    }
  }
}

module.exports = TalentMatchServiceMCP;


/**
 * Job Creation Processor
 * Handles the core job creation logic with MCP tools
 */

const { getToolHandler } = require('../../mcp/tools');
const { prisma } = require('../../db.js');

class JobCreationProcessor {
  constructor(aiJobCreationService) {
    this.aiJobCreationService = aiJobCreationService;
  }

  /**
   * Process job creation message
   */
  async processMessage(userMessage, conversationHistory = [], restaurantContext = {}) {
    try {
      console.log('🤖 [Job Creation] Processing message:', userMessage);

      // Try MCP client first
      if (this.aiJobCreationService.isMCPAvailable()) {
        try {
          console.log('🔄 [Job Creation] Using MCP client');
          const mcpClient = this.aiJobCreationService.getMCPClient();
          const result = await mcpClient.processJobCreation({
            userMessage,
            conversationHistory,
            restaurantContext
          });
          return result; // MCP client already returns parsed JSON
        } catch (mcpError) {
          console.warn('⚠️  [Job Creation] MCP client failed, using fallback:', mcpError.message);
        }
      }

      // Fallback to direct tool execution
      console.log('🔄 [Job Creation] Using direct tool handler');
      const handler = getToolHandler('process_job_creation');
      if (!handler) {
        throw new Error('Job creation tool handler not found');
      }

      const response = await handler(
        { userMessage, conversationHistory, restaurantContext },
        { prisma }
      );

      return this._parseResponse(response);

    } catch (error) {
      console.error('❌ [Job Creation] Error processing message:', error);
      return this._createErrorResponse();
    }
  }

  /**
   * Parse MCP tool response
   */
  _parseResponse(response) {
    try {
      // Handle error responses
      if (response?.isError) {
        const errorText = response?.content?.[0]?.text || 'Tool error';
        throw new Error(errorText);
      }

      // Extract text content
      const textContent = response?.content?.[0]?.text;
      if (!textContent) {
        throw new Error('No response content');
      }

      // Parse JSON response
      if (typeof textContent === 'string') {
        return JSON.parse(textContent);
      } else if (typeof textContent === 'object') {
        return textContent;
      } else {
        throw new Error('Invalid response format');
      }

    } catch (error) {
      console.error('❌ [Job Creation] Error parsing response:', error);
      return this._createErrorResponse();
    }
  }

  /**
   * Create error response
   */
  _createErrorResponse() {
    return {
      status: "error",
      message: "Lo siento, estoy teniendo dificultades técnicas. ¿Podrías intentar de nuevo?",
      extractedData: {},
      missingFields: [],
      suggestions: []
    };
  }
}

module.exports = JobCreationProcessor;

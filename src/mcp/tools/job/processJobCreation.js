const BaseTool = require('../baseTool');
const ProcessJobCreationHelpers = require('./helpers/processJobCreationHelpers');
const DynamicToolSelector = require('./helpers/dynamicToolSelector');
let LangGraphAgentClass = null;
function getLangGraphAgentClass() {
  if (!LangGraphAgentClass) {
    LangGraphAgentClass = require('../../../services/mcp/agents/langGraphAgent');
  }
  return LangGraphAgentClass;
}

/**
 * Process Job Creation Tool
 * Orchestrates job creation workflow using AI and MCP tools
 */
class ProcessJobCreationTool extends BaseTool {
  constructor() {
    super(
      'process_job_creation',
      'Process natural language job creation requests using AI',
      {
        type: 'object',
        properties: {
          userMessage: { type: 'string', description: 'User message in natural language' },
          conversationHistory: { type: 'array', items: { type: 'object' }, description: 'Previous conversation context' },
          restaurantContext: { type: 'object', description: 'Restaurant context information' }
        },
        required: ['userMessage', 'restaurantContext']
      }
    );
  }

  async handle(args, { prisma }) {
    const { userMessage, conversationHistory = [], restaurantContext } = args;
    
    try {
      ProcessJobCreationHelpers.logRequestStart(userMessage, conversationHistory, restaurantContext);
      
      // Use LangGraph for advanced agent capabilities
      // LangGraph provides: state management, workflow orchestration, tool coordination
      console.log('🚀 [MCP] Using LangGraph agent for advanced workflow orchestration');
      
      // Initialize LangGraph agent (singleton pattern)
      if (!this.langGraphAgent) {
        const LangGraphAgent = getLangGraphAgentClass();
        this.langGraphAgent = new LangGraphAgent();
      }
      
      const result = await this.langGraphAgent.processQuery(userMessage, conversationHistory, restaurantContext);
      
      return this.createSuccessResponse({
        status: result.status || 'complete',
        message: result.message,
        toolCalls: result.toolCalls,
        usedDynamicSelection: true,
        debugInfo: {
          source: 'LANGGRAPH',
          model: 'gpt-4',
          framework: 'LangGraph',
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error('❌ [MCP] Error in LangGraph agent:', error);
      
      // Fallback to direct OpenAI if LangGraph fails
      console.log('🔄 [MCP] Falling back to direct OpenAI function calling');
      try {
        const dynamicSelector = new DynamicToolSelector();
        const fallbackResult = await dynamicSelector.processQuery(userMessage, conversationHistory, restaurantContext);
        
        return this.createSuccessResponse({
          status: fallbackResult.status || 'complete',
          message: fallbackResult.message,
          toolCalls: fallbackResult.toolCalls,
          usedDynamicSelection: true,
          debugInfo: {
            source: 'FALLBACK_DIRECT_OPENAI',
            model: 'gpt-4',
            timestamp: new Date().toISOString()
          }
        });
      } catch (fallbackError) {
        ProcessJobCreationHelpers.logError(fallbackError, userMessage, conversationHistory, restaurantContext);
        return this.createErrorResponse(`Failed to process request: ${fallbackError.message}`);
      }
    }
  }

  // All hardcoded logic removed - fully LLM-driven now
}

module.exports = ProcessJobCreationTool;

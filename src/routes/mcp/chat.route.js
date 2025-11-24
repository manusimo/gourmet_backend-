const express = require('express');
const router = express.Router();
const { getUserIdFromCookie, getRestaurantUserIdFromCookie } = require('../../helpers/cookies.js');
const { LangGraphAgent } = require('../../services/mcp');
const { getRestaurant, buildRestaurantContext } = require('../../services/mcp/contexts/restaurantContext');

/**
 * AI Chat Routes
 * Unified chat endpoint for all AI agent interactions
 * Handles job creation, queries, candidate matching, and more
 * Uses LangGraph-based advanced agent with dynamic tool selection
 */

// Initialize LangGraph agent (singleton)
let langGraphAgent = null;
function getLangGraphAgent() {
  if (!langGraphAgent) {
    const { LangGraphAgent } = require('../../services/mcp/agents/langGraphAgent');
    langGraphAgent = new LangGraphAgent();
  }
  return langGraphAgent;
}

/**
 * POST /process - Unified chat endpoint
 * @description Processes all types of user messages using LangGraph agent:
 * - Job creation: "Create a chef job"
 * - Job queries: "Show me my last 5 jobs"
 * - Candidate matching: "Get candidates for job 123"
 * - Multi-step: "Show jobs, then get candidates, then schedule a call"
 * 
 * The LLM decides which tools to call dynamically - no hardcoded routing
 */
router.post('/process', getUserIdFromCookie, getRestaurantUserIdFromCookie, async (req, res) => {
  try {
    const { message, conversationHistory = [], restaurantId, locationId } = req.body;
    
    // Validate input
    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }
    
    if (!restaurantId) {
      return res.status(400).json({
        success: false,
        error: 'Restaurant ID is required'
      });
    }
    
    // Get restaurant context
    const restaurant = await getRestaurant(restaurantId);
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        error: 'Restaurant not found'
      });
    }
    
    // Build restaurant context
    const restaurantContext = buildRestaurantContext(restaurant, req.restaurantUserId, locationId);
    
    // Get LangGraph agent and process query
    const agent = getLangGraphAgent();
    const result = await agent.processQuery(message.trim(), conversationHistory, restaurantContext);
    
    // Format response
    res.json({
      success: true,
      data: {
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
      }
    });
    
  } catch (error) {
    console.error('❌ [AI CHAT] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process message',
      message: error.message
    });
  }
});

/**
 * GET /health - Health check endpoint
 * @description Checks service health and agent status
 */
router.get('/health', async (req, res) => {
  try {
    res.json({
      success: true,
      status: 'healthy',
      service: 'AI Chat Agent',
      framework: 'LangGraph',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      status: 'unhealthy',
      error: error.message
    });
  }
});

module.exports = router;


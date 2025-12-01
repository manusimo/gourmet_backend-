/**
 * SECURE AI Chat Routes Example
 * This shows how to use the secure agent with all security middleware
 * 
 * To use this:
 * 1. Replace the current chat.route.js with this implementation
 * 2. Install express-rate-limit: npm install express-rate-limit
 * 3. Update your agent initialization to use SecureLangGraphAgent
 */

const express = require('express');
const router = express.Router();
const { getUserIdFromCookie, getRestaurantUserIdFromCookie } = require('../../helpers/cookies.js');
const { getRestaurant, buildRestaurantContext } = require('../../services/mcp/contexts/restaurantContext');
const {
  agentRateLimiter,
  extractUserContext,
  validateRestaurantAccess,
  sanitizeAgentInput,
  logAgentRequest,
  validateAgentRequest,
} = require('../../middleware/agentSecurity.js');

// Import secure agent
const SecureLangGraphAgent = require('../../services/mcp/agents/langGraphAgent.secure.js');

/**
 * POST /process - Secure unified chat endpoint
 * 
 * Security Features:
 * - Rate limiting
 * - Input sanitization
 * - User context validation
 * - Restaurant access verification
 * - Request logging
 */
router.post(
  '/process',
  getUserIdFromCookie,
  getRestaurantUserIdFromCookie,
  agentRateLimiter, // Rate limiting
  extractUserContext, // Extract user context
  validateAgentRequest, // Validate request structure
  sanitizeAgentInput, // Sanitize input to prevent prompt injection
  validateRestaurantAccess, // Verify restaurant access
  logAgentRequest, // Log for security monitoring
  async (req, res) => {
    try {
      const { message, conversationHistory = [], restaurantId, locationId } = req.body;
      const userContext = req.agentUserContext; // From extractUserContext middleware

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

      // Create secure agent instance with user context
      // Note: Create new instance per request to ensure context isolation
      const agent = new SecureLangGraphAgent(userContext);

      // Process query with security
      const result = await agent.processQuery(
        message.trim(),
        conversationHistory,
        restaurantContext,
        userContext // Pass user context explicitly
      );

      // Format response (exclude audit log in production)
      const response = {
        success: true,
        data: {
          status: result.status || 'complete',
          message: result.message,
          toolCalls: result.toolCalls,
          usedDynamicSelection: true,
          debugInfo: {
            source: 'LANGGRAPH_SECURE',
            model: 'gpt-4',
            framework: 'LangGraph',
            timestamp: new Date().toISOString()
          }
        }
      };

      // Include audit log only in development
      if (process.env.NODE_ENV === 'development') {
        response.data.auditLog = result.auditLog;
      }

      res.json(response);

    } catch (error) {
      console.error('❌ [AI CHAT] Error:', error);

      // Don't expose internal error details in production
      const errorMessage = process.env.NODE_ENV === 'production'
        ? 'Failed to process message'
        : error.message;

      res.status(error.statusCode || 500).json({
        success: false,
        error: errorMessage
      });
    }
  }
);

/**
 * GET /health - Health check endpoint
 */
router.get('/health', async (req, res) => {
  try {
    res.json({
      success: true,
      status: 'healthy',
      service: 'AI Chat Agent (Secure)',
      framework: 'LangGraph',
      security: 'enabled',
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


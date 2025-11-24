const express = require('express');
const router = express.Router();
const { getUserIdFromCookie, getRestaurantUserIdFromCookie } = require('../../helpers/cookies.js');
const { requirePlan } = require('../../middleware/checkPlan.js');
const { AIJobCreationServiceMCP, LangGraphAgent } = require('../../services/mcp');
const { getRestaurant, buildRestaurantContext } = require('../../services/mcp/contexts/restaurantContext');
const { prisma } = require('../../db.js');

/**
 * AI Job Creation Routes (Legacy)
 * DEPRECATED: Use /api/chat/process instead
 * Kept for backward compatibility only
 */

// Initialize services
const aiJobCreationService = new AIJobCreationServiceMCP();

// Initialize LangGraph agent (singleton)
let langGraphAgent = null;
function getLangGraphAgent() {
  if (!langGraphAgent) {
    langGraphAgent = new LangGraphAgent();
  }
  return langGraphAgent;
}

/**
 * POST /process - Legacy endpoint (DEPRECATED)
 * @description DEPRECATED: Use /api/chat/process instead
 * This endpoint now uses LangGraph agent directly (same as /api/chat/process)
 * Kept for backward compatibility only
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
    console.error('❌ [AI JOB CREATION] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process message',
      message: error.message
    });
  }
});

/**
 * POST /process-advanced - DEPRECATED
 * @description DEPRECATED: Use /api/chat/process instead
 * This endpoint is no longer needed as /process now uses LangGraph directly
 */
router.post('/process-advanced', getUserIdFromCookie, getRestaurantUserIdFromCookie, async (req, res) => {
  // Redirect to /process (which now uses LangGraph)
  req.url = '/process';
  router.handle(req, res);
});

/**
 * POST /create-job - Create job from AI extracted data
 * @description Creates a job offer from the AI extracted data
 */
router.post('/create-job', getUserIdFromCookie, getRestaurantUserIdFromCookie, async (req, res) => {
  try {
    const { extractedData, restaurantId, locationId } = req.body;
    
    if (!extractedData || !restaurantId || !locationId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: extractedData, restaurantId, locationId'
      });
    }

    // Import the job creation helper
    const { createJobOffer } = require('../../helpers/jobHelpers.js');
    
    // Prepare job data for database insertion
    const jobData = {
      ...extractedData,
      restaurantId: parseInt(restaurantId),
      restaurantUserId: req.restaurantUserId,
      locationId: parseInt(locationId),
      propina: extractedData.tips ? 'Si' : 'No'
    };

    // Create the job offer
    const jobOffer = await createJobOffer(jobData);
    
    res.json({
      success: true,
      message: 'Job created successfully',
      data: jobOffer
    });

  } catch (error) {
    console.error('❌ [AI JOB CREATION] Error creating job:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create job offer'
    });
  }
});

/**
 * GET /health - Health check endpoint
 * @description Checks service health and MCP connection status
 */
router.get('/health', async (req, res) => {
  try {
    //this is it
    const client = aiJobCreationService.mcpClient;
    const isConnected = client?.isConnected || false;
    const status = client?.getStatus ? client.getStatus() : { isConnected };
    const health = client?.healthCheck ? await client.healthCheck() : { healthy: false, reason: 'No client' };
    
    res.json({
      success: true,
      status: 'healthy',
      mcpConnected: isConnected,
      mcpStatus: status,
      mcpHealth: health,
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

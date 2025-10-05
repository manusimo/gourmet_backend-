const express = require('express');
const router = express.Router();
const { getUserIdFromCookie, getRestaurantUserIdFromCookie } = require('../../helpers/cookies.js');
const { requirePlan } = require('../../middleware/checkPlan.js');
const { AIJobCreationServiceMCP } = require('../../services/mcp');

/**
 * AI Job Creation Routes with MCP Integration
 * Requires PRO+ plan for AI agent features
 */

// Initialize MCP service
const aiJobCreationService = new AIJobCreationServiceMCP();

// Initialize MCP connection on startup
aiJobCreationService.initialize().catch(error => {
  console.error('❌ [AI JOB CREATION MCP] Failed to initialize:', error);
});

/**
 * POST /ai-job-creation-mcp/process - Process job creation message with MCP
 */
router.post('/process', requirePlan(['pro', 'plus', 'premium']), getUserIdFromCookie, getRestaurantUserIdFromCookie, async (req, res) => {
  try {
    console.log('🤖 [AI JOB CREATION MCP] Processing job creation message');
    
    const { 
      message, 
      conversationHistory = [], 
      restaurantId,
      locationId 
    } = req.body;

    if (!message || !restaurantId) {
      return res.status(400).json({
        success: false,
        error: 'message and restaurantId are required'
      });
    }

    // Get restaurant context
    const { prisma } = require('../../db.js');
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: parseInt(restaurantId) },
      include: { user: true }
    });

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        error: 'Restaurant not found'
      });
    }

    const restaurantContext = {
      id: restaurant.id,
      name: restaurant.name,
      userId: req.restaurantUserId,
      locationId: locationId || 1
    };

    // Process message with MCP
    const result = await aiJobCreationService.processMessage(
      message, 
      conversationHistory, 
      restaurantContext
    );

    console.log('✅ [AI JOB CREATION MCP] Message processed successfully');

    res.status(200).json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('❌ [AI JOB CREATION MCP] Error processing message:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process job creation message'
    });
  }
});

/**
 * POST /ai-job-creation-mcp/validate - Validate job data
 */
router.post('/validate', requirePlan(['pro', 'plus', 'premium']), async (req, res) => {
  try {
    const { extractedData } = req.body;

    if (!extractedData) {
      return res.status(400).json({
        success: false,
        error: 'extractedData is required'
      });
    }

    const validation = aiJobCreationService.validateJobData(extractedData);

    res.status(200).json({
      success: true,
      validation
    });

  } catch (error) {
    console.error('❌ [AI JOB CREATION MCP] Error validating job data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate job data'
    });
  }
});

/**
 * GET /ai-job-creation-mcp/health - Health check
 */
router.get('/health', async (req, res) => {
  try {
    // Check if MCP client is connected
    const isConnected = aiJobCreationService.mcpClient.isConnected;
    
    res.status(200).json({
      success: true,
      status: 'healthy',
      mcpConnected: isConnected,
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

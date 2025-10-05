const express = require('express');
const router = express.Router();
const { getUserIdFromCookie, getRestaurantUserIdFromCookie } = require('../../helpers/cookies.js');
const { requirePlan } = require('../../middleware/checkPlan.js');
const { AIJobCreationServiceMCP } = require('../../services/mcp');
const { prisma } = require('../../db.js');

/**
 * AI Job Creation Routes
 * Handles natural language job creation with AI processing
 * Requires PRO+ plan for AI agent features
 */

// Initialize MCP service
const aiJobCreationService = new AIJobCreationServiceMCP();

// Initialize MCP connection on startup
aiJobCreationService.initialize().catch(error => {
  console.error('❌ [AI JOB CREATION MCP] Failed to initialize:', error);
});

/**
 * POST /process - Process job creation message with AI
 * @description Analyzes natural language job descriptions and extracts structured data
 */
router.post('/process', requirePlan(['pro', 'plus', 'premium']), getUserIdFromCookie, getRestaurantUserIdFromCookie, async (req, res) => {
  try {
    const result = await aiJobCreationService.processJobCreationRequest(req.body, req.restaurantUserId);
    
    if (result.statusCode) {
      return res.status(result.statusCode).json(result);
    }
    
    res.json(result);
  } catch (error) {
    console.error('❌ [AI JOB CREATION] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process job creation request'
    });
  }
});

/**
 * GET /health - Health check endpoint
 * @description Checks service health and MCP connection status
 */
router.get('/health', async (req, res) => {
  try {
    const isConnected = aiJobCreationService.mcpClient?.isConnected || false;
    
    res.json({
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

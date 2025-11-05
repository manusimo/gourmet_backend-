const express = require('express');
const router = express.Router();
const { getUserIdFromCookie, getRestaurantUserIdFromCookie } = require('../../helpers/cookies.js');
const { requirePlan } = require('../../middleware/checkPlan.js');
const { AIJobCreationServiceMCP } = require('../../services/mcp');
const { prisma } = require('../../db.js');
const AdvancedJobCreationAgent = require('../../services/agents/jobCreationAgentGraph');

/**
 * AI Job Creation Routes
 * Handles natural language job creation with AI processing
 * Requires PRO+ plan for AI agent features
 */

// Initialize services
const aiJobCreationService = new AIJobCreationServiceMCP();
const advancedAgent = new AdvancedJobCreationAgent();

// Note: client initialization is handled internally by the service constructor

/**
 * POST /process - Process job creation message with AI (Basic agent)
 * @description Analyzes natural language job descriptions and extracts structured data
 * Uses the basic MCP-based agent (sequential, hardcoded logic)
 */
router.post('/process', getUserIdFromCookie, getRestaurantUserIdFromCookie, async (req, res) => {
  try {
    console.log('📥 [AI JOB CREATION ROUTE] Received request (basic agent):', {
      body: req.body,
      restaurantUserId: req.restaurantUserId,
      hasMessage: !!req.body.message,
      hasRestaurantId: !!req.body.restaurantId
    });
    
    const result = await aiJobCreationService.processJobCreationRequest(req.body, req.restaurantUserId);
    
    console.log('📤 [AI JOB CREATION ROUTE] Returning result:', {
      success: result.success,
      hasData: !!result.data,
      dataType: typeof result.data,
      dataKeys: Object.keys(result.data || {}),
      isError: result.data?.isError,
      statusCode: result.statusCode,
      error: result.error
    });
    
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
 * POST /process-advanced - Process job creation with advanced agent (Auto-reasoning)
 * @description Uses LangGraph-based agent with auto-reasoning capabilities
 * The agent decides what actions to take dynamically instead of following hardcoded rules
 */
router.post('/process-advanced', getUserIdFromCookie, getRestaurantUserIdFromCookie, async (req, res) => {
  try {
    console.log('🤖 [AI JOB CREATION ROUTE] Received request (advanced agent):', {
      body: req.body,
      restaurantUserId: req.restaurantUserId,
      hasMessage: !!req.body.message,
      hasRestaurantId: !!req.body.restaurantId
    });
    
    const { message, conversationHistory = [], restaurantId, locationId } = req.body;
    
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
    
    // Build restaurant context
    const restaurantContext = {
      id: parseInt(restaurantId),
      userId: req.restaurantUserId,
      locationId: locationId ? parseInt(locationId) : 1
    };
    
    // Process with advanced agent
    const result = await advancedAgent.processRequest(
      message,
      conversationHistory,
      restaurantContext
    );
    
    console.log('📤 [AI JOB CREATION ROUTE] Advanced agent result:', {
      success: result.success,
      status: result.status,
      hasReasoning: !!result.reasoning,
      completedActions: result.completedActions?.length || 0
    });
    
    res.json({
      success: result.success,
      data: result
    });
    
  } catch (error) {
    console.error('❌ [AI JOB CREATION] Advanced agent error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process job creation request with advanced agent',
      message: error.message
    });
  }
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
      // Map tips to propina for compatibility with createJobOffer
      propina: extractedData.tips ? 'Si' : 'No'
    };

    console.log('💼 [AI JOB CREATION] Creating job from extracted data:', jobData);

    // Create the job offer
    const jobOffer = await createJobOffer(jobData);
    
    console.log('✅ [AI JOB CREATION] Job created successfully:', jobOffer.id);

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

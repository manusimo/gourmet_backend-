const express = require('express');
const router = express.Router();
const { getUserIdFromCookie, getRestaurantUserIdFromCookie } = require('../../helpers/cookies.js');
const { TalentMatchServiceMCP } = require('../../services/mcp');

/**
 * Talent Match Routes
 * Handles candidate matching for jobs
 */

// Initialize service
const talentMatchService = new TalentMatchServiceMCP();

/**
 * POST /match - Match best applicants for a job
 * @description Finds and ranks the best matching applicants for a specific job
 */
router.post('/match', getUserIdFromCookie, getRestaurantUserIdFromCookie, async (req, res) => {
  try {
    const { jobId, limit = 10, includeAlreadyApplied = false, minSimilarityScore = 50 } = req.body;
    
    if (!jobId) {
      return res.status(400).json({
        success: false,
        error: 'Job ID is required'
      });
    }
    
    const result = await talentMatchService.matchBestApplicants(jobId, {
      limit,
      includeAlreadyApplied,
      minSimilarityScore
    });
    
    if (result.statusCode) {
      return res.status(result.statusCode).json(result);
    }
    
    res.json(result);
  } catch (error) {
    console.error('❌ [TALENT MATCH] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to match applicants'
    });
  }
});

/**
 * GET /health - Health check endpoint
 */
router.get('/health', async (req, res) => {
  try {
    const client = talentMatchService.mcpClient;
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


const express = require('express');
const router = express.Router();
const ragService = require('../services/ragService');
const { getUserIdFromCookie, getRestaurantUserIdFromCookie } = require('../helpers/cookies');
const { sendSuccessResponse, handleRagError } = require('../utils/responseHelpers.js');
const Logger = require('../utils/logger.js');

/**
 * POST /rag/store - Store new knowledge document
 */
router.post('/store', getUserIdFromCookie, getRestaurantUserIdFromCookie, async (req, res) => {
  try {
    const { content, metadata } = req.body;

    const document = await ragService.storeDocument(content, metadata);

    sendSuccessResponse(res, 200, null, {
      id: document.id,
      type: document.type,
      qualityScore: document.qualityScore,
      createdAt: document.createdAt
    });
  } catch (error) {
    handleRagError(res, error, {
      context: {
        endpoint: '/rag/store',
        userId: req.userId,
        restaurantUserId: req.restaurantUserId
      },
      logger: Logger
    });
  }
});

/**
 * POST /rag/search - Search knowledge documents
 */
router.post('/search', getUserIdFromCookie, getRestaurantUserIdFromCookie, async (req, res) => {
  try {
    const { query, limit = 5 } = req.body;

    if (!query || query.trim().length < 3) {
      const error = new Error('Query is required and must be at least 3 characters long');
      error.statusCode = 400;
      error.code = 'VALIDATION_ERROR';
      throw error;
    }

    const results = await ragService.searchSimilarDocuments(query, limit);

    sendSuccessResponse(res, 200, null, {
      results: results.map(doc => ({
        id: doc.id,
        content: doc.content,
        metadata: JSON.parse(doc.metadata),
        similarity: doc.similarity,
        qualityScore: doc.qualityScore
      }))
    });
  } catch (error) {
    handleRagError(res, error, {
      context: {
        endpoint: '/rag/search',
        userId: req.userId,
        restaurantUserId: req.restaurantUserId,
        query: req.body.query
      },
      logger: Logger
    });
  }
});

/**
 * POST /rag/context - Get context for AI agents
 */
router.post('/context', getUserIdFromCookie, getRestaurantUserIdFromCookie, async (req, res) => {
  try {
    const { query, agentType = 'general' } = req.body;

    if (!query || query.trim().length < 3) {
      const error = new Error('Query is required and must be at least 3 characters long');
      error.statusCode = 400;
      error.code = 'VALIDATION_ERROR';
      throw error;
    }

    const context = await ragService.getContextForAgent(query, agentType);

    sendSuccessResponse(res, 200, null, {
      context: context.context,
      sources: context.sources,
      totalResults: context.totalResults
    });
  } catch (error) {
    handleRagError(res, error, {
      context: {
        endpoint: '/rag/context',
        userId: req.userId,
        restaurantUserId: req.restaurantUserId,
        query: req.body.query,
        agentType: req.body.agentType
      },
      logger: Logger
    });
  }
});

/**
 * GET /rag/stats - Get knowledge base statistics
 */
router.get('/stats', getUserIdFromCookie, getRestaurantUserIdFromCookie, async (req, res) => {
  try {
    const stats = await ragService.getStats();

    sendSuccessResponse(res, 200, null, stats);
  } catch (error) {
    handleRagError(res, error, {
      context: {
        endpoint: '/rag/stats',
        userId: req.userId,
        restaurantUserId: req.restaurantUserId
      },
      logger: Logger
    });
  }
});

/**
 * POST /rag/initialize - Initialize knowledge base with default content
 */
router.post('/initialize', getUserIdFromCookie, getRestaurantUserIdFromCookie, async (req, res) => {
  try {
    await ragService.initializeKnowledgeBase();

    sendSuccessResponse(res, 200, 'Knowledge base initialized successfully');
  } catch (error) {
    handleRagError(res, error, {
      context: {
        endpoint: '/rag/initialize',
        userId: req.userId,
        restaurantUserId: req.restaurantUserId
      },
      logger: Logger
    });
  }
});

module.exports = router;

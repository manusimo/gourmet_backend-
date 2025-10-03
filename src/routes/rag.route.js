const express = require('express');
const router = express.Router();
const ragService = require('../services/ragService');
const { getUserIdFromCookie, getRestaurantUserIdFromCookie } = require('../helpers/cookies');

/**
 * POST /rag/store - Store new knowledge document
 */
router.post('/store', getUserIdFromCookie, getRestaurantUserIdFromCookie, async (req, res) => {
  try {
    console.log('📝 [RAG] Storing new document');

    const { content, metadata } = req.body;

    if (!content || content.trim().length < 10) {
      return res.status(400).json({
        success: false,
        error: 'Content is required and must be at least 10 characters long'
      });
    }

    if (!metadata || !metadata.type) {
      return res.status(400).json({
        success: false,
        error: 'Metadata with type is required'
      });
    }

    const document = await ragService.storeDocument(content, metadata);

    res.status(200).json({
      success: true,
      document: {
        id: document.id,
        type: document.type,
        qualityScore: document.qualityScore,
        createdAt: document.createdAt
      }
    });

  } catch (error) {
    console.error('❌ [RAG] Error storing document:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to store document'
    });
  }
});

/**
 * POST /rag/search - Search knowledge documents
 */
router.post('/search', getUserIdFromCookie, getRestaurantUserIdFromCookie, async (req, res) => {
  try {
    console.log('🔍 [RAG] Searching documents');

    const { query, limit = 5 } = req.body;

    if (!query || query.trim().length < 3) {
      return res.status(400).json({
        success: false,
        error: 'Query is required and must be at least 3 characters long'
      });
    }

    const results = await ragService.searchSimilarDocuments(query, limit);

    res.status(200).json({
      success: true,
      results: results.map(doc => ({
        id: doc.id,
        content: doc.content,
        metadata: JSON.parse(doc.metadata),
        similarity: doc.similarity,
        qualityScore: doc.qualityScore
      }))
    });

  } catch (error) {
    console.error('❌ [RAG] Error searching documents:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search documents'
    });
  }
});

/**
 * POST /rag/context - Get context for AI agents
 */
router.post('/context', getUserIdFromCookie, getRestaurantUserIdFromCookie, async (req, res) => {
  try {
    console.log('📚 [RAG] Getting context for agent');

    const { query, agentType = 'general' } = req.body;

    if (!query || query.trim().length < 3) {
      return res.status(400).json({
        success: false,
        error: 'Query is required and must be at least 3 characters long'
      });
    }

    const context = await ragService.getContextForAgent(query, agentType);

    res.status(200).json({
      success: true,
      context: context.context,
      sources: context.sources,
      totalResults: context.totalResults
    });

  } catch (error) {
    console.error('❌ [RAG] Error getting context:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get context'
    });
  }
});

/**
 * GET /rag/stats - Get knowledge base statistics
 */
router.get('/stats', getUserIdFromCookie, getRestaurantUserIdFromCookie, async (req, res) => {
  try {
    console.log('📊 [RAG] Getting statistics');

    const stats = await ragService.getStats();

    res.status(200).json({
      success: true,
      stats
    });

  } catch (error) {
    console.error('❌ [RAG] Error getting stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get statistics'
    });
  }
});

/**
 * POST /rag/initialize - Initialize knowledge base with default content
 */
router.post('/initialize', getUserIdFromCookie, getRestaurantUserIdFromCookie, async (req, res) => {
  try {
    console.log('🚀 [RAG] Initializing knowledge base');

    await ragService.initializeKnowledgeBase();

    res.status(200).json({
      success: true,
      message: 'Knowledge base initialized successfully'
    });

  } catch (error) {
    console.error('❌ [RAG] Error initializing knowledge base:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initialize knowledge base'
    });
  }
});

module.exports = router;

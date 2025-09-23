const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { checkCompany } = require('../helpers/authenticateToken.js');
const { getRestaurantIdFromCookie } = require('../helpers/cookies.js');
const conversationalAgent = require('../services/conversationalAgent.js');

const prisma = new PrismaClient();
const router = express.Router();

// POST /conversational-agent/start - Start agent for a conversation
router.post('/conversational-agent/start', checkCompany, getRestaurantIdFromCookie, async (req, res) => {
  try {
    const { conversationId } = req.body;
    const restaurantId = req.restaurantId;

    if (!conversationId) {
      return res.status(400).json({
        success: false,
        message: 'Conversation ID is required'
      });
    }

    // Verify the conversation belongs to the restaurant
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: parseInt(conversationId),
        restaurantId: restaurantId
      }
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found or access denied'
      });
    }

    // Start the conversational agent
    const result = await conversationalAgent.startAgentForConversation(
      parseInt(conversationId), 
      restaurantId
    );

    res.json(result);

  } catch (error) {
    console.error('Error starting conversational agent:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// POST /conversational-agent/stop - Stop agent for a conversation
router.post('/conversational-agent/stop', checkCompany, getRestaurantIdFromCookie, async (req, res) => {
  try {
    const { conversationId } = req.body;

    if (!conversationId) {
      return res.status(400).json({
        success: false,
        message: 'Conversation ID is required'
      });
    }

    conversationalAgent.stopAgentForConversation(parseInt(conversationId));

    res.json({
      success: true,
      message: 'Conversational agent stopped successfully'
    });

  } catch (error) {
    console.error('Error stopping conversational agent:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// GET /conversational-agent/status - Get agent status
router.get('/conversational-agent/status', checkCompany, getRestaurantIdFromCookie, async (req, res) => {
  try {
    const status = conversationalAgent.getAgentStatus();

    res.json({
      success: true,
      data: status
    });

  } catch (error) {
    console.error('Error getting agent status:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// GET /conversational-agent/conversation/:conversationId - Get conversation state
router.get('/conversational-agent/conversation/:conversationId', checkCompany, getRestaurantIdFromCookie, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const restaurantId = req.restaurantId;

    // Verify the conversation belongs to the restaurant
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: parseInt(conversationId),
        restaurantId: restaurantId
      }
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found or access denied'
      });
    }

    const state = conversationalAgent.getConversationState(parseInt(conversationId));

    res.json({
      success: true,
      data: {
        conversationId: parseInt(conversationId),
        state: state,
        isActive: !!state
      }
    });

  } catch (error) {
    console.error('Error getting conversation state:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// POST /conversational-agent/process-message - Process incoming message (called by chat system)
router.post('/conversational-agent/process-message', async (req, res) => {
  try {
    const { conversationId, messageText, senderType } = req.body;

    if (!conversationId || !messageText || !senderType) {
      return res.status(400).json({
        success: false,
        message: 'Conversation ID, message text, and sender type are required'
      });
    }

    // Process the message with the conversational agent
    await conversationalAgent.processMessage(
      parseInt(conversationId),
      messageText,
      senderType
    );

    res.json({
      success: true,
      message: 'Message processed successfully'
    });

  } catch (error) {
    console.error('Error processing message:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

module.exports = router;

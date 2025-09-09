const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const aiAgentService = require('../services/aiAgentService');
const { getUserIdFromCookie, getRestaurantUserIdFromCookie } = require('../helpers/cookies');
const { requirePlan } = require('../middleware/checkPlan');

const prisma = new PrismaClient();

/**
 * AI Agent Routes for Gourmet Jobs Platform
 * Requires PRO+ plan for AI agent features
 */

// POST /api/ai-agent/process-message - Process message with AI agent
router.post('/process-message', requirePlan(['pro', 'plus', 'premium']), async (req, res) => {
  try {
    const messageData = req.body;
    
    const result = await aiAgentService.processMessage(messageData);
    
    if (result.isAgentMessage) {
      // Save agent response to database
      await saveAgentResponse(result, messageData.conversationId);
      
      // Handle any actions (like scheduling calls)
      if (result.actions && result.actions.length > 0) {
        await handleAgentActions(result.actions, messageData);
      }
    }
    
    res.status(200).json({
      success: true,
      data: result
    });
    
  } catch (error) {
    console.error('❌ Error processing AI agent message:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process AI agent message'
    });
  }
});

// POST /api/ai-agent/create - Create new AI agent
router.post('/create', requirePlan(['plus', 'premium']), getUserIdFromCookie, async (req, res) => {
  try {
    const agentData = {
      ...req.body,
      createdByUserId: req.userId
    };
    
    const agent = await aiAgentService.createAgent(agentData);
    
    res.status(201).json({
      success: true,
      message: 'AI agent created successfully',
      data: agent
    });
    
  } catch (error) {
    console.error('❌ Error creating AI agent:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create AI agent'
    });
  }
});

// GET /api/ai-agent/list - Get AI agents for restaurant
router.get('/list', requirePlan(['pro', 'plus', 'premium']), getUserIdFromCookie, async (req, res) => {
  try {
    const { restaurantId } = req.query;
    
    const agents = await prisma.aiAgent.findMany({
      where: {
        OR: [
          { restaurantId: restaurantId ? parseInt(restaurantId) : undefined },
          { restaurantId: null } // Global agents
        ],
        isActive: true
      },
      include: {
        restaurant: true,
        createdBy: {
          select: { name: true, email: true }
        },
        _count: {
          select: {
            conversations: true,
            scheduledCalls: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    res.status(200).json({
      success: true,
      data: agents
    });
    
  } catch (error) {
    console.error('❌ Error fetching AI agents:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch AI agents'
    });
  }
});

// GET /api/ai-agent/:id - Get specific AI agent
router.get('/:id', requirePlan(['pro', 'plus', 'premium']), async (req, res) => {
  try {
    const agentId = parseInt(req.params.id);
    
    const agent = await prisma.aiAgent.findUnique({
      where: { id: agentId },
      include: {
        restaurant: true,
        createdBy: {
          select: { name: true, email: true }
        },
        agentConfigs: true,
        conversations: {
          include: {
            user: {
              select: { name: true, email: true }
            }
          },
          orderBy: { updatedAt: 'desc' },
          take: 5
        },
        scheduledCalls: {
          orderBy: { scheduledDate: 'desc' },
          take: 5
        }
      }
    });
    
    if (!agent) {
      return res.status(404).json({
        success: false,
        error: 'AI agent not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: agent
    });
    
  } catch (error) {
    console.error('❌ Error fetching AI agent:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch AI agent'
    });
  }
});

// PUT /api/ai-agent/:id - Update AI agent
router.put('/:id', requirePlan(['plus', 'premium']), getUserIdFromCookie, async (req, res) => {
  try {
    const agentId = parseInt(req.params.id);
    const updateData = req.body;
    
    // Check if user has permission to update this agent
    const agent = await prisma.aiAgent.findUnique({
      where: { id: agentId },
      select: { createdByUserId: true, restaurantId: true }
    });
    
    if (!agent) {
      return res.status(404).json({
        success: false,
        error: 'AI agent not found'
      });
    }
    
    // Only creator or restaurant admin can update
    if (agent.createdByUserId !== req.userId) {
      return res.status(403).json({
        success: false,
        error: 'Permission denied'
      });
    }
    
    const updatedAgent = await prisma.aiAgent.update({
      where: { id: agentId },
      data: {
        name: updateData.name,
        description: updateData.description,
        avatar: updateData.avatar,
        personality: updateData.personality ? JSON.stringify(updateData.personality) : undefined,
        capabilities: updateData.capabilities,
        isActive: updateData.isActive
      }
    });
    
    res.status(200).json({
      success: true,
      message: 'AI agent updated successfully',
      data: updatedAgent
    });
    
  } catch (error) {
    console.error('❌ Error updating AI agent:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update AI agent'
    });
  }
});

// DELETE /api/ai-agent/:id - Delete AI agent
router.delete('/:id', requirePlan(['plus', 'premium']), getUserIdFromCookie, async (req, res) => {
  try {
    const agentId = parseInt(req.params.id);
    
    // Check if user has permission to delete this agent
    const agent = await prisma.aiAgent.findUnique({
      where: { id: agentId },
      select: { createdByUserId: true }
    });
    
    if (!agent) {
      return res.status(404).json({
        success: false,
        error: 'AI agent not found'
      });
    }
    
    if (agent.createdByUserId !== req.userId) {
      return res.status(403).json({
        success: false,
        error: 'Permission denied'
      });
    }
    
    // Soft delete by setting isActive to false
    await prisma.aiAgent.update({
      where: { id: agentId },
      data: { isActive: false }
    });
    
    res.status(200).json({
      success: true,
      message: 'AI agent deleted successfully'
    });
    
  } catch (error) {
    console.error('❌ Error deleting AI agent:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete AI agent'
    });
  }
});

// POST /api/ai-agent/:id/activate - Activate agent in conversation
router.post('/:id/activate', requirePlan(['pro', 'plus', 'premium']), async (req, res) => {
  try {
    const agentId = parseInt(req.params.id);
    const { conversationId } = req.body;
    
    // Check if agent exists and is active
    const agent = await prisma.aiAgent.findUnique({
      where: { id: agentId, isActive: true }
    });
    
    if (!agent) {
      return res.status(404).json({
        success: false,
        error: 'AI agent not found or inactive'
      });
    }
    
    // Create or update agent conversation
    const agentConversation = await prisma.agentConversation.upsert({
      where: {
        agentId_conversationId: {
          agentId: agentId,
          conversationId: conversationId
        }
      },
      update: {
        isActive: true,
        updatedAt: new Date()
      },
      create: {
        agentId: agentId,
        conversationId: conversationId,
        userId: req.body.userId || 1, // This should come from the request
        isActive: true
      }
    });
    
    res.status(200).json({
      success: true,
      message: 'AI agent activated in conversation',
      data: agentConversation
    });
    
  } catch (error) {
    console.error('❌ Error activating AI agent:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to activate AI agent'
    });
  }
});

// GET /api/ai-agent/scheduled-calls - Get scheduled calls
router.get('/scheduled-calls', requirePlan(['pro', 'plus', 'premium']), getUserIdFromCookie, async (req, res) => {
  try {
    const { restaurantId, status } = req.query;
    
    const scheduledCalls = await prisma.scheduledCall.findMany({
      where: {
        restaurantId: restaurantId ? parseInt(restaurantId) : undefined,
        status: status || undefined
      },
      include: {
        agent: true,
        restaurant: true,
        employee: {
          include: { user: true }
        },
        restaurantUser: {
          include: { user: true }
        }
      },
      orderBy: { scheduledDate: 'asc' }
    });
    
    res.status(200).json({
      success: true,
      data: scheduledCalls
    });
    
  } catch (error) {
    console.error('❌ Error fetching scheduled calls:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch scheduled calls'
    });
  }
});

// Helper function to save agent response
async function saveAgentResponse(result, conversationId) {
  try {
    // Find the agent conversation
    const agentConversation = await prisma.agentConversation.findFirst({
      where: { conversationId: conversationId }
    });
    
    if (agentConversation) {
      // Create agent message record
      await prisma.agentMessage.create({
        data: {
          agentConversationId: agentConversation.id,
          messageId: result.messageId || 0, // This should be the actual message ID
          agentResponse: result.response,
          intent: result.intent,
          confidence: result.confidence
        }
      });
    }
  } catch (error) {
    console.error('❌ Error saving agent response:', error);
  }
}

// Helper function to handle agent actions
async function handleAgentActions(actions, messageData) {
  try {
    for (const action of actions) {
      if (action.type === 'call_scheduled') {
        // Additional processing for scheduled calls
        console.log('📅 Call scheduled:', action.data);
      }
    }
  } catch (error) {
    console.error('❌ Error handling agent actions:', error);
  }
}

module.exports = router;

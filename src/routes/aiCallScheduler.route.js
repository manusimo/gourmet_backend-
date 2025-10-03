const express = require('express');
const router = express.Router();
const { prisma } = require('../db.js');
const { getUserIdFromCookie } = require('../helpers/cookies.js');
const conversationalCallScheduler = require('../services/conversationalCallScheduler.js');

/**
 * POST /schedule-calls - Start AI agents to schedule calls with candidates
 */
router.post('/schedule-calls', getUserIdFromCookie, async (req, res) => {
  try {
    console.log('🤖 [AI CALL SCHEDULER] Starting AI call scheduling process');
    
    const { jobPostId, restaurantId } = req.body;
    const userId = req.userId;

    if (!jobPostId || !restaurantId) {
      return res.status(400).json({
        success: false,
        error: 'jobPostId and restaurantId are required'
      });
    }

    console.log('🤖 [AI CALL SCHEDULER] Parameters:', { jobPostId, restaurantId, userId });

    // Get job post details
    const jobPost = await prisma.jobPost.findUnique({
      where: { id: parseInt(jobPostId) },
      include: {
        restaurant: {
          include: {
            user: true,
            restaurantUsers: {
              include: { user: true }
            }
          }
        }
      }
    });

    if (!jobPost) {
      return res.status(404).json({
        success: false,
        error: 'Job post not found'
      });
    }

    // Get all applications for this job post
    const applications = await prisma.application.findMany({
      where: { jobPostId: parseInt(jobPostId) },
      include: {
        employee: {
          include: {
            user: true
          }
        }
      }
    });

    console.log(`🤖 [AI CALL SCHEDULER] Found ${applications.length} applications for job ${jobPostId}`);

    if (applications.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No applications found for this job post'
      });
    }

    // Start conversational AI agents for each candidate
    const aiAgentPromises = applications.map(async (application) => {
      try {
        console.log(`🤖 [AI CALL SCHEDULER] Starting conversational AI agent for candidate: ${application.employee.user.name}`);
        
        // Create AI agent conversation with the candidate
        const conversation = await prisma.conversation.create({
          data: {
            restaurantId: jobPost.restaurantId,
            employeeId: application.employeeId,
            status: 'active',
            type: 'ai_interview_scheduling'
          }
        });

        // Start conversational AI agent
        const agentResult = await conversationalCallScheduler.startConversation({
          candidateName: application.employee.user.name,
          candidateEmail: application.employee.user.email,
          jobTitle: jobPost.position,
          restaurantName: jobPost.restaurant.name,
          conversationId: conversation.id
        });

        if (agentResult.success) {
          console.log(`✅ [AI CALL SCHEDULER] Conversational AI agent started for ${application.employee.user.name}, conversation ID: ${conversation.id}`);
          
          return {
            success: true,
            candidateName: application.employee.user.name,
            conversationId: conversation.id,
            messageId: agentResult.messageId,
            initialMessage: agentResult.initialMessage
          };
        } else {
          throw new Error(agentResult.error);
        }

      } catch (error) {
        console.error(`❌ [AI CALL SCHEDULER] Failed to start conversational AI agent for ${application.employee.user.name}:`, error);
        return {
          success: false,
          candidateName: application.employee.user.name,
          error: error.message
        };
      }
    });

    // Wait for all AI agents to start
    const results = await Promise.all(aiAgentPromises);
    
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    console.log(`🤖 [AI CALL SCHEDULER] Completed: ${successful} successful, ${failed} failed`);

    res.status(200).json({
      success: true,
      message: `AI agents started successfully for ${successful} candidates`,
      data: {
        totalCandidates: applications.length,
        successfulAgents: successful,
        failedAgents: failed,
        results: results
      }
    });

  } catch (error) {
    console.error('❌ [AI CALL SCHEDULER] Error starting AI call scheduling:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start AI call scheduling'
    });
  }
});

/**
 * POST /process-message - Process a message from a candidate and generate AI response
 */
router.post('/process-message', getUserIdFromCookie, async (req, res) => {
  try {
    console.log('🤖 [AI AGENT] Processing candidate message');
    
    const { conversationId, candidateMessage, candidateName, candidateEmail } = req.body;

    if (!conversationId || !candidateMessage) {
      return res.status(400).json({
        success: false,
        error: 'conversationId and candidateMessage are required'
      });
    }

    // Get conversation details
    const conversation = await prisma.conversation.findUnique({
      where: { id: parseInt(conversationId) },
      include: {
        restaurant: true,
        employee: {
          include: { user: true }
        }
      }
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: 'Conversation not found'
      });
    }

    // Process message with conversational AI agent
    const result = await conversationalCallScheduler.processMessage({
      conversationId: parseInt(conversationId),
      candidateMessage,
      candidateName: candidateName || conversation.employee.user.name,
      jobTitle: 'Puesto de trabajo', // You might want to get this from job post
      restaurantName: conversation.restaurant.name,
      candidateEmail: candidateEmail || conversation.employee.user.email
    });

    if (result.success) {
      res.status(200).json({
        success: true,
        data: {
          aiResponse: result.aiResponse,
          context: result.context,
          messageId: result.messageId
        }
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }

  } catch (error) {
    console.error('❌ [AI AGENT] Error processing message:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process message'
    });
  }
});

/**
 * GET /schedule-calls/status/:jobPostId - Get status of AI call scheduling for a job
 */
router.get('/schedule-calls/status/:jobPostId', getUserIdFromCookie, async (req, res) => {
  try {
    const { jobPostId } = req.params;
    
    // Get all AI conversations for this job post
    const conversations = await prisma.conversation.findMany({
      where: {
        restaurant: {
          jobPosts: {
            some: { id: parseInt(jobPostId) }
          }
        },
        type: 'ai_interview_scheduling'
      },
      include: {
        employee: {
          include: { user: true }
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    });

    res.status(200).json({
      success: true,
      data: {
        totalConversations: conversations.length,
        conversations: conversations.map(conv => ({
          id: conv.id,
          candidateName: conv.employee.user.name,
          status: conv.status,
          lastMessage: conv.messages[0]?.text || null,
          lastMessageTime: conv.messages[0]?.createdAt || null
        }))
      }
    });

  } catch (error) {
    console.error('❌ [AI CALL SCHEDULER] Error getting status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get AI call scheduling status'
    });
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const { prisma } = require('../../db.js');
const { getUserIdFromCookie } = require('../../helpers/cookies.js');
const { ConversationalCallSchedulerMCP } = require('../../services/mcp');

/**
 * AI Call Scheduler Routes with MCP Integration
 */

// Initialize MCP service
const conversationalCallScheduler = new ConversationalCallSchedulerMCP();

// Initialize MCP connection on startup
conversationalCallScheduler.initialize().catch(error => {
  console.error('❌ [AI CALL SCHEDULER MCP] Failed to initialize:', error);
});

/**
 * POST /schedule-calls-mcp - Start AI agents to schedule calls with candidates using MCP
 */
router.post('/schedule-calls', getUserIdFromCookie, async (req, res) => {
  try {
    console.log('🤖 [AI CALL SCHEDULER MCP] Starting AI call scheduling process');
    
    const { jobPostId, restaurantId } = req.body;
    const userId = req.userId;

    if (!jobPostId || !restaurantId) {
      return res.status(400).json({
        success: false,
        error: 'jobPostId and restaurantId are required'
      });
    }

    console.log('🤖 [AI CALL SCHEDULER MCP] Parameters:', { jobPostId, restaurantId, userId });

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

    console.log(`🤖 [AI CALL SCHEDULER MCP] Found ${applications.length} applications for job ${jobPostId}`);

    if (applications.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No applications found for this job post'
      });
    }

    // Start conversational AI agents for each candidate using MCP
    const aiAgentPromises = applications.map(async (application) => {
      try {
        console.log(`🤖 [AI CALL SCHEDULER MCP] Starting conversational AI agent for candidate: ${application.employee.user.name}`);
        
        // Create AI agent conversation with the candidate
        const conversation = await prisma.conversation.create({
          data: {
            restaurantId: jobPost.restaurantId,
            employeeId: application.employeeId,
            status: 'active',
            type: 'ai_interview_scheduling'
          }
        });

        // Start conversational AI agent using MCP
        const agentResult = await conversationalCallScheduler.startConversation({
          candidateName: application.employee.user.name,
          candidateEmail: application.employee.user.email,
          jobTitle: jobPost.position,
          restaurantName: jobPost.restaurant.name,
          conversationId: conversation.id
        });

        if (agentResult.success) {
          console.log(`✅ [AI CALL SCHEDULER MCP] Conversational AI agent started for ${application.employee.user.name}, conversation ID: ${conversation.id}`);
          
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
        console.error(`❌ [AI CALL SCHEDULER MCP] Failed to start conversational AI agent for ${application.employee.user.name}:`, error);
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

    console.log(`✅ [AI CALL SCHEDULER MCP] AI agents started: ${successful} successful, ${failed} failed`);

    res.status(200).json({
      success: true,
      message: `AI call scheduling process completed`,
      results: {
        total: applications.length,
        successful,
        failed,
        details: results
      }
    });

  } catch (error) {
    console.error('❌ [AI CALL SCHEDULER MCP] Error starting AI call scheduling:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start AI call scheduling process'
    });
  }
});

/**
 * POST /process-message-mcp - Process message from candidate using MCP
 */
router.post('/process-message', getUserIdFromCookie, async (req, res) => {
  try {
    console.log('🤖 [AI CALL SCHEDULER MCP] Processing candidate message');
    
    const {
      conversationId,
      candidateMessage,
      candidateName,
      jobTitle,
      restaurantName,
      candidateEmail
    } = req.body;

    if (!conversationId || !candidateMessage) {
      return res.status(400).json({
        success: false,
        error: 'conversationId and candidateMessage are required'
      });
    }

    // Process message using MCP
    const result = await conversationalCallScheduler.processMessage({
      conversationId,
      candidateMessage,
      candidateName,
      jobTitle,
      restaurantName,
      candidateEmail
    });

    if (result.success) {
      console.log('✅ [AI CALL SCHEDULER MCP] Message processed successfully');
      
      res.status(200).json({
        success: true,
        data: {
          aiResponse: result.aiResponse,
          context: result.context,
          messageId: result.messageId
        }
      });
    } else {
      console.error('❌ [AI CALL SCHEDULER MCP] Failed to process message:', result.error);
      
      res.status(500).json({
        success: false,
        error: result.error
      });
    }

  } catch (error) {
    console.error('❌ [AI CALL SCHEDULER MCP] Error processing message:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process candidate message'
    });
  }
});

/**
 * GET /health - Health check
 */
router.get('/health', async (req, res) => {
  try {
    // Check if MCP client is connected
    const isConnected = conversationalCallScheduler.mcpClient.isConnected;
    
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

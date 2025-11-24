const BaseTool = require('../baseTool');
const { createConversation } = require('../../../helpers/chatHelpers');
const { prisma } = require('../../../db.js');

/**
 * Create Conversation With Candidate Tool
 * Creates a chat conversation between a restaurant user and a candidate
 * Automatically schedules an interview call after creating the conversation
 */
class CreateConversationWithCandidateTool extends BaseTool {
  constructor() {
    super(
      'create_conversation_with_candidate',
      'Creates a chat conversation between a restaurant user and a candidate for a specific job or talent pool. Automatically schedules an interview call. Returns the conversation ID and scheduled call details.',
      {
        type: 'object',
        properties: {
          restaurantUserId: {
            type: 'number',
            description: 'The restaurant user ID who will be the sender'
          },
          employeeId: {
            type: 'number',
            description: 'The candidate/employee ID to create conversation with'
          },
          jobId: {
            type: 'number',
            description: 'Optional: The job ID this conversation is related to'
          },
          restaurantId: {
            type: 'number',
            description: 'The restaurant ID (required for scheduling call)'
          },
          scheduleCall: {
            type: 'boolean',
            description: 'Whether to automatically schedule an interview call (default: true)',
            default: true
          },
          callTitle: {
            type: 'string',
            description: 'Optional: Title for the scheduled call (default: "Entrevista")'
          },
          scheduledDate: {
            type: 'string',
            format: 'date-time',
            description: 'Optional: Date and time for the call (default: tomorrow at 10 AM)'
          }
        },
        required: ['restaurantUserId', 'employeeId', 'restaurantId']
      }
    );
  }

  async handle(args, { prisma: contextPrisma }) {
    const { 
      restaurantUserId, 
      employeeId, 
      jobId, 
      restaurantId,
      scheduleCall = true,
      callTitle,
      scheduledDate
    } = args;
    
    try {
      console.log(`💬 [MCP] Creating conversation: restaurantUserId=${restaurantUserId}, employeeId=${employeeId}, jobId=${jobId || 'none'}, scheduleCall=${scheduleCall}`);

      // Check if conversation already exists
      const existingConversation = await prisma.conversation.findFirst({
        where: {
          restaurantUserId: parseInt(restaurantUserId),
          employeeId: parseInt(employeeId),
          ...(jobId && { jobOfferId: parseInt(jobId) })
        }
      });

      let conversation;
      let isNew = false;

      if (existingConversation) {
        conversation = existingConversation;
        console.log(`✅ [MCP] Conversation already exists: ${conversation.id}`);
      } else {
        // Create new conversation
        conversation = await createConversation({
          restaurantUserId: parseInt(restaurantUserId),
          employeeId: parseInt(employeeId),
          jobOfferId: jobId ? parseInt(jobId) : null
        });
        isNew = true;
        console.log(`✅ [MCP] Conversation created: ${conversation.id}`);
      }

      // Schedule interview call if requested
      let scheduledCall = null;
      if (scheduleCall) {
        try {
          const { getToolHandler } = require('../index');
          const scheduleHandler = getToolHandler('schedule_interview_call');
          
          if (scheduleHandler) {
            // Get job details if jobId provided
            let jobPosition = 'el puesto';
            if (jobId) {
              const job = await prisma.jobOffer.findUnique({
                where: { id: parseInt(jobId) },
                select: { position: true }
              });
              if (job) {
                jobPosition = job.position;
              }
            }

            // Default to tomorrow at 10 AM if not specified
            let callDate = scheduledDate;
            if (!callDate) {
              const tomorrow = new Date();
              tomorrow.setDate(tomorrow.getDate() + 1);
              tomorrow.setHours(10, 0, 0, 0);
              callDate = tomorrow.toISOString();
            }

            const scheduleResult = await scheduleHandler(
              {
                restaurantId: parseInt(restaurantId),
                employeeId: parseInt(employeeId),
                title: callTitle || `Entrevista para ${jobPosition}`,
                description: `Entrevista para el puesto de ${jobPosition}`,
                scheduledDate: callDate,
                duration: 30
              },
              { prisma }
            );

            if (scheduleResult && !scheduleResult.isError) {
              const textContent = scheduleResult?.content?.[0]?.text;
              if (textContent) {
                const parsed = typeof textContent === 'string' ? JSON.parse(textContent) : textContent;
                scheduledCall = parsed.scheduledCall;
                console.log(`✅ [MCP] Interview call scheduled: ${scheduledCall?.id}`);
              }
            }
          } else {
            console.warn('⚠️ [MCP] schedule_interview_call handler not found');
          }
        } catch (scheduleError) {
          console.error('❌ [MCP] Error scheduling call (conversation still created):', scheduleError);
          // Don't fail the whole operation if scheduling fails
        }
      }

      return this.createSuccessResponse({
        message: isNew ? 'Conversation created and call scheduled successfully' : 'Conversation found and call scheduled successfully',
        conversationId: conversation.id,
        isNew,
        scheduledCall: scheduledCall ? {
          id: scheduledCall.id,
          title: scheduledCall.title,
          scheduledDate: scheduledCall.scheduledDate,
          duration: scheduledCall.duration
        } : null
      });
      
    } catch (error) {
      console.error('❌ [MCP] Error creating conversation:', error);
      return this.createErrorResponse(error instanceof Error ? error : new Error(`Error creating conversation: ${error.message || error}`));
    }
  }
}

module.exports = CreateConversationWithCandidateTool;


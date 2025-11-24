const BaseTool = require('../baseTool');
const { createMessage } = require('../../../helpers/chatHelpers');
const { prisma } = require('../../../db.js');

/**
 * Send Message To Candidate Tool
 * Sends a message from the AI assistant (on behalf of the restaurant) to a specific candidate within an existing conversation
 */
class SendMessageToCandidateTool extends BaseTool {
  constructor() {
    super(
      'send_message_to_candidate',
      'Sends a message from the AI assistant (on behalf of the restaurant) to a specific candidate within an existing conversation. Creates conversation if it does not exist.',
      {
        type: 'object',
        properties: {
          conversationId: {
            type: 'number',
            description: 'The conversation ID. If not provided, will create a new conversation.'
          },
          restaurantUserId: {
            type: 'number',
            description: 'The restaurant user ID who is sending the message'
          },
          employeeId: {
            type: 'number',
            description: 'The candidate/employee ID to send message to'
          },
          message: {
            type: 'string',
            description: 'The message text to send to the candidate'
          },
          jobId: {
            type: 'number',
            description: 'Optional: The job ID this message is related to (used if creating new conversation)'
          }
        },
        required: ['restaurantUserId', 'employeeId', 'message']
      }
    );
  }

  async handle(args, { prisma: contextPrisma }) {
    const { conversationId, restaurantUserId, employeeId, message, jobId } = args;
    
    try {
      console.log(`📤 [MCP] Sending message: conversationId=${conversationId || 'new'}, restaurantUserId=${restaurantUserId}, employeeId=${employeeId}`);

      let finalConversationId = conversationId;

      // If no conversationId, create or find conversation
      if (!finalConversationId) {
        const { createConversation } = require('../../../helpers/chatHelpers');
        
        // Check if conversation exists
        const existingConversation = await prisma.conversation.findFirst({
          where: {
            restaurantUserId: parseInt(restaurantUserId),
            employeeId: parseInt(employeeId),
            ...(jobId && { jobOfferId: parseInt(jobId) })
          }
        });

        if (existingConversation) {
          finalConversationId = existingConversation.id;
          console.log(`✅ [MCP] Found existing conversation: ${finalConversationId}`);
        } else {
          // Create new conversation
          const newConversation = await createConversation({
            restaurantUserId: parseInt(restaurantUserId),
            employeeId: parseInt(employeeId),
            jobOfferId: jobId ? parseInt(jobId) : null
          });
          finalConversationId = newConversation.id;
          console.log(`✅ [MCP] Created new conversation: ${finalConversationId}`);
        }
      }

      // Get employee to find their user ID
      const employee = await prisma.employee.findUnique({
        where: { id: parseInt(employeeId) },
        include: { user: true }
      });

      if (!employee) {
        throw new Error(`Employee with ID ${employeeId} not found`);
      }

      // Send the message
      const sentMessage = await createMessage({
        text: message,
        conversationId: parseInt(finalConversationId),
        senderUserId: parseInt(restaurantUserId),
        receiverUserId: employee.userId,
        senderType: 'restaurant',
        receiverType: 'employee'
      });

      console.log(`✅ [MCP] Message sent successfully: messageId=${sentMessage.id}`);

      return this.createSuccessResponse({
        message: 'Message sent successfully',
        messageId: sentMessage.id,
        conversationId: finalConversationId
      });
      
    } catch (error) {
      console.error('❌ [MCP] Error sending message:', error);
      return this.createErrorResponse(error instanceof Error ? error : new Error(`Error sending message: ${error.message || error}`));
    }
  }
}

module.exports = SendMessageToCandidateTool;


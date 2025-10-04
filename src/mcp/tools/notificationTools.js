const { sendMessageNotification } = require('../../services/notificationService.js');

/**
 * Notification-related MCP tools
 */

const tools = [
  {
    name: 'send_notification',
    description: 'Send a notification to a user',
    inputSchema: {
      type: 'object',
      properties: {
        recipientEmail: { type: 'string', description: 'Recipient email address' },
        recipientName: { type: 'string', description: 'Recipient name' },
        subject: { type: 'string', description: 'Notification subject' },
        message: { type: 'string', description: 'Notification message' },
        type: { type: 'string', description: 'Notification type' }
      },
      required: ['recipientEmail', 'recipientName', 'subject', 'message']
    }
  }
];

/**
 * Send notification handler
 */
async function sendNotificationHandler(args, { prisma }) {
  try {
    await sendMessageNotification({
      senderName: 'Agente de IA',
      senderEmail: 'noreply@gourmetjobs.cl',
      recipientName: args.recipientName,
      recipientEmail: args.recipientEmail,
      messagePreview: args.message,
      restaurantName: 'Gourmet Jobs',
      conversationId: null
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            message: 'Notification sent successfully'
          }, null, 2)
        }
      ]
    };
  } catch (error) {
    console.error('❌ [MCP] Error sending notification:', error);
    throw error;
  }
}

const handlers = {
  send_notification: sendNotificationHandler
};

module.exports = {
  getTools: () => tools,
  getHandlers: () => handlers
};

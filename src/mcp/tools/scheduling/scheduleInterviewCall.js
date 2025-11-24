const BaseTool = require('../baseTool');
const { sendMessageNotification } = require('../../../services/notificationService.js');
const { prisma } = require('../../../db.js');

/**
 * Schedule Interview Call Tool
 * Schedules an interview call with a job applicant
 */
class ScheduleInterviewCallTool extends BaseTool {
  constructor() {
    super(
      'schedule_interview_call',
      'Schedule an interview call with a job applicant',
      {
        type: 'object',
        properties: {
          restaurantId: { type: 'number', description: 'Restaurant ID' },
          employeeId: { type: 'number', description: 'Employee/candidate ID' },
          title: { type: 'string', description: 'Call title' },
          description: { type: 'string', description: 'Call description' },
          scheduledDate: { type: 'string', format: 'date-time', description: 'Scheduled date and time' },
          duration: { type: 'number', description: 'Call duration in minutes', default: 30 },
          meetingLink: { type: 'string', description: 'Meeting link (optional)' },
          notes: { type: 'string', description: 'Additional notes' }
        },
        required: ['restaurantId', 'employeeId', 'title', 'scheduledDate']
      }
    );
  }

  async handle(args, { prisma: contextPrisma }) {
    try {
      console.log('🤖 [MCP] Scheduling interview call with data:', args);
      
      const scheduledCall = await contextPrisma.scheduledCall.create({
        data: {
          agentId: 1, // Default AI agent ID
          restaurantId: args.restaurantId,
          employeeId: args.employeeId,
          title: args.title,
          description: args.description,
          scheduledDate: new Date(args.scheduledDate),
          duration: args.duration || 30,
          meetingLink: args.meetingLink,
          notes: args.notes,
          status: 'scheduled'
        },
        include: {
          employee: {
            include: { user: true }
          },
          restaurant: true
        }
      });

      // Send notification
      if (scheduledCall.employee?.user) {
        await sendMessageNotification({
          senderName: 'Agente de IA',
          senderEmail: 'noreply@gourmetjobs.cl',
          recipientName: scheduledCall.employee.user.name,
          recipientEmail: scheduledCall.employee.user.email,
          messagePreview: `Llamada programada para ${scheduledCall.scheduledDate.toLocaleDateString()}`,
          restaurantName: scheduledCall.restaurant.name,
          conversationId: scheduledCall.id
        });
      }

      return this.createSuccessResponse({
        message: 'Interview call scheduled successfully',
        scheduledCall: {
          id: scheduledCall.id,
          title: scheduledCall.title,
          scheduledDate: scheduledCall.scheduledDate,
          duration: scheduledCall.duration,
          status: scheduledCall.status
        }
      });
    } catch (error) {
      console.error('❌ [MCP] Error scheduling interview call:', error);
      return this.createErrorResponse(error);
    }
  }
}

module.exports = ScheduleInterviewCallTool;


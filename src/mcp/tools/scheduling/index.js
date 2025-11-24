/**
 * Scheduling Tools Registry
 * Central registry for all scheduling-related MCP tools
 */

const ScheduleInterviewCallTool = require('./scheduleInterviewCall');

// Create tool instances
const scheduleInterviewCallTool = new ScheduleInterviewCallTool();

// Export tools and handlers
const tools = [
  scheduleInterviewCallTool.getDefinition()
];

const handlers = {
  schedule_interview_call: (args, context) => scheduleInterviewCallTool.execute(args, context)
};

module.exports = {
  getTools: () => tools,
  getHandlers: () => handlers
};


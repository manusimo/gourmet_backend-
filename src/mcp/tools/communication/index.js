/**
 * Communication Tools Registry
 * Central registry for all communication-related MCP tools (conversations, messages)
 */

const CreateConversationWithCandidateTool = require('./createConversationWithCandidate');
const SendMessageToCandidateTool = require('./sendMessageToCandidate');

// Create tool instances
const createConversationTool = new CreateConversationWithCandidateTool();
const sendMessageTool = new SendMessageToCandidateTool();

// Export tools and handlers
const tools = [
  createConversationTool.getDefinition(),
  sendMessageTool.getDefinition()
];

const handlers = {
  create_conversation_with_candidate: (args, context) => createConversationTool.execute(args, context),
  send_message_to_candidate: (args, context) => sendMessageTool.execute(args, context)
};

module.exports = {
  getTools: () => tools,
  getHandlers: () => handlers
};


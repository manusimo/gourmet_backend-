/**
 * Job Tools Registry
 * Central registry for all job-related MCP tools
 */

const ProcessJobCreationTool = require('./processJobCreation');
const CreateJobOfferTool = require('./createJobOffer');

// Create tool instances
const processJobCreationTool = new ProcessJobCreationTool();
const createJobOfferTool = new CreateJobOfferTool();

// Export tools and handlers
const tools = [
  processJobCreationTool.getDefinition(),
  createJobOfferTool.getDefinition()
];

const handlers = {
  process_job_creation: (args, context) => processJobCreationTool.execute(args, context),
  create_job_offer: (args, context) => createJobOfferTool.execute(args, context)
};

module.exports = {
  getTools: () => tools,
  getHandlers: () => handlers
};

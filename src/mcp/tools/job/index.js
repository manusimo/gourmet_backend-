/**
 * Job Tools Registry
 * Central registry for all job-related MCP tools
 */

const CreateJobOfferTool = require('./createJobOffer');
const ProcessJobCreationTool = require('./processJobCreation');

// Create tool instances
const createJobOfferTool = new CreateJobOfferTool();
const processJobCreationTool = new ProcessJobCreationTool();

// Export tools and handlers
const tools = [
  createJobOfferTool.getDefinition(),
  processJobCreationTool.getDefinition()
];

const handlers = {
  create_job_offer: (args, context) => createJobOfferTool.execute(args, context),
  process_job_creation: (args, context) => processJobCreationTool.execute(args, context)
};

module.exports = {
  getTools: () => tools,
  getHandlers: () => handlers
};

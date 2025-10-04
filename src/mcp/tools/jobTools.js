const { createJobOffer } = require('../../helpers/jobHelpers.js');
const BaseTool = require('./baseTool');

/**
 * Create Job Offer Tool
 */
class CreateJobOfferTool extends BaseTool {
  constructor() {
    super(
      'create_job_offer',
      'Create a new job offer from structured data',
      {
        type: 'object',
        properties: {
          position: { type: 'string', description: 'Job position title' },
          locationId: { type: 'number', description: 'Location ID where the job is located' },
          schedule: { type: 'string', description: 'Work schedule (Full-time, Part-time, Otro)' },
          contract: { type: 'string', description: 'Contract type (A Plazo, Indefinido, Honorarios, Práctica, Otros)' },
          salary: { type: 'number', description: 'Salary amount' },
          propina: { type: 'string', description: 'Includes tips (Si/No)' },
          vacancies: { type: 'number', description: 'Number of available positions' },
          yearsOfExperience: { type: 'number', description: 'Required years of experience' },
          period: { type: 'string', description: 'Job period (Permanente, Reemplazo Temporal, Reemplazo Urgente, Sin información)' },
          description: { type: 'string', description: 'Job description' },
          requirements: { type: 'string', description: 'Job requirements' },
          functions: { type: 'string', description: 'Main job functions' },
          questions: { type: 'array', items: { type: 'string' }, description: 'Interview questions' },
          restaurantId: { type: 'number', description: 'Restaurant ID' },
          restaurantUserId: { type: 'number', description: 'Restaurant user ID who created the job' }
        },
        required: ['position', 'locationId', 'restaurantId', 'restaurantUserId']
      }
    );
  }

  async handle(args, { prisma }) {
    console.log('🤖 [MCP] Creating job offer with data:', args);
    
    const jobOffer = await createJobOffer(args);
    
    return this.createSuccessResponse({
      message: 'Job offer created successfully',
      jobOffer: {
        id: jobOffer.id,
        position: jobOffer.position,
        restaurantId: jobOffer.restaurantId,
        createdAt: jobOffer.createdAt
      }
    });
  }
}

// Create tool instances
const createJobOfferTool = new CreateJobOfferTool();

const tools = [
  createJobOfferTool.getDefinition()
];

const handlers = {
  create_job_offer: (args, context) => createJobOfferTool.execute(args, context)
};

module.exports = {
  getTools: () => tools,
  getHandlers: () => handlers
};

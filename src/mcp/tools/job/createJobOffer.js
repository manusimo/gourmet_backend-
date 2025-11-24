const BaseTool = require('../baseTool');
const { createJobOffer } = require('../../../helpers/jobHelpers.js');
const JobDataCleaner = require('./helpers/dataCleaner');
const { prisma } = require('../../../db.js');

/**
 * Create Job Offer Tool
 * Creates a job offer from extracted data
 * This is called by the LLM when it has all the job information
 */
class CreateJobOfferTool extends BaseTool {
  constructor() {
    super(
      'create_job_offer',
      'Create a job offer from structured data. Use this when the user has provided all necessary job information (position, schedule, contract, salary, etc.) and wants to publish the job.',
      {
        type: 'object',
        properties: {
          extractedData: {
            type: 'object',
            description: 'Structured job data including position, schedule, contract, salary, etc.',
            properties: {
              position: { type: 'string', description: 'Job position title' },
              schedule: { type: 'string', description: 'Work schedule (Full-time, Part-time, Otro)' },
              contract: { type: 'string', description: 'Contract type (A Plazo, Indefinido, Honorarios, Práctica, Otros)' },
              salary: { type: 'number', description: 'Salary amount' },
              tips: { type: 'boolean', description: 'Whether tips are included' },
              vacancies: { type: 'number', description: 'Number of vacancies' },
              yearsOfExperience: { type: 'number', description: 'Required years of experience' },
              period: { type: 'string', description: 'Job period (Permanente, Reemplazo Temporal, etc.)' },
              description: { type: 'string', description: 'Job description' },
              requirements: { type: 'string', description: 'Job requirements' },
              functions: { type: 'string', description: 'Job functions' },
              questions: { 
                type: 'array', 
                items: { type: 'string' },
                description: 'Interview questions for candidates'
              },
              locationId: { type: 'number', description: 'Location ID for the job' }
            },
            required: ['position', 'schedule', 'contract', 'salary']
          },
          restaurantContext: {
            type: 'object',
            description: 'Restaurant context information',
            properties: {
              id: { type: 'number' },
              name: { type: 'string' },
              userId: { type: 'number' },
              locationId: { type: 'number' }
            },
            required: ['id']
          }
        },
        required: ['extractedData', 'restaurantContext']
      }
    );
  }

  async handle(args, { prisma: contextPrisma }) {
    try {
      const { extractedData, restaurantContext } = args;

      // Validate locationId
      const locationId = extractedData.locationId || restaurantContext.locationId;
      
      if (!locationId || locationId === 1) {
        return this.createErrorResponse(
          'Location ID is required. Please specify a valid location before creating the job.'
        );
      }

      // Prepare job data
      const jobData = JobDataCleaner.prepareJobData(extractedData, restaurantContext);
      
      // Create the job offer
      const jobOffer = await createJobOffer(jobData);
      
      console.log(`✅ [MCP] Job offer created successfully: ID ${jobOffer.id}, Position: ${jobOffer.position}`);

      return this.createSuccessResponse({
        message: `¡Perfecto! He creado la oferta de trabajo para ${jobOffer.position}. La oferta ha sido publicada exitosamente.`,
        jobId: jobOffer.id,
        jobOffer: {
          id: jobOffer.id,
          position: jobOffer.position,
          schedule: jobOffer.schedule,
          contract: jobOffer.contract,
          salary: jobOffer.salary,
          createdAt: jobOffer.createdAt.toISOString()
        },
        status: 'created'
      });
    } catch (error) {
      console.error('❌ [MCP] Error creating job offer:', error);
      return this.createErrorResponse(error);
    }
  }
}

module.exports = CreateJobOfferTool;


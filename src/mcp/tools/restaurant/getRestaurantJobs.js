const BaseTool = require('../baseTool');
const { prisma } = require('../../../db.js');

/**
 * Get Restaurant Jobs Tool
 * Retrieves jobs posted by a restaurant with optional filters
 * Supports restaurant selection by ID or name
 */
class GetRestaurantJobsTool extends BaseTool {
  constructor() {
    super(
      'get_restaurant_jobs',
      'Get jobs posted by a restaurant, with optional filters, sorting, and pagination. Can filter by restaurant ID or restaurant name. Useful for queries like "show me my last 5 jobs" or "jobs from Restaurant X".',
      {
        type: 'object',
        properties: {
          restaurantId: { 
            type: 'number', 
            description: 'Restaurant ID to get jobs for (optional if restaurantName provided)' 
          },
          restaurantName: {
            type: 'string',
            description: 'Restaurant name to get jobs for (optional if restaurantId provided). Will search for restaurant by name.'
          },
          limit: { 
            type: 'number', 
            description: 'Maximum number of jobs to return (default: 10)', 
            default: 10 
          },
          orderBy: { 
            type: 'string', 
            enum: ['createdAt', 'applications', 'position'],
            description: 'Sort by: createdAt (newest first), applications (most applications), or position (alphabetical)', 
            default: 'createdAt' 
          },
          position: { 
            type: 'string', 
            description: 'Filter by position name (optional)' 
          },
          startDate: {
            type: 'string',
            format: 'date-time',
            description: 'Filter jobs created after this date (optional)'
          },
          endDate: {
            type: 'string',
            format: 'date-time',
            description: 'Filter jobs created before this date (optional)'
          }
        },
        required: []
      }
    );
  }

  async handle(args, { prisma: contextPrisma, restaurantContext }) {
    try {
      const { 
        restaurantId,
        restaurantName,
        limit = 10, 
        orderBy = 'createdAt',
        position,
        startDate,
        endDate
      } = args;

      let targetRestaurantId = restaurantId;

      // If restaurantName provided, look it up
      if (restaurantName && !restaurantId) {
        const restaurant = await contextPrisma.restaurant.findFirst({
          where: {
            name: { contains: restaurantName, mode: 'insensitive' },
            deletedAt: null
          },
          select: { id: true, name: true }
        });

        if (!restaurant) {
          return this.createErrorResponse(
            `Restaurant "${restaurantName}" not found. Please provide a valid restaurant name or ID.`
          );
        }

        targetRestaurantId = restaurant.id;
        console.log(`🔍 [MCP] Found restaurant "${restaurantName}" with ID: ${targetRestaurantId}`);
      }

      // If still no restaurantId, use restaurantContext if available
      if (!targetRestaurantId && restaurantContext) {
        targetRestaurantId = restaurantContext.id;
        console.log(`🔍 [MCP] Using restaurant from context: ${targetRestaurantId}`);
      }

      // Validate we have a restaurant ID
      if (!targetRestaurantId) {
        return this.createErrorResponse(
          'Restaurant ID or name is required. Please specify which restaurant you want to query.'
        );
      }

      // Build where clause
      const where = {
        restaurantId: parseInt(targetRestaurantId),
        deletedAt: null
      };

      if (position) {
        where.position = { contains: position, mode: 'insensitive' };
      }

      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) {
          where.createdAt.gte = new Date(startDate);
        }
        if (endDate) {
          where.createdAt.lte = new Date(endDate);
        }
      }

      // Build orderBy
      let orderByClause = {};
      if (orderBy === 'createdAt') {
        orderByClause = { createdAt: 'desc' };
      } else if (orderBy === 'applications') {
        orderByClause = { applications: { _count: 'desc' } };
      } else if (orderBy === 'position') {
        orderByClause = { position: 'asc' };
      }

      // Fetch jobs
      const jobs = await contextPrisma.jobOffer.findMany({
        where,
        include: {
          location: {
            select: {
              id: true,
              address: true
            }
          },
          restaurant: {
            select: {
              id: true,
              name: true
            }
          },
          _count: {
            select: {
              applications: true
            }
          }
        },
        orderBy: orderByClause,
        take: parseInt(limit)
      });

      // Format response
      const formattedJobs = jobs.map(job => ({
        id: job.id,
        position: job.position,
        schedule: job.schedule,
        contract: job.contract,
        salary: job.salary,
        createdAt: job.createdAt,
        applicationsCount: job._count.applications,
        location: job.location ? {
          id: job.location.id,
          address: job.location.address
        } : null,
        restaurant: {
          id: job.restaurant.id,
          name: job.restaurant.name
        }
      }));

      return this.createSuccessResponse({
        message: `Found ${formattedJobs.length} job(s) for restaurant "${jobs[0]?.restaurant?.name || 'Unknown'}"`,
        jobs: formattedJobs,
        count: formattedJobs.length,
        restaurantId: parseInt(targetRestaurantId),
        restaurantName: jobs[0]?.restaurant?.name || null
      });
    } catch (error) {
      console.error('❌ [MCP] Error getting restaurant jobs:', error);
      return this.createErrorResponse(error);
    }
  }
}

module.exports = GetRestaurantJobsTool;


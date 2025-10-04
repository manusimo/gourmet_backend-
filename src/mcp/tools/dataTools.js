/**
 * Data retrieval MCP tools
 */

const tools = [
  {
    name: 'get_job_applications',
    description: 'Get applications for a specific job post',
    inputSchema: {
      type: 'object',
      properties: {
        jobPostId: { type: 'number', description: 'Job post ID' }
      },
      required: ['jobPostId']
    }
  },
  {
    name: 'get_restaurant_info',
    description: 'Get restaurant information by ID',
    inputSchema: {
      type: 'object',
      properties: {
        restaurantId: { type: 'number', description: 'Restaurant ID' }
      },
      required: ['restaurantId']
    }
  },
  {
    name: 'get_employee_info',
    description: 'Get employee information by ID',
    inputSchema: {
      type: 'object',
      properties: {
        employeeId: { type: 'number', description: 'Employee ID' }
      },
      required: ['employeeId']
    }
  }
];

/**
 * Get job applications handler
 */
async function getJobApplicationsHandler(args, { prisma }) {
  try {
    const applications = await prisma.application.findMany({
      where: { jobPostId: args.jobPostId },
      include: {
        employee: {
          include: { user: true }
        },
        jobPost: true
      }
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            applications: applications.map(app => ({
              id: app.id,
              employeeName: app.employee.user.name,
              employeeEmail: app.employee.user.email,
              appliedAt: app.appliedAt,
              status: app.status
            }))
          }, null, 2)
        }
      ]
    };
  } catch (error) {
    console.error('❌ [MCP] Error getting job applications:', error);
    throw error;
  }
}

/**
 * Get restaurant info handler
 */
async function getRestaurantInfoHandler(args, { prisma }) {
  try {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: args.restaurantId },
      include: {
        user: true,
        locations: true
      }
    });

    if (!restaurant) {
      throw new Error('Restaurant not found');
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            restaurant: {
              id: restaurant.id,
              name: restaurant.name,
              email: restaurant.user.email,
              phone: restaurant.phone,
              locations: restaurant.locations
            }
          }, null, 2)
        }
      ]
    };
  } catch (error) {
    console.error('❌ [MCP] Error getting restaurant info:', error);
    throw error;
  }
}

/**
 * Get employee info handler
 */
async function getEmployeeInfoHandler(args, { prisma }) {
  try {
    const employee = await prisma.employee.findUnique({
      where: { id: args.employeeId },
      include: { user: true }
    });

    if (!employee) {
      throw new Error('Employee not found');
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            employee: {
              id: employee.id,
              name: employee.user.name,
              email: employee.user.email,
              phone: employee.phone,
              experience: employee.experience
            }
          }, null, 2)
        }
      ]
    };
  } catch (error) {
    console.error('❌ [MCP] Error getting employee info:', error);
    throw error;
  }
}

const handlers = {
  get_job_applications: getJobApplicationsHandler,
  get_restaurant_info: getRestaurantInfoHandler,
  get_employee_info: getEmployeeInfoHandler
};

module.exports = {
  getTools: () => tools,
  getHandlers: () => handlers
};

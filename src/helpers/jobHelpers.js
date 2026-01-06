const { prisma } = require("../db.js");

/**
 * Get or create the special "Todas las sucursales" location for a restaurant
 * @param {number} restaurantId - Restaurant ID
 * @returns {Object} Location object
 */
const getOrCreateAllBranchesLocation = async (restaurantId) => {
  const specialAddress = "Todas las sucursales";
  
  // Try to find existing "Todas las sucursales" location
  let location = await prisma.location.findFirst({
    where: {
      restaurantId: restaurantId,
      address: specialAddress
    }
  });

  // If it doesn't exist, create it
  if (!location) {
    location = await prisma.location.create({
      data: {
        address: specialAddress,
        latitude: 0,
        longitude: 0,
        restaurantId: restaurantId
      }
    });
  }

  return location;
};

/**
 * Parse numeric fields from job offer data
 * @param {string|number} vacancies - Vacancies count
 * @param {string|number} yearsOfExperience - Years of experience
 * @param {string|number} salary - Salary amount
 * @returns {Object} Parsed numeric fields
 */
const parseJobOfferNumericFields = (vacancies, yearsOfExperience, salary) => {
  const parsedVacancies = parseInt(vacancies, 10);
  const parsedYearsOfExperience = parseInt(yearsOfExperience, 10);
  const parsedSalary = parseInt(salary, 10);

  return {
    vacancies: isNaN(parsedVacancies) ? null : parsedVacancies,
    yearsOfExperience: isNaN(parsedYearsOfExperience) ? null : parsedYearsOfExperience,
    salary: isNaN(parsedSalary) ? null : parsedSalary
  };
};

/**
 * Convert propina string to boolean
 * @param {string} propina - Propina value ('Si' or other)
 * @returns {boolean} Tips enabled
 */
const convertPropinaToBoolean = (propina) => {
  return propina === 'Si';
};

/**
 * Resolve location ID for job offer
 * Handles special cases:
 * - -1: "todas las sucursales" (all branches) - get or create special location
 * - null: "no especificado" (not specified) - return null
 * - positive integer: specific location - return as is
 * @param {number|null} locationId - Location ID
 * @param {number} restaurantId - Restaurant ID
 * @returns {Promise<number|null>} Resolved location ID
 */
const resolveJobOfferLocationId = async (locationId, restaurantId) => {
  if (locationId === -1) {
    const allBranchesLocation = await getOrCreateAllBranchesLocation(restaurantId);
    return allBranchesLocation.id;
  }
  
  return locationId && locationId > 0 ? locationId : null;
};

/**
 * Build job offer data object for Prisma
 * @param {Object} params - Job offer parameters
 * @param {string} params.position - Job position
 * @param {string} params.schedule - Work schedule
 * @param {string} params.contract - Contract type
 * @param {string} params.description - Job description
 * @param {Array} params.questions - Job questions
 * @param {string} params.requirements - Job requirements
 * @param {string} params.functions - Job functions
 * @param {boolean} params.tips - Tips enabled
 * @param {number} params.restaurantId - Restaurant ID
 * @param {number|null} params.locationId - Resolved location ID
 * @param {number|null} params.restaurantUserId - Restaurant user ID (optional)
 * @param {Date|string|null} params.startDate - Start date
 * @param {Date|string|null} params.endDate - End date
 * @param {number|null} params.vacancies - Vacancies count
 * @param {number|null} params.yearsOfExperience - Years of experience
 * @param {number|null} params.salary - Salary amount
 * @returns {Object} Prisma data object
 */
const buildJobOfferData = ({
  position,
  schedule,
  contract,
  description,
  questions,
  requirements,
  functions,
  tips,
  restaurantId,
  locationId,
  restaurantUserId,
  startDate,
  endDate,
  vacancies,
  yearsOfExperience,
  salary
}) => {
  const data = {
    position,
    schedule,
    contract,
    description,
    restaurant: { connect: { id: parseInt(restaurantId, 10) } },
    requirements,
    functions,
    tips,
    questions: { create: questions },
    yearsOfExperience
  };

  // Handle dates - convert string to Date if provided
  if (startDate) {
    data.startDate = startDate instanceof Date ? startDate : new Date(startDate);
  }
  if (endDate) {
    data.endDate = endDate instanceof Date ? endDate : new Date(endDate);
  }

  // Connect location if locationId is provided
  if (locationId) {
    data.location = { connect: { id: locationId } };
  }

  // Connect restaurantUser if restaurantUserId is provided (for staff members)
  // Restaurant owners don't have restaurantUserId
  if (restaurantUserId) {
    data.restaurantUser = { connect: { id: restaurantUserId } };
  }

  // Add optional numeric fields only if they have valid values
  if (vacancies !== null) {
    data.vacancies = vacancies;
  }
  if (salary !== null) {
    data.salary = salary;
  }

  return data;
};

/**
 * Create job offer
 * @param {Object} jobData - Job offer data
 * @returns {Object} Created job offer
 */
const createJobOffer = async (jobData) => {
  const {
    position,
    locationId,
    schedule,
    contract,
    vacancies,
    yearsOfExperience,
    description,
    questions,
    requirements,
    salary,
    propina,
    functions,
    restaurantId,
    restaurantUserId,
    startDate,
    endDate
  } = jobData;

  // Parse and convert data
  const numericFields = parseJobOfferNumericFields(vacancies, yearsOfExperience, salary);
  const tips = convertPropinaToBoolean(propina);
  const resolvedLocationId = await resolveJobOfferLocationId(locationId, parseInt(restaurantId, 10));

  // Build Prisma data object
  const data = buildJobOfferData({
    position,
    schedule,
    contract,
    description,
    questions,
    requirements,
    functions,
    tips,
    restaurantId,
    locationId: resolvedLocationId,
    restaurantUserId,
    startDate,
    endDate,
    ...numericFields
  });

  return await prisma.jobOffer.create({ data });
};

/**
 * Get job offer with location
 * @param {number} jobId - Job offer ID
 * @returns {Object|null} Job offer with location or null
 */
const getJobOfferWithLocation = async (jobId) => {
  return await prisma.jobOffer.findUnique({
    where: { id: jobId },
    include: { location: true },
  });
};

/**
 * Get plan names mapping
 * @returns {Object} Plan names mapping
 */
const getPlanNames = () => {
  return {
    'starter': 'STARTER',
    'pro': 'PRO',
    'plus': 'PLUS',
    'premium': 'PREMIUM'
  };
};

/**
 * Generate plan info for job creation
 * @param {Object} planData - Plan data
 * @returns {Object} Plan info object
 */
const generateJobPlanInfo = (planData) => {
  const { paymentStatus, remainingJobOffers, jobOfferLimit } = planData;
  const planNames = getPlanNames();
  const currentPlan = planNames[paymentStatus] || 'STARTER';
  
  let upgradeMessage;
  if (remainingJobOffers === 0) {
    let nextPlan;
    if (paymentStatus === 'starter') {
      nextPlan = 'PRO';
    } else if (paymentStatus === 'pro') {
      nextPlan = 'PLUS';
    } else {
      nextPlan = 'PREMIUM';
    }
    upgradeMessage = `Has usado todas tus ofertas de trabajo. Actualiza a ${nextPlan} para más.`;
  } else {
    upgradeMessage = `Te quedan ${remainingJobOffers} ofertas de trabajo de tu plan ${currentPlan}.`;
  }

  return {
    currentPlan,
    remainingJobOffers,
    totalLimit: jobOfferLimit,
    upgradeMessage
  };
};

/**
 * Get employee by ID
 * @param {number} employeeId - Employee ID
 * @returns {Object|null} Employee or null if not found
 */
const getEmployeeById = async (employeeId) => {
  return await prisma.employee.findUnique({
    where: { id: employeeId },
  });
};

/**
 * Get applications for employee
 * @param {number} employeeId - Employee ID
 * @returns {Array} Array of applications
 */
const getEmployeeApplications = async (employeeId) => {
  return await prisma.application.findMany({
    where: {
      employeeId: employeeId,
      jobPost: { deletedAt: null},
    },
    include: {
      jobPost: {
        include: {
          restaurant: true,
          location: true,
          questions: true,
        },
      },
      answers: {
        include: {
          question: true,
        },
      },
    },
  });
};

/**
 * Get jobs with filters and pagination
 * @param {Object} filters - Filter conditions
 * @param {Object} searchConditions - Search conditions
 * @param {Object} orderByCriteria - Order by criteria
 * @param {number} limit - Number of items per page
 * @param {number} skip - Number of items to skip
 * @returns {Array} Array of jobs
 */
const getJobsWithFilters = async (filters, searchConditions, orderByCriteria, limit, skip) => {
  return await prisma.jobOffer.findMany({
    where: {
      restaurant: {
        ...filters,
      },
      ...searchConditions,
      deletedAt: null,
    },
    include: {
      restaurant: true,
      location: true,
      questions: true,
    },
    orderBy: orderByCriteria,
    skip,
    take: limit,
  });
};

/**
 * Count total jobs with filters
 * @param {Object} filters - Filter conditions
 * @param {Object} searchConditions - Search conditions
 * @returns {number} Total count
 */
const getTotalJobsCount = async (filters, searchConditions) => {
  return await prisma.jobOffer.count({
    where: {
      ...searchConditions,
      restaurant: {
        ...filters,
      },
      deletedAt: null,
    },
  });
};

/**
 * Get restaurant job offers
 * @param {number} restaurantId - Restaurant ID
 * @returns {Array} Array of job offers
 */
const getRestaurantJobOffers = async (restaurantId) => {
  return await prisma.jobOffer.findMany({
    where: {
      restaurantId: restaurantId,
      deletedAt: null,
    },
    include: {
      restaurant: true,
      questions: true,
      location: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
};

/**
 * Get job offer by ID with details
 * @param {number} jobId - Job offer ID
 * @returns {Object|null} Job offer with details or null
 */
const getJobOfferById = async (jobId) => {
  return await prisma.jobOffer.findFirst({
    where: {
      id: parseInt(jobId),
      deletedAt: null,
    },
    include: {
      questions: true,
      restaurant: true,
      applications: true,
      location: true,
    },
  });
};

/**
 * Get restaurant user with details
 * @param {number} restaurantUserId - Restaurant user ID
 * @returns {Object|null} Restaurant user with details or null
 */
const getRestaurantUserWithDetails = async (restaurantUserId) => {
  return await prisma.restaurantUser.findUnique({
    where: { id: restaurantUserId },
    include: {
      user: true,
      jobOffers: {
        where: { deletedAt: null },
        include: {
          applications: {
            where: { deletedAt: null }
          },
          location: true
        }
      }
    }
  });
};

/**
 * Get plan limits mapping
 * @returns {Object} Plan limits mapping
 */
const getPlanLimits = () => {
  return {
    'starter': 1,
    'pro': 5,
    'plus': 10,
    'premium': Infinity
  };
};

/**
 * Get location limits mapping
 * @returns {Object} Location limits mapping
 */
const getLocationLimits = () => {
  return {
    'starter': 1,
    'pro': 5,
    'plus': 10,
    'premium': Infinity
  };
};

/**
 * Calculate payment status and expiration
 * @param {Object} user - User object
 * @returns {Object} Payment status info
 */
const calculatePaymentStatus = (user) => {
  let paymentStatus = 'active';
  let daysUntilExpiration = null;

  if (user.payment_status !== 'starter' && user.last_payment) {
    const lastPayment = new Date(user.last_payment);
    const now = new Date();
    const thirtyDaysFromPayment = new Date(lastPayment.getTime() + (30 * 24 * 60 * 60 * 1000));
    
    if (now > thirtyDaysFromPayment) {
      paymentStatus = 'expired';
    } else {
      daysUntilExpiration = Math.ceil((thirtyDaysFromPayment - now) / (24 * 60 * 60 * 1000));
    }
  }

  return { paymentStatus, daysUntilExpiration };
};

/**
 * Calculate total applications for job offers
 * @param {Array} jobOffers - Array of job offers
 * @returns {number} Total applications count
 */
const calculateTotalApplications = (jobOffers) => {
  return jobOffers.reduce((total, jobOffer) => {
    return total + jobOffer.applications.length;
  }, 0);
};

/**
 * Get restaurant with locations
 * @param {number} restaurantId - Restaurant ID
 * @returns {Object|null} Restaurant with locations or null
 */
const getRestaurantWithLocations = async (restaurantId) => {
  return await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    include: {
      locations: true
    }
  });
};

/**
 * Format job offers for plan info response
 * @param {Array} jobOffers - Array of job offers
 * @returns {Array} Formatted job offers
 */
const formatJobOffersForPlanInfo = (jobOffers) => {
  return jobOffers.map(jobOffer => ({
    id: jobOffer.id,
    position: jobOffer.position,
    applicationsCount: jobOffer.applications.length,
    createdAt: jobOffer.createdAt,
    location: jobOffer.location
  }));
};

/**
 * Generate complete plan info
 * @param {Object} planData - Plan data
 * @returns {Object} Complete plan info
 */
const generateCompletePlanInfo = (planData) => {
  const {
    user,
    restaurantUser,
    restaurant,
    currentJobOffers,
    currentLocations
  } = planData;

  const planLimits = getPlanLimits();
  const locationLimits = getLocationLimits();
  const planNames = getPlanNames();

  const limit = planLimits[user.payment_status] || 1;
  const locationLimit = locationLimits[user.payment_status] || 1;
  
  const remainingJobOffers = limit - currentJobOffers;
  const remainingLocations = locationLimit - currentLocations;

  const { paymentStatus, daysUntilExpiration } = calculatePaymentStatus(user);
  const totalApplications = calculateTotalApplications(restaurantUser.jobOffers);
  const formattedJobOffers = formatJobOffersForPlanInfo(restaurantUser.jobOffers);

  return {
    planInfo: {
      currentPlan: planNames[user.payment_status] || 'STARTER',
      paymentStatus,
      daysUntilExpiration,
      lastPayment: user.last_payment,
      currentJobOffers,
      remainingJobOffers,
      totalLimit: limit,
      totalApplications,
      currentLocations,
      remainingLocations,
      locationLimit,
      jobOffers: formattedJobOffers
    }
  };
}; 

/**
 * Get all restaurant IDs a user has access to (staff access + owned)
 * @param {number} userId - User ID
 * @returns {Promise<Array<number>>} Array of restaurant IDs
 */
const getUserRestaurantIds = async (userId) => {
  // Get restaurants from RestaurantUser table (staff access)
  const userRestaurants = await prisma.restaurantUser.findMany({
    where: { userId: parseInt(userId) },
    select: { restaurantId: true }
  });
  
  // Get restaurants where the user is the direct owner
  const ownedRestaurants = await prisma.restaurant.findMany({
    where: { userId: parseInt(userId) },
    select: { id: true }
  });
  
  // Combine all restaurant IDs the user has access to
  const allRestaurantIds = [
    ...userRestaurants.map(ur => ur.restaurantId),
    ...ownedRestaurants.map(or => or.id)
  ];
  
  return allRestaurantIds;
};

module.exports = {
  createJobOffer,
  getOrCreateAllBranchesLocation,
  getJobOfferWithLocation,
  getPlanNames,
  generateJobPlanInfo,
  getEmployeeById,
  getEmployeeApplications,
  getJobsWithFilters,
  getTotalJobsCount,
  getRestaurantJobOffers,
  getJobOfferById,
  getRestaurantUserWithDetails,
  getPlanLimits,
  getLocationLimits,
  calculatePaymentStatus,
  calculateTotalApplications,
  getRestaurantWithLocations,
  formatJobOffersForPlanInfo,
  generateCompletePlanInfo,
  getUserRestaurantIds,
}; 
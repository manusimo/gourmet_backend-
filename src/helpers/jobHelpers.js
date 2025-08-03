import { prisma } from "../db.js";

/**
 * Create job offer
 * @param {Object} jobData - Job offer data
 * @returns {Object} Created job offer
 */
export const createJobOffer = async (jobData) => {
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
    restaurantUserId
  } = jobData;

  const tips = propina === 'Si';

  return await prisma.jobOffer.create({
    data: {
      position,
      location: { connect: { id: locationId } },
      schedule,
      contract,
      vacancies: parseInt(vacancies, 10),
      yearsOfExperience: isNaN(parseInt(yearsOfExperience, 10)) ? null : parseInt(yearsOfExperience, 10),
      description,
      restaurant: { connect: { id: restaurantId } },
      requirements,
      functions,
      tips,
      salary: parseInt(salary, 10),
      questions: { create: questions },
      restaurantUser: { connect: { id: restaurantUserId } },
    },
  });
};

/**
 * Get job offer with location
 * @param {number} jobId - Job offer ID
 * @returns {Object|null} Job offer with location or null
 */
export const getJobOfferWithLocation = async (jobId) => {
  return await prisma.jobOffer.findUnique({
    where: { id: jobId },
    include: { location: true },
  });
};

/**
 * Get plan names mapping
 * @returns {Object} Plan names mapping
 */
export const getPlanNames = () => {
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
export const generateJobPlanInfo = (planData) => {
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
export const getEmployeeById = async (employeeId) => {
  return await prisma.employee.findUnique({
    where: { id: employeeId },
  });
};

/**
 * Get applications for employee
 * @param {number} employeeId - Employee ID
 * @returns {Array} Array of applications
 */
export const getEmployeeApplications = async (employeeId) => {
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
export const getJobsWithFilters = async (filters, searchConditions, orderByCriteria, limit, skip) => {
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
export const getTotalJobsCount = async (filters, searchConditions) => {
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
export const getRestaurantJobOffers = async (restaurantId) => {
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
export const getJobOfferById = async (jobId) => {
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
export const getRestaurantUserWithDetails = async (restaurantUserId) => {
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
export const getPlanLimits = () => {
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
export const getLocationLimits = () => {
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
export const calculatePaymentStatus = (user) => {
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
export const calculateTotalApplications = (jobOffers) => {
  return jobOffers.reduce((total, jobOffer) => {
    return total + jobOffer.applications.length;
  }, 0);
};

/**
 * Get restaurant with locations
 * @param {number} restaurantId - Restaurant ID
 * @returns {Object|null} Restaurant with locations or null
 */
export const getRestaurantWithLocations = async (restaurantId) => {
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
export const formatJobOffersForPlanInfo = (jobOffers) => {
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
export const generateCompletePlanInfo = (planData) => {
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
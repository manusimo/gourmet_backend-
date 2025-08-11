const { prisma } = require("../db.js");

/**
 * Validate application input data
 * @param {Object} data - Application data
 * @returns {Object} Validation result
 */
const validateApplicationInput = (data) => {
  if (!data) {
    return {
      isValid: false,
      errors: ['Input data is required']
    };
  }
  const { jobPostId, answers } = data;
  const errors = [];

  if (jobPostId === 0) {
    errors.push('Job post ID must be a positive number');
  } else if (!jobPostId) {
    errors.push('Job post ID is required');
  } else if (typeof jobPostId !== 'number' || isNaN(jobPostId)) {
    errors.push('Job post ID must be a valid number');
  } else if (jobPostId < 0) {
    errors.push('Job post ID must be a positive number');
  } else if (jobPostId > Number.MAX_SAFE_INTEGER) {
    errors.push('Job post ID must be a valid number');
  }

  if (!answers || !Array.isArray(answers)) {
    errors.push('Answers are required and must be an array');
  } else if (answers.length === 0) {
    errors.push('At least one answer is required');
  } else {
    const questionIds = new Set();
    answers.forEach((answer, index) => {
      if (!answer.questionId || typeof answer.questionId !== 'number') {
        errors.push('Each answer must have a valid questionId and answer');
      }
      if (answer.answer === undefined || answer.answer === null) {
        errors.push('Each answer must have a valid questionId and answer');
      }
      if (typeof answer.answer === 'string' && answer.answer.trim() === '') {
        errors.push('Answer cannot be empty');
      }
      if (typeof answer.answer === 'string' && answer.answer.length > 10000) {
        errors.push('Answer is too long (maximum 10,000 characters)');
      }
      if (questionIds.has(answer.questionId)) {
        errors.push('Duplicate question IDs are not allowed');
      }
      questionIds.add(answer.questionId);
    });
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Check if job post exists and is active
 * @param {number} jobPostId - Job post ID
 * @returns {Object|null} Job post or null if not found
 */
const getJobPost = async (jobPostId) => {
  return await prisma.jobOffer.findUnique({
    where: { id: parseInt(jobPostId) },
    include: {
      restaurant: true,
      questions: true,
    },
  });
};

/**
 * Check if employee has already applied to this job post
 * @param {number} jobPostId - Job post ID
 * @param {number} employeeId - Employee ID
 * @returns {Object|null} Existing application or null
 */
const getExistingApplication = async (jobPostId, employeeId) => {
  return await prisma.application.findFirst({
    where: {
      jobPostId: parseInt(jobPostId),
      employeeId: parseInt(employeeId),
    },
  });
};

/**
 * Create application with answers
 * @param {number} jobPostId - Job post ID
 * @param {number} employeeId - Employee ID
 * @param {Array} answers - Array of answers
 * @returns {Object} Created application
 */
const createApplication = async (jobPostId, employeeId, answers) => {
  try {
    return await prisma.application.create({
      data: {
        jobPost: { connect: { id: parseInt(jobPostId) } },
        employee: { connect: { id: parseInt(employeeId) } },
        answers: { create: answers },
      },
      include: {
        jobPost: {
          include: {
            restaurant: true,
          },
        },
        employee: true,
      },
    });
  } catch (err) {
    throw err;
  }
};

/**
 * Get application by ID with full details
 * @param {number} applicationId - Application ID
 * @returns {Object|null} Application or null if not found
 */
const getApplicationById = async (applicationId) => {
  return await prisma.application.findUnique({
    where: { id: parseInt(applicationId) },
    include: {
      jobPost: {
        include: {
          restaurant: true,
          location: true,
          questions: {
            include: {
              answers: {
                where: {
                  applicationId: parseInt(applicationId)
                }
              }
            }
          }
        },
      },
      employee: true,
    },
  });
};

/**
 * Get job offer with restaurant validation
 * @param {number} jobOfferId - Job offer ID
 * @param {number} restaurantId - Restaurant ID
 * @returns {Object|null} Job offer or null if not found
 */
const getJobOfferForRestaurant = async (jobOfferId, restaurantId) => {
  return await prisma.jobOffer.findFirst({
    where: {
      id: parseInt(jobOfferId),
      restaurantId: parseInt(restaurantId),
    },
  });
};

/**
 * Get applications for a job offer
 * @param {number} jobOfferId - Job offer ID
 * @returns {Array} Array of applications
 */
const getApplicationsForJobOffer = async (jobOfferId) => {
  return await prisma.application.findMany({
    where: { jobPostId: parseInt(jobOfferId) },
    include: {
      employee: true,
    },
    // orderBy: { createdAt: 'desc' }, // Not in schema, so leave out
  });
};

module.exports = {
  validateApplicationInput,
  getJobPost,
  getExistingApplication,
  createApplication,
  getApplicationById,
  getJobOfferForRestaurant,
  getApplicationsForJobOffer,
}; 
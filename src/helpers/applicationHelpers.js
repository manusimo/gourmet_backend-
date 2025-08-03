import { prisma } from "../db.js";

/**
 * Validate application input data
 * @param {Object} data - Application data
 * @returns {Object} Validation result
 */
export const validateApplicationInput = (data) => {
  const { jobPostId, answers } = data;
  const errors = [];

  if (!jobPostId) {
    errors.push('Job post ID is required');
  }

  if (!answers || !Array.isArray(answers) || answers.length === 0) {
    errors.push('Answers are required and must be an array');
  } else {
    answers.forEach((answer, index) => {
      if (!answer.questionId) {
        errors.push(`Question ID is required for answer at index ${index}`);
      }
      if (answer.answer === undefined || answer.answer === null) {
        errors.push(`Answer is required for question at index ${index}`);
      }
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
export const getJobPost = async (jobPostId) => {
  return await prisma.jobOffer.findFirst({
    where: { 
      id: parseInt(jobPostId), 
      deletedAt: null 
    },
  });
};

/**
 * Check if employee has already applied to this job post
 * @param {number} jobPostId - Job post ID
 * @param {number} employeeId - Employee ID
 * @returns {Object|null} Existing application or null
 */
export const getExistingApplication = async (jobPostId, employeeId) => {
  return await prisma.application.findFirst({
    where: {
      jobPostId: parseInt(jobPostId),
      employeeId: parseInt(employeeId),
      deletedAt: null,
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
export const createApplication = async (jobPostId, employeeId, answers) => {
  return await prisma.application.create({
    data: {
      jobPost: {
        connect: { id: parseInt(jobPostId) },
      },
      employee: {
        connect: { id: parseInt(employeeId) },
      },
      answers: {
        create: answers.map(({ questionId, answer }) => ({
          question: { connect: { id: parseInt(questionId) } },
          answer: answer.toString(),
        })),
      },
    },
    include: {
      answers: {
        include: {
          question: true,
        },
      },
      jobPost: {
        select: {
          id: true,
          title: true,
          restaurant: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  });
};

/**
 * Get application by ID with full details
 * @param {number} applicationId - Application ID
 * @returns {Object|null} Application or null if not found
 */
export const getApplicationById = async (applicationId) => {
  return await prisma.application.findFirst({
    where: {
      id: parseInt(applicationId),
      deletedAt: null,
    },
    include: {
      jobPost: {
        include: {
          questions: {
            include: {
              answers: {
                where: {
                  applicationId: parseInt(applicationId),
                },
              },
            },
          },
        },
      },
      employee: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
    },
  });
};

/**
 * Get job offer with restaurant validation
 * @param {number} jobOfferId - Job offer ID
 * @param {number} restaurantId - Restaurant ID
 * @returns {Object|null} Job offer or null if not found
 */
export const getJobOfferForRestaurant = async (jobOfferId, restaurantId) => {
  return await prisma.jobOffer.findFirst({
    where: {
      id: parseInt(jobOfferId),
      restaurantId: parseInt(restaurantId),
      deletedAt: null,
    },
  });
};

/**
 * Get applications for a job offer
 * @param {number} jobOfferId - Job offer ID
 * @returns {Array} Array of applications
 */
export const getApplicationsForJobOffer = async (jobOfferId) => {
  return await prisma.application.findMany({
    where: {
      jobPostId: parseInt(jobOfferId),
      deletedAt: null,
    },
    include: {
      employee: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
      answers: {
        include: {
          question: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
}; 
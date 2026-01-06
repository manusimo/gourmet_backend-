const { prisma } = require("../db.js");
const { JobRAGService } = require("../services/rag");

/**
 * Validate application input data
 * @param {Object} data - Application data
 * @returns {Object} Validation result
 */
const validateApplicationInput = (data) => {
  if (!data) {
    return {
      isValid: false,
      errors: ['Los datos son requeridos']
    };
  }
  const { jobPostId, answers } = data;
  const errors = [];

  if (jobPostId === 0) {
    errors.push('El ID del trabajo debe ser un número positivo');
  } else if (!jobPostId) {
    errors.push('El ID del trabajo es requerido');
  } else if (typeof jobPostId !== 'number' || isNaN(jobPostId)) {
    errors.push('El ID del trabajo debe ser un número válido');
  } else if (jobPostId < 0) {
    errors.push('El ID del trabajo debe ser un número positivo');
  } else if (jobPostId > Number.MAX_SAFE_INTEGER) {
    errors.push('El ID del trabajo debe ser un número válido');
  }

  if (!answers || !Array.isArray(answers)) {
    errors.push('Las respuestas son requeridas');
  } else if (answers.length === 0) {
    errors.push('Se requiere al menos una respuesta');
  } else {
    const questionIds = new Set();
    answers.forEach((answer, index) => {
      if (!answer.questionId || typeof answer.questionId !== 'number') {
        errors.push('Cada respuesta debe tener un questionId y una respuesta válidos');
      }
      if (answer.answer === undefined || answer.answer === null) {
        errors.push('Cada respuesta debe tener un questionId y una respuesta válidos');
      }
      if (typeof answer.answer === 'string' && answer.answer.trim() === '') {
        errors.push('La respuesta no puede estar vacía');
      }
      if (typeof answer.answer === 'string' && answer.answer.length > 10000) {
        errors.push('La respuesta es demasiado larga (máximo 10,000 caracteres)');
      }
      if (questionIds.has(answer.questionId)) {
        errors.push('No se permiten IDs de preguntas duplicados');
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
 * Check if job post exists
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
 * Check if job post is available for applications
 * @param {Object} jobPost - Job post object
 * @returns {Object} { isAvailable: boolean, reason: string|null }
 */
const isJobPostAvailable = (jobPost) => {
  if (!jobPost) {
    return { isAvailable: false, reason: 'Trabajo no encontrado.' };
  }

  if (jobPost.deletedAt) {
    return { isAvailable: false, reason: 'Este trabajo ya no está disponible.' };
  }

  // Check if job has an end date and if it has passed
  if (jobPost.endDate && new Date(jobPost.endDate) < new Date()) {
    return { isAvailable: false, reason: 'Este trabajo ya no está disponible.' };
  }

  return { isAvailable: true, reason: null };
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
    const application = await prisma.application.create({
      data: {
        jobPost: { connect: { id: parseInt(jobPostId) } },
        employee: { connect: { id: parseInt(employeeId) } },
        answers: { create: answers },
      },
      include: {
        jobPost: {
          include: {
            restaurant: true,
            questions: true,
          },
        },
        employee: true,
        answers: {
          include: {
            question: true,
          },
        },
      },
    });

    // Store applicant in vector database for RAG matching
    try {
      const ragService = new JobRAGService();
      await ragService.storeApplicantDocument(
        application,
        application.employee,
        application.jobPost
      );
      console.log(`✅ [Application] Applicant ${employeeId} stored in vector database for job ${jobPostId}`);
    } catch (ragError) {
      console.error('❌ [Application] Error storing applicant in vector database:', ragError);
      // Don't fail application creation if vector storage fails
    }

    return application;
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
  isJobPostAvailable,
  getExistingApplication,
  createApplication,
  getApplicationById,
  getJobOfferForRestaurant,
  getApplicationsForJobOffer,
}; 
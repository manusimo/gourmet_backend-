const { prisma } = require('../db.js');
const { createMessage } = require('./chatHelpers.js');

/**
 * Get effective values for hiring (use override if exists, otherwise use JobOffer)
 * @param {Object} hiring - Hiring object with jobOffer relation
 * @returns {Object} Effective values (position, salary, contract, period)
 */
const getEffectiveHiringValues = (hiring) => {
  const jobOffer = hiring.jobOffer;
  
  return {
    position: jobOffer?.position || 'trabajo',
    salary: jobOffer?.salary ?? null,
    contract: jobOffer?.contract || null,
    period: jobOffer?.period ? parseInt(jobOffer.period) || 30 : 30,
    startDate: jobOffer?.startDate || null,
    endDate: jobOffer?.endDate || null
  };
};

/**
 * Create a hiring offer
 * @param {Object} hiringData - Hiring data
 * @returns {Object} Created hiring
 */
const createHiringOffer = async (hiringData) => {
  const {
    employeeId,
    restaurantId,
    jobOfferId,
    conversationId,
    offerExpirationDate
  } = hiringData;

  const hiring = await prisma.hiring.create({
    data: {
      employeeId: parseInt(employeeId),
      restaurantId: parseInt(restaurantId),
      jobOfferId: jobOfferId ? parseInt(jobOfferId) : null,
      conversationId: conversationId ? parseInt(conversationId) : null,
      status: 'offered',
      offerExpirationDate: offerExpirationDate ? new Date(offerExpirationDate) : null
      // All job details (position, salary, contract, startDate, endDate) come from JobOffer
    },
    include: {
      employee: {
        include: {
          user: true
        }
      },
      restaurant: true,
      jobOffer: true
    }
  });

  return hiring;
};

/**
 * Get hiring by ID
 * @param {number} hiringId - Hiring ID
 * @returns {Object|null} Hiring or null if not found
 */
const getHiringById = async (hiringId) => {
  return await prisma.hiring.findUnique({
    where: { id: parseInt(hiringId) },
    include: {
      employee: {
        include: {
          user: true
        }
      },
      restaurant: true,
      jobOffer: true,
      conversation: true
    }
  });
};

/**
 * Get hiring by conversation ID
 * @param {number} conversationId - Conversation ID
 * @returns {Object|null} Hiring or null if not found
 */
const getHiringByConversationId = async (conversationId) => {
  return await prisma.hiring.findUnique({
    where: { conversationId: parseInt(conversationId) },
    include: {
      employee: {
        include: {
          user: true
        }
      },
      restaurant: true,
      jobOffer: true,
      conversation: true
    }
  });
};

/**
 * Accept hiring offer
 * @param {number} hiringId - Hiring ID
 * @returns {Object} Updated hiring
 */
const acceptHiringOffer = async (hiringId) => {
  const hiring = await getHiringById(hiringId);
  
  if (!hiring) {
    throw new Error('Hiring offer not found');
  }

  if (hiring.status !== 'offered' && hiring.status !== 'pending') {
    throw new Error(`Cannot accept hiring offer with status: ${hiring.status}`);
  }

  // Get effective values from JobOffer
  const effectiveValues = getEffectiveHiringValues(hiring);
  const acceptanceDate = new Date();

  // Update status to active (dates come from JobOffer, no need to store separately)
  const updatedHiring = await prisma.hiring.update({
    where: { id: parseInt(hiringId) },
    data: {
      status: 'active',
      acceptanceDate
      // startDate and endDate come from JobOffer, not stored in Hiring
    },
    include: {
      employee: {
        include: {
          user: true
        }
      },
      restaurant: true,
      jobOffer: true
    }
  });

  return updatedHiring;
};

/**
 * Reject hiring offer
 * @param {number} hiringId - Hiring ID
 * @returns {Object} Updated hiring
 */
const rejectHiringOffer = async (hiringId) => {
  const hiring = await getHiringById(hiringId);
  
  if (!hiring) {
    throw new Error('Hiring offer not found');
  }

  if (hiring.status !== 'offered' && hiring.status !== 'pending') {
    throw new Error(`Cannot reject hiring offer with status: ${hiring.status}`);
  }

  const updatedHiring = await prisma.hiring.update({
    where: { id: parseInt(hiringId) },
    data: {
      status: 'rejected'
    },
    include: {
      employee: {
        include: {
          user: true
        }
      },
      restaurant: true,
      jobOffer: true
    }
  });

  return updatedHiring;
};

/**
 * Send hiring offer message
 * @param {Object} messageData - Message data
 * @param {Object} hiring - Optional hiring object to get effective values
 * @returns {Object} Created message
 */
const sendHiringOfferMessage = async (messageData, hiring = null) => {
  const {
    conversationId,
    senderUserId,
    receiverUserId,
    senderType,
    receiverType,
    jobPosition,
    period
  } = messageData;

  // Use effective values from hiring if provided, otherwise use passed values
  let effectivePosition = jobPosition;
  let effectivePeriod = period;
  
  if (hiring) {
    const effectiveValues = getEffectiveHiringValues(hiring);
    effectivePosition = effectivePosition || effectiveValues.position;
    effectivePeriod = effectivePeriod || effectiveValues.period;
  }

  const messageText = `Te han intentado contratar para el trabajo de ${effectivePosition || 'trabajo'}. El período de contratación es de ${effectivePeriod || 30} días. Puedes aceptar o rechazar esta oferta.`;

  const message = await createMessage({
    text: messageText,
    conversationId: parseInt(conversationId),
    senderUserId: parseInt(senderUserId),
    receiverUserId: parseInt(receiverUserId),
    senderType,
    receiverType
  });

  return message;
};

/**
 * Get active hirings for employee
 * @param {number} employeeId - Employee ID
 * @returns {Array} Array of active hirings
 */
const getActiveHiringsForEmployee = async (employeeId) => {
  return await prisma.hiring.findMany({
    where: {
      employeeId: parseInt(employeeId),
      status: 'active'
    },
    include: {
      restaurant: true,
      jobOffer: true
    },
    orderBy: {
      startDate: 'desc'
    }
  });
};

/**
 * Get active hirings for restaurant
 * @param {number} restaurantId - Restaurant ID
 * @returns {Array} Array of active hirings
 */
const getActiveHiringsForRestaurant = async (restaurantId) => {
  return await prisma.hiring.findMany({
    where: {
      restaurantId: parseInt(restaurantId),
      status: 'active'
    },
    include: {
      employee: {
        include: {
          user: true
        }
      },
      jobOffer: true
    },
    orderBy: {
      startDate: 'desc'
    }
  });
};

/**
 * Get expired hirings that need to be completed
 * @returns {Array} Array of expired active hirings
 */
const getExpiredActiveHirings = async () => {
  const now = new Date();
  
  return await prisma.hiring.findMany({
    where: {
      status: 'active',
      endDate: {
        lte: now
      }
    },
    include: {
      employee: {
        include: {
          user: true
        }
      },
      restaurant: true,
      jobOffer: true
    }
  });
};

/**
 * Complete a hiring (mark as completed)
 * @param {number} hiringId - Hiring ID
 * @returns {Object} Updated hiring
 */
const completeHiring = async (hiringId) => {
  return await prisma.hiring.update({
    where: { id: parseInt(hiringId) },
    data: {
      status: 'completed'
    },
    include: {
      employee: {
        include: {
          user: true
        }
      },
      restaurant: true,
      jobOffer: true
    }
  });
};

module.exports = {
  createHiringOffer,
  getHiringById,
  getHiringByConversationId,
  acceptHiringOffer,
  rejectHiringOffer,
  sendHiringOfferMessage,
  getActiveHiringsForEmployee,
  getActiveHiringsForRestaurant,
  getExpiredActiveHirings,
  completeHiring,
  getEffectiveHiringValues
};


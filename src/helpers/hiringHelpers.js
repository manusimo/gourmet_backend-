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
    startDate,
    endDate,
    offerExpirationDate
  } = hiringData;

  const hiring = await prisma.hiring.create({
    data: {
      employeeId: parseInt(employeeId),
      restaurantId: parseInt(restaurantId),
      jobOfferId: jobOfferId ? parseInt(jobOfferId) : null,
      conversationId: conversationId ? parseInt(conversationId) : null,
      status: 'offered',
      offerExpirationDate: offerExpirationDate ? new Date(offerExpirationDate) : null,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null
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
 * @param {Object} options - Optional dates to use
 * @param {string|Date} options.startDate - Optional start date (will use job offer date if not provided)
 * @param {string|Date} options.endDate - Optional end date (will use job offer date if not provided)
 * @returns {Object} Updated hiring
 */
const acceptHiringOffer = async (hiringId, options = {}) => {
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

  // Use provided dates or fallback to JobOffer dates
  let startDate = null;
  let endDate = null;

  if (options.startDate) {
    startDate = options.startDate instanceof Date ? options.startDate : new Date(options.startDate);
  } 
  
  if (effectiveValues.startDate) {
    startDate = new Date(effectiveValues.startDate);
  }

  if (options.endDate) {
    endDate = options.endDate instanceof Date ? options.endDate : new Date(options.endDate);
  } 
  
  if (effectiveValues.endDate) {
    endDate = new Date(effectiveValues.endDate);
  }

  // Update status to active and store startDate and endDate
  const updatedHiring = await prisma.hiring.update({
    where: { id: parseInt(hiringId) },
    data: {
      status: 'active',
      acceptanceDate,
      startDate,
      endDate
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
  let effectiveStartDate = null;
  let effectiveEndDate = null;
  
  if (hiring) {
    const effectiveValues = getEffectiveHiringValues(hiring);
    effectivePosition = effectivePosition || effectiveValues.position;
    effectivePeriod = effectivePeriod || effectiveValues.period;
    effectiveStartDate = effectiveValues.startDate;
    effectiveEndDate = effectiveValues.endDate;
  }

  // Format dates for the message
  let dateMessage = '';
  if (effectiveStartDate) {
    const startDate = new Date(effectiveStartDate);
    const formattedStartDate = startDate.toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
    
    if (effectiveEndDate) {
      const endDate = new Date(effectiveEndDate);
      const formattedEndDate = endDate.toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
      dateMessage = ` El período de trabajo comenzará el ${formattedStartDate} y terminará el ${formattedEndDate}.`;
    } else {
      dateMessage = ` El período de trabajo comenzará el ${formattedStartDate}.`;
    }
  } else {
    // Fallback if no dates - use period in days
    dateMessage = ` El período de contratación es de ${effectivePeriod || 30} días.`;
  }

  const messageText = `Te han intentado contratar para el trabajo de ${effectivePosition || 'trabajo'}.${dateMessage} Puedes aceptar o rechazar esta oferta.`;

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
 * Get hirings by job offer ID
 * @param {number} jobOfferId - Job offer ID
 * @returns {Array} Array of hirings for the job offer
 */
const getHiringsByJobOfferId = async (jobOfferId) => {
  return await prisma.hiring.findMany({
    where: {
      jobOfferId: parseInt(jobOfferId),
      status: {
        in: ['active', 'accepted', 'completed'] // Show active, accepted, and completed hirings
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
    },
    orderBy: {
      acceptanceDate: 'desc'
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
        not: null,
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

/**
 * Update a hiring offer (only startDate and endDate)
 * @param {number} hiringId - Hiring ID
 * @param {Object} updateData - Data to update (startDate, endDate)
 * @returns {Object} Updated hiring
 */
const updateHiringOffer = async (hiringId, updateData) => {
  const hiring = await getHiringById(hiringId);
  
  if (!hiring) {
    throw new Error('Hiring offer not found');
  }

  if (hiring.status !== 'offered' && hiring.status !== 'pending') {
    throw new Error(`Cannot update hiring offer with status: ${hiring.status}`);
  }

  const dataToUpdate = {};
  
  if (updateData.startDate !== undefined) {
    dataToUpdate.startDate = updateData.startDate ? new Date(updateData.startDate) : null;
  }
  
  if (updateData.endDate !== undefined) {
    dataToUpdate.endDate = updateData.endDate ? new Date(updateData.endDate) : null;
  }

  const updatedHiring = await prisma.hiring.update({
    where: { id: parseInt(hiringId) },
    data: dataToUpdate,
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

  return updatedHiring;
};

/**
 * Find the last hiring offer message in a conversation
 * @param {number} conversationId - Conversation ID
 * @param {number} senderRestaurantUserId - Restaurant user ID who sent the message
 * @returns {Object|null} Last hiring offer message or null if not found
 */
const findLastHiringOfferMessage = async (conversationId, senderRestaurantUserId) => {
  const messages = await prisma.message.findMany({
    where: {
      conversationId: parseInt(conversationId),
      senderRestaurantUserId: parseInt(senderRestaurantUserId),
      text: {
        contains: 'Te han intentado contratar'
      }
    },
    orderBy: {
      createdAt: 'desc'
    },
    take: 1
  });

  return messages.length > 0 ? messages[0] : null;
};

/**
 * Update the hiring offer message text
 * @param {number} messageId - Message ID
 * @param {string} newText - New message text
 * @returns {Object} Updated message
 */
const updateHiringOfferMessage = async (messageId, newText) => {
  return await prisma.message.update({
    where: { id: parseInt(messageId) },
    data: {
      text: newText
    }
  });
};

module.exports = {
  createHiringOffer,
  getHiringById,
  getHiringByConversationId,
  getHiringsByJobOfferId,
  acceptHiringOffer,
  rejectHiringOffer,
  sendHiringOfferMessage,
  getActiveHiringsForEmployee,
  getActiveHiringsForRestaurant,
  getExpiredActiveHirings,
  completeHiring,
  getEffectiveHiringValues,
  updateHiringOffer,
  findLastHiringOfferMessage,
  updateHiringOfferMessage
};


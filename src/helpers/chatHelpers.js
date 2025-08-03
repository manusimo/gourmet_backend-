import { prisma } from "../db.js";

/**
 * Get conversation by ID with full details
 * @param {number} conversationId - Conversation ID
 * @returns {Object|null} Conversation or null if not found
 */
export const getConversationById = async (conversationId) => {
  return await prisma.conversation.findFirst({
    where: { 
      id: parseInt(conversationId), 
      deletedAt: null 
    },
    include: {
      messages: true,
      jobOffer: true,
      talentPool: true,
      employee: true,
      restaurantUser: true,
    },
  });
};

/**
 * Get conversation with messages only
 * @param {number} conversationId - Conversation ID
 * @returns {Object|null} Conversation with messages or null if not found
 */
export const getConversationWithMessages = async (conversationId) => {
  return await prisma.conversation.findFirst({
    where: { 
      id: parseInt(conversationId), 
      deletedAt: null 
    },
    include: { 
      messages: true 
    }
  });
};

/**
 * Validate conversation access for employee
 * @param {Object} conversation - Conversation object
 * @param {number} employeeId - Employee ID
 * @returns {boolean} True if employee has access
 */
export const validateEmployeeAccess = (conversation, employeeId) => {
  return conversation.employeeId === employeeId;
};

/**
 * Validate conversation access for restaurant user
 * @param {Object} conversation - Conversation object
 * @param {number} restaurantUserId - Restaurant user ID
 * @returns {boolean} True if restaurant user has access
 */
export const validateRestaurantUserAccess = (conversation, restaurantUserId) => {
  return conversation.restaurantUserId === restaurantUserId;
};

/**
 * Create message in conversation
 * @param {Object} messageData - Message data
 * @returns {Object} Created message
 */
export const createMessage = async (messageData) => {
  const { 
    text, 
    conversationId, 
    senderUserId, 
    receiverUserId, 
    senderType, 
    receiverType 
  } = messageData;

  const senderRelation = senderType === 'employee'
    ? { senderEmployee: { connect: { id: parseInt(senderUserId) } } }
    : { senderRestaurantUser: { connect: { id: parseInt(senderUserId) } } };

  const receiverRelation = receiverType === 'employee'
    ? { receiverEmployee: { connect: { id: parseInt(receiverUserId) } } }
    : { receiverRestaurantUser: { connect: { id: parseInt(receiverUserId) } } };

  return await prisma.message.create({
    data: {
      text,
      conversation: { connect: { id: parseInt(conversationId) } },
      ...senderRelation,
      ...receiverRelation,
    },
  });
};

/**
 * Check conversation existence for talent pool
 * @param {number} employeeId - Employee ID
 * @param {number} restaurantUserId - Restaurant user ID
 * @returns {Object|null} Conversation or null if not found
 */
export const checkTalentConversation = async (employeeId, restaurantUserId) => {
  return await prisma.conversation.findFirst({
    where: {
      employeeId: parseInt(employeeId),
      restaurantUserId: parseInt(restaurantUserId),
      type: 'talent',
      deletedAt: null
    },
  });
};

/**
 * Check conversation existence for application
 * @param {number} employeeId - Employee ID
 * @param {number} restaurantUserId - Restaurant user ID
 * @returns {Object|null} Conversation or null if not found
 */
export const checkApplicationConversation = async (employeeId, restaurantUserId) => {
  return await prisma.conversation.findFirst({
    where: {
      employeeId: parseInt(employeeId),
      restaurantUserId: parseInt(restaurantUserId),
      type: 'applicant',
      deletedAt: null
    },
  });
};

/**
 * Find existing conversation by job post
 * @param {number} employeeId - Employee ID
 * @param {number} jobPostId - Job post ID
 * @param {number} restaurantUserId - Restaurant user ID
 * @param {string} type - Conversation type
 * @returns {Object|null} Conversation or null if not found
 */
export const findConversationByJobPost = async (employeeId, jobPostId, restaurantUserId, type) => {
  return await prisma.conversation.findFirst({
    where: {
      employeeId: parseInt(employeeId),
      jobOfferId: jobPostId,
      restaurantUserId: restaurantUserId,
      type,
      deletedAt: null
    },
  });
};

/**
 * Find existing conversation by talent pool
 * @param {number} employeeId - Employee ID
 * @param {number} talentPoolId - Talent pool ID
 * @param {number} restaurantUserId - Restaurant user ID
 * @param {string} type - Conversation type
 * @returns {Object|null} Conversation or null if not found
 */
export const findConversationByTalentPool = async (employeeId, talentPoolId, restaurantUserId, type) => {
  return await prisma.conversation.findFirst({
    where: {
      employeeId: parseInt(employeeId),
      talentPoolId,
      restaurantUserId: restaurantUserId,
      type,
      deletedAt: null
    },
  });
};

/**
 * Create new conversation
 * @param {Object} conversationData - Conversation data
 * @returns {Object} Created conversation
 */
export const createConversation = async (conversationData) => {
  const { employeeId, jobPostId, talentPoolId, restaurantUserId, type } = conversationData;
  
  return await prisma.conversation.create({
    data: {
      employeeId: parseInt(employeeId),
      jobOfferId: jobPostId,
      talentPoolId: talentPoolId,
      restaurantUserId,
      type
    },
  });
};

/**
 * Get conversations for restaurant user
 * @param {number} restaurantUserId - Restaurant user ID
 * @param {number} employeeId - Employee ID
 * @param {string} type - Conversation type
 * @returns {Array} Array of conversations
 */
export const getRestaurantConversations = async (restaurantUserId, employeeId, type) => {
  return await prisma.conversation.findMany({
    where: {
      restaurantUserId: parseInt(restaurantUserId),
      employeeId: parseInt(employeeId),
      type: type.toLowerCase(),
      deletedAt: null
    },
    include: {
      messages: true,
      jobOffer: true,
      talentPool: true,
      employee: true,
      restaurantUser: true,
    },
  });
};

/**
 * Get employee conversations
 * @param {number} employeeId - Employee ID
 * @param {string} type - Conversation type
 * @returns {Array} Array of conversations
 */
export const getEmployeeConversations = async (employeeId, type) => {
  return await prisma.conversation.findMany({
    where: {
      employeeId: employeeId,
      type: type || 'none',
      deletedAt: null
    },
    include: {
      messages: true,
      jobOffer: {
        include: {
          location: true
        }
      },
      employee: true,
      restaurantUser: {
        include: {
          restaurant: true,
        },
      },
    },
  });
};

/**
 * Get restaurant user conversations
 * @param {number} restaurantUserId - Restaurant user ID
 * @param {string} type - Conversation type
 * @returns {Array} Array of conversations
 */
export const getRestaurantUserConversations = async (restaurantUserId, type) => {
  return await prisma.conversation.findMany({
    where: {
      restaurantUserId: parseInt(restaurantUserId),
      type: type || '',
      deletedAt: null
    },
    include: {
      messages: true,
      jobOffer: true,
      employee: true,
    },
  });
};

/**
 * Delete conversation and all its messages
 * @param {number} conversationId - Conversation ID
 * @returns {Object} Deleted conversation
 */
export const deleteConversation = async (conversationId) => {
  // First delete all messages in the conversation
  await prisma.message.deleteMany({
    where: { conversationId: parseInt(conversationId) },
  });

  // Then delete the conversation
  return await prisma.conversation.delete({
    where: { id: parseInt(conversationId) },
  });
};

/**
 * Validate conversation access
 * @param {Object} conversation - Conversation object
 * @param {number} employeeId - Employee ID
 * @param {number} restaurantUserId - Restaurant user ID
 * @returns {boolean} True if user has access
 */
export const validateConversationAccess = (conversation, employeeId, restaurantUserId) => {
  if (employeeId && conversation.employeeId !== employeeId) {
    return false;
  }
  
  if (restaurantUserId && conversation.restaurantUserId !== restaurantUserId) {
    return false;
  }
  
  return true;
}; 
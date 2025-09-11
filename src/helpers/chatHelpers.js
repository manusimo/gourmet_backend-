const { prisma } = require("../db.js");

/**
 * Get conversation by ID with full details
 * @param {number} conversationId - Conversation ID
 * @returns {Object|null} Conversation or null if not found
 */
const getConversationById = async (conversationId) => {
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
const getConversationWithMessages = async (conversationId) => {
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
const validateEmployeeAccess = (conversation, employeeId) => {
  return conversation.employeeId === employeeId;
};

/**
 * Validate conversation access for restaurant user
 * @param {Object} conversation - Conversation object
 * @param {number} restaurantUserId - Restaurant user ID
 * @returns {boolean} True if restaurant user has access
 */
const validateRestaurantUserAccess = (conversation, restaurantUserId) => {
  return conversation.restaurantUserId === restaurantUserId;
};

/**
 * Create message in conversation
 * @param {Object} messageData - Message data
 * @returns {Object} Created message
 */
const createMessage = async (messageData) => {
  const { 
    text, 
    conversationId, 
    senderUserId, 
    receiverUserId, 
    senderType, 
    receiverType 
  } = messageData;

  console.log('🔍 createMessage called with:', messageData);

  // For admin/staff users, we need to handle them differently
  // First, try to find if senderUserId corresponds to a RestaurantUser
  let senderRelation = {};
  if (senderType === 'employee') {
    senderRelation = { senderEmployeeId: parseInt(senderUserId) };
  } else {
    // For restaurant users, first check if the senderUserId exists as a RestaurantUser
    const existingRestaurantUser = await prisma.restaurantUser.findUnique({
      where: { id: parseInt(senderUserId) }
    });

    if (existingRestaurantUser) {
      senderRelation = { senderRestaurantUserId: parseInt(senderUserId) };
    } else {
      // For admin/staff users, we need to create a RestaurantUser record
      console.log('🔍 Admin/Staff user detected, creating RestaurantUser record');
      
      // First, find an existing restaurant to use
      const existingRestaurant = await prisma.restaurant.findFirst();
      
      if (!existingRestaurant) {
        throw new Error('No restaurants found in database');
      }
      
      console.log('🔍 Using restaurant ID:', existingRestaurant.id);
      
      // Create a RestaurantUser record for the admin/staff user
      const tempRestaurantUser = await prisma.restaurantUser.create({
        data: {
          userId: parseInt(senderUserId),
          restaurantId: existingRestaurant.id,
          role: 'admin'
        }
      });
      
      console.log('✅ Created RestaurantUser for admin:', tempRestaurantUser.id);
      senderRelation = { senderRestaurantUserId: tempRestaurantUser.id };
    }
  }

  let receiverRelation = {};
  if (receiverType === 'employee') {
    receiverRelation = { receiverEmployeeId: parseInt(receiverUserId) };
  } else {
    receiverRelation = { receiverRestaurantUserId: parseInt(receiverUserId) };
  }

  return await prisma.message.create({
    data: {
      text,
      conversationId: parseInt(conversationId),
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
const checkTalentConversation = async (employeeId, restaurantUserId) => {
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
const checkApplicationConversation = async (employeeId, restaurantUserId) => {
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
const findConversationByJobPost = async (employeeId, jobPostId, restaurantUserId, type) => {
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
const findConversationByTalentPool = async (employeeId, talentPoolId, restaurantUserId, type) => {
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
const createConversation = async (conversationData) => {
  const { employeeId, jobPostId, talentPoolId, restaurantUserId, restaurantId, type } = conversationData;
  
  return await prisma.conversation.create({
    data: {
      employeeId: parseInt(employeeId),
      jobOfferId: jobPostId,
      talentPoolId: talentPoolId,
      restaurantUserId,
      restaurantId: parseInt(restaurantId),
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
const getRestaurantConversations = async (restaurantUserId, employeeId, type) => {
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
const getEmployeeConversations = async (employeeId, type) => {
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
 * @param {number} restaurantId - Restaurant ID to filter by (optional)
 * @returns {Array} Array of conversations
 */
const getRestaurantUserConversations = async (restaurantUserId, type, restaurantId = null) => {
  let whereClause = {
    type: type || '',
    deletedAt: null
  };

  // If restaurantId is provided, filter by it directly (for admin users or restaurant switching)
  if (restaurantId) {
    whereClause.restaurantId = parseInt(restaurantId);
    console.log('🔍 [getRestaurantUserConversations] Filtering by restaurantId:', restaurantId);
  } else {
    // Fallback to restaurantUserId filtering (for staff users)
    whereClause.restaurantUserId = parseInt(restaurantUserId);
    console.log('🔍 [getRestaurantUserConversations] Filtering by restaurantUserId:', restaurantUserId);
  }

  console.log('🔍 [getRestaurantUserConversations] Where clause:', whereClause);

  const conversations = await prisma.conversation.findMany({
    where: whereClause,
    include: {
      messages: true,
      jobOffer: true,
      employee: true,
      restaurant: true,
      restaurantUser: {
        include: {
          restaurant: true
        }
      }
    },
  });

  console.log('🔍 [getRestaurantUserConversations] Found conversations:', conversations.length);
  console.log('🔍 [getRestaurantUserConversations] Conversation details:', conversations.map(c => ({
    id: c.id,
    restaurantId: c.restaurantId,
    restaurantUserId: c.restaurantUserId,
    type: c.type,
    employeeId: c.employeeId
  })));

  return conversations;
};

/**
 * Delete conversation and all its messages
 * @param {number} conversationId - Conversation ID
 * @returns {Object} Deleted conversation
 */
const deleteConversation = async (conversationId) => {
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
const validateConversationAccess = (conversation, employeeId, restaurantUserId) => {
  if (employeeId && conversation.employeeId !== employeeId) {
    return false;
  }
  
  if (restaurantUserId && conversation.restaurantUserId !== restaurantUserId) {
    return false;
  }
  
  return true;
}; 

module.exports = {
  getConversationById,
  getConversationWithMessages,
  validateEmployeeAccess,
  validateRestaurantUserAccess,
  createMessage,
  checkTalentConversation,
  checkApplicationConversation,
  findConversationByJobPost,
  findConversationByTalentPool,
  createConversation,
  getRestaurantConversations,
  getEmployeeConversations,
  getRestaurantUserConversations,
  deleteConversation,
  validateConversationAccess,
}; 
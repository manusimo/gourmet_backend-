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
 * Get conversation with messages for deletion authorization
 * @param {number} conversationId - Conversation ID
 * @returns {Promise<Object|null>} Conversation with messages or null
 */
const getConversationForDeletion = async (conversationId) => {
  return await prisma.conversation.findUnique({
    where: { id: parseInt(conversationId) },
    include: {
      messages: {
        include: {
          sender: true,
          receiver: true
        }
      }
    }
  });
};

/**
 * Check if admin/staff user has access to delete conversation
 * @param {Object} conversation - Conversation with messages
 * @param {number} userId - User ID
 * @param {number} restaurantUserId - Restaurant user ID from conversation
 * @returns {boolean} True if user has access
 */
const hasAdminDeleteAccess = (conversation, userId, restaurantUserId) => {
  if (!conversation || !conversation.messages) {
    return false;
  }

  return conversation.messages.some(message => {
    return message.senderId === userId || 
           (message.senderRestaurantUserId && message.senderRestaurantUserId === restaurantUserId);
  });
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

/**
 * Get employee by user ID
 * @param {number} userId - User ID
 * @returns {Promise<Object|null>} Employee or null
 */
const getEmployeeByUserId = async (userId) => {
  return await prisma.employee.findUnique({
    where: { userId: parseInt(userId) }
  });
};

/**
 * Get restaurant user by user ID
 * @param {number} userId - User ID
 * @returns {Promise<Object|null>} Restaurant user or null
 */
const getRestaurantUserByUserId = async (userId) => {
  return await prisma.restaurantUser.findFirst({
    where: { userId: parseInt(userId) }
  });
};

/**
 * Get all restaurant users for a user ID
 * @param {number} userId - User ID
 * @returns {Promise<Array>} Array of restaurant users
 */
const getAllRestaurantUsersByUserId = async (userId) => {
  return await prisma.restaurantUser.findMany({
    where: { userId: parseInt(userId) }
  });
};

/**
 * Get user by ID
 * @param {number} userId - User ID
 * @returns {Promise<Object|null>} User or null
 */
const getUserById = async (userId) => {
  return await prisma.user.findUnique({
    where: { id: parseInt(userId) }
  });
};

/**
 * Check if admin/staff user has sent messages in conversation
 * @param {Object} conversation - Conversation with messages
 * @param {Array<number>} restaurantUserIds - Array of restaurant user IDs
 * @returns {boolean} True if user has sent messages
 */
const hasAdminSentMessages = (conversation, restaurantUserIds) => {
  if (!conversation.messages || conversation.messages.length === 0) {
    return false;
  }

  return conversation.messages.some(message => 
    message.senderRestaurantUserId && restaurantUserIds.includes(message.senderRestaurantUserId)
  );
};

/**
 * Verify user access to conversation
 * @param {Object} conversation - Conversation object with messages
 * @param {number} userId - User ID
 * @returns {Promise<boolean>} True if user has access
 */
const verifyConversationAccess = async (conversation, userId) => {
  try {
    // Check if user is an employee in this conversation
    if (conversation.employeeId) {
      const employee = await getEmployeeByUserId(userId);
      if (employee && employee.id === conversation.employeeId) {
        return true;
      }
    }
    
    // Check if user is a restaurant user in this conversation
    if (conversation.restaurantUserId) {
      const restaurantUser = await getRestaurantUserByUserId(userId);
      if (restaurantUser && restaurantUser.id === conversation.restaurantUserId) {
        return true;
      }
    }
    
    // For admin users: check if they have sent messages in this conversation
    if (conversation.messages && conversation.messages.length > 0) {
      const adminRestaurantUsers = await getAllRestaurantUsersByUserId(userId);
      
      if (adminRestaurantUsers.length > 0) {
        const adminRestaurantUserIds = adminRestaurantUsers.map(ru => ru.id);
        if (hasAdminSentMessages(conversation, adminRestaurantUserIds)) {
          return true;
        }
      }
    }
    
    // Temporary: allow access for admin/staff users even if they haven't sent messages yet
    const user = await getUserById(userId);
    if (user && (user.role === 'admin' || user.role === 'staff')) {
      return true;
    }
    
    return false;
  } catch (error) {
    // On error, default to allowing access (graceful degradation)
    // This matches the original behavior where accessError resulted in hasAccess = true
    return true;
  }
};

/**
 * Get user info for sender/receiver based on type
 * @param {number} userId - User/Employee/RestaurantUser ID
 * @param {string} type - Type: 'restaurant', 'employee', or 'user'
 * @returns {Promise<Object|null>} User info with id, name, email, and optional restaurantName
 */
const getUserInfoByType = async (userId, type) => {
  if (type === 'restaurant') {
    const restaurantUser = await prisma.restaurantUser.findUnique({
      where: { id: parseInt(userId) },
      select: { 
        user: { select: { id: true, name: true, email: true } },
        restaurant: { select: { name: true } }
      }
    });
    if (restaurantUser) {
      return { 
        ...restaurantUser.user, 
        restaurantName: restaurantUser.restaurant.name 
      };
    }
    return null;
  } else if (type === 'employee') {
    const employee = await prisma.employee.findUnique({
      where: { id: parseInt(userId) },
      select: { 
        user: { select: { id: true, name: true, email: true } }
      }
    });
    return employee ? employee.user : null;
  } else {
    // Fallback: try as direct User.id
    return await prisma.user.findUnique({
      where: { id: parseInt(userId) },
      select: { id: true, name: true, email: true }
    });
  }
};

/**
 * Get restaurant name from conversation
 * @param {number} conversationId - Conversation ID
 * @returns {Promise<string|null>} Restaurant name or null
 */
const getRestaurantNameFromConversation = async (conversationId) => {
  const conversation = await prisma.conversation.findUnique({
    where: { id: parseInt(conversationId) },
    select: { 
      restaurant: { 
        select: { name: true } 
      } 
    }
  });
  return conversation?.restaurant?.name || null;
};

/**
 * Find or create restaurant user for a user and restaurant
 * @param {number} userId - User ID
 * @param {number} restaurantId - Restaurant ID
 * @returns {Promise<number>} Restaurant user ID
 */
const findOrCreateRestaurantUser = async (userId, restaurantId) => {
  // Try to find existing restaurant user
  const restaurantUser = await prisma.restaurantUser.findFirst({
    where: {
      userId: parseInt(userId),
      restaurantId: parseInt(restaurantId)
    }
  });

  if (restaurantUser) {
    return restaurantUser.id;
  }

  // Create new restaurant user if not found
  const newRestaurantUser = await prisma.restaurantUser.create({
    data: {
      userId: parseInt(userId),
      restaurantId: parseInt(restaurantId),
      role: 'admin'
    }
  });

  return newRestaurantUser.id;
};

/**
 * Convert image URLs in employee conversations (restaurant images)
 * @param {Array} conversations - Array of conversations
 * @param {Function} convertImageUrls - Function to convert image URLs
 * @returns {Promise<Array>} Conversations with converted image URLs
 */
const convertEmployeeConversationImages = async (conversations, convertImageUrls) => {
  return await Promise.all(
    conversations.map(async (conversation) => {
      try {
        const convertedConversation = { ...conversation };
        if (conversation.restaurantUser?.restaurant) {
          convertedConversation.restaurantUser.restaurant = await convertImageUrls(
            conversation.restaurantUser.restaurant, 
            ['profileImageUrl', 'profileCarouselUrls']
          );
        }
        return convertedConversation;
      } catch (error) {
        // Return original conversation if conversion fails
        return conversation;
      }
    })
  );
};

/**
 * Convert image URLs in restaurant user conversations (employee images)
 * @param {Array} conversations - Array of conversations
 * @param {Function} convertImageUrls - Function to convert image URLs
 * @returns {Promise<Array>} Conversations with converted image URLs
 */
const convertRestaurantConversationImages = async (conversations, convertImageUrls) => {
  return await Promise.all(
    conversations.map(async (conversation) => {
      try {
        const convertedConversation = { ...conversation };
        if (conversation.employee) {
          convertedConversation.employee = await convertImageUrls(
            conversation.employee, 
            ['profileImageUrl']
          );
        }
        return convertedConversation;
      } catch (error) {
        // Return original conversation if conversion fails
        return conversation;
      }
    })
  );
};

/**
 * Generate JWT token for chat socket authentication
 * @param {number} userId - User ID
 * @param {string} userType - User type
 * @returns {string} JWT token
 */
const generateChatToken = (userId, userType) => {
  const jwt = require('jsonwebtoken');

  if (!process.env.JWT_SECRET) {
    const error = new Error('Error en la configuración del servidor. Por favor, contacta al soporte.');
    error.statusCode = 500;
    throw error;
  }

  const payload = {
    userId,
    userType,
    tokenType: 'socket',
    timestamp: Date.now()
  };

  const options = {
    expiresIn: '15m',
    audience: 'chat',
    issuer: process.env.NODE_ENV === 'production' ? process.env.JWT_ISSUER : 'localhost'
  };

  return jwt.sign(payload, process.env.JWT_SECRET, options);
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
  verifyConversationAccess,
  getUserInfoByType,
  getRestaurantNameFromConversation,
  findOrCreateRestaurantUser,
  convertEmployeeConversationImages,
  convertRestaurantConversationImages,
  getConversationForDeletion,
  hasAdminDeleteAccess,
  generateChatToken,
}; 
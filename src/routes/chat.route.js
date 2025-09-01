const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { checkJoinAuthorization, checkSendMessageAuthorization } = require('../helpers/chat.js');
const { checkCompany, setUserRole } = require('../helpers/authenticateToken.js');

const prisma = new PrismaClient();
const {
  getUserIdFromCookie,
  getRestaurantIdFromCookie,
  getEmployeeIdFromCookie,
  getRestaurantUserIdFromCookie,
  validateTokenAndIdentifyUser
} = require('../helpers/cookies.js');
const {
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
  validateConversationAccess
} = require('../helpers/chatHelpers.js');
const jwt = require('jsonwebtoken');

const router = express.Router();

// GET /chat-token - Generate chat socket token
router.get('/chat-token', validateTokenAndIdentifyUser, async (req, res) => {
  try {
    console.log('🔍 chat-token: Request received', {
      userId: req.userId,
      userType: req.userType,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      timestamp: new Date().toISOString()
    });
    
    const { userId, userType } = req;
    
    if (!userId) {
      console.log('❌ chat-token: No user ID found');
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Generate a short-lived token for chat socket authentication
    const chatToken = jwt.sign(
      {
        userId,
        userType,
        tokenType: 'socket', // Changed from 'type' to 'tokenType'
        timestamp: Date.now()
      },
      process.env.JWT_SECRET,
      { 
        expiresIn: '15m', // Changed from '1h' to '15m' to match chat app
        audience: 'chat', // Add audience for chat app validation
        issuer: process.env.NODE_ENV === 'production' ? process.env.JWT_ISSUER : 'localhost'
      }
    );

    console.log('✅ chat-token: Generated token for user:', {
      userId,
      userType,
      tokenLength: chatToken.length,
      timestamp: new Date().toISOString()
    });
    
    res.json({
      success: true,
      token: chatToken
    });
    
  } catch (error) {
    console.error('Error generating chat token:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// GET /conversations/:conversationId - Get conversation by ID
router.get('/conversations/:conversationId', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const conversation = await getConversationById(conversationId);

    if (!conversation) {
      return res.status(404).json({ 
        success: false,
        error: 'Conversation not found' 
      });
    }

    res.status(200).json({ 
      success: true,
      data: conversation 
    });
  } catch (error) {
    console.error('Failed to fetch conversation:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal Server Error' 
    });
  }
});

// GET /conversations/:conversationId/messages - Get conversation messages
router.get('/conversations/:conversationId/messages', validateTokenAndIdentifyUser, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { userId } = req;

    console.log('🔍 Messages endpoint called with:', { 
      conversationId, 
      userId,
      userType: req.userType,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      timestamp: new Date().toISOString()
    });

    if (!userId) {
      console.log('Unauthorized access: No valid user ID found');
      return res.status(403).json({ 
        success: false,
        error: 'Unauthorized access. User ID not found.' 
      });
    }

    console.log('🔍 Fetching conversation with messages...');
    const conversation = await getConversationWithMessages(conversationId);

    if (!conversation) {
      console.log(`Conversation with ID ${conversationId} not found`);
      return res.status(404).json({ 
        success: false,
        error: 'Conversation not found.' 
      });
    }

    console.log('🔍 Found conversation:', {
      id: conversation.id,
      employeeId: conversation.employeeId,
      restaurantUserId: conversation.restaurantUserId,
      messageCount: conversation.messages ? conversation.messages.length : 0
    });

    // Simplified access control for now - allow access if user has sent messages
    let hasAccess = false;
    
    try {
      console.log('🔍 Checking access control for user:', userId);
      
      // Check if user is an employee in this conversation
      if (conversation.employeeId) {
        const employee = await prisma.employee.findUnique({
          where: { userId: parseInt(userId) }
        });
        if (employee && employee.id === conversation.employeeId) {
          hasAccess = true;
          console.log('✅ User is employee in conversation');
        }
      }
      
      // Check if user is a restaurant user in this conversation
      if (!hasAccess && conversation.restaurantUserId) {
        const restaurantUser = await prisma.restaurantUser.findFirst({
          where: { userId: parseInt(userId) }
        });
        if (restaurantUser && restaurantUser.id === conversation.restaurantUserId) {
          hasAccess = true;
          console.log('✅ User is restaurant user in conversation');
        }
      }
      
      // For admin users: check if they have sent messages in this conversation
      if (!hasAccess && conversation.messages && conversation.messages.length > 0) {
        // Find any RestaurantUser records created for this admin user
        const adminRestaurantUsers = await prisma.restaurantUser.findMany({
          where: { userId: parseInt(userId) }
        });
        
        console.log('🔍 Found admin restaurant users:', adminRestaurantUsers.length);
        
        if (adminRestaurantUsers.length > 0) {
          const adminRestaurantUserIds = adminRestaurantUsers.map(ru => ru.id);
          const hasSentMessages = conversation.messages.some(message => 
            message.senderRestaurantUserId && adminRestaurantUserIds.includes(message.senderRestaurantUserId)
          );
          if (hasSentMessages) {
            hasAccess = true;
            console.log('✅ Admin user has sent messages in conversation');
          }
        }
      }
      
      // Temporary: allow access for admin users even if they haven't sent messages yet
      if (!hasAccess) {
        const user = await prisma.user.findUnique({
          where: { id: parseInt(userId) }
        });
        if (user && (user.role === 'admin' || user.role === 'staff')) {
          hasAccess = true;
          console.log('✅ User is admin/staff, granting access');
        }
      }
    } catch (accessError) {
      console.error('❌ Error in access control:', accessError);
      // For now, grant access on error to avoid blocking users
      hasAccess = true;
    }

    if (!hasAccess) {
      console.log(`User ${userId} not authorized for conversation ${conversationId}`);
      return res.status(403).json({ 
        success: false,
        error: 'User not authorized for this conversation' 
      });
    }

    console.log('✅ User authorized, returning messages:', conversation.messages.length);

    res.status(200).json({ 
      success: true,
      data: conversation.messages 
    });
  } catch (error) {
    console.error('❌ Error fetching messages:', error);
    console.error('❌ Error stack:', error.stack);
    res.status(500).json({ 
      success: false,
      error: 'Internal Server Error',
      details: error.message 
    });
  }
});

// POST /send-message - Send a message
router.post('/send-message', async (req, res) => {
  // TODO: Temporarily disabled plan requirement for development
  // requirePlan(['pro', 'plus', 'premium']), 
  try {
    const { 
      text, 
      senderUserId, 
      receiverUserId, 
      conversationId, 
      senderType, 
      receiverType 
    } = req.body;

    const conversation = await getConversationById(conversationId);

    if (!conversation) {
      return res.status(404).json({ 
        success: false,
        error: 'Conversation not found.' 
      });
    }

    const message = await createMessage({
      text,
      senderUserId,
      receiverUserId,
      conversationId,
      senderType,
      receiverType
    });

    res.status(200).json({ 
      success: true,
      message: 'Message sent successfully.', 
      data: message 
    });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to send message.' 
    });
  }
});

// GET /check-conversation/:employeeId/:type - Check conversation existence
router.get('/check-conversation/:employeeId/:type', checkCompany, getRestaurantUserIdFromCookie, async (req, res) => {
  try {
    const { employeeId, type } = req.params;
    const restaurantUserId = req.restaurantUserId;
    
    console.log('checking the existence of the conversation in the backend', employeeId, restaurantUserId, type);

    if (!restaurantUserId) {
      return res.status(400).json({ 
        success: false,
        error: 'Restaurant user ID not found in cookies.' 
      });
    }

    let conversation;

    if (type === 'talent') {
      conversation = await checkTalentConversation(employeeId, restaurantUserId);
    }

    if (type === 'application') {
      console.log('check the application conversation');
      conversation = await checkApplicationConversation(employeeId, restaurantUserId);
      console.log('this is the conversation', conversation);
    }

    if (conversation) {
      res.status(200).json({ 
        success: true,
        message: 'Conversation found.', 
        data: conversation 
      });
    } else {
      res.status(404).json({ 
        success: false,
        message: 'Conversation not found.' 
      });
    }
  } catch (error) {
    console.error('Error checking conversation:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to check conversation.' 
    });
  }
});

// POST /create-conversation - Create or ensure conversation exists
router.post('/create-conversation', checkCompany, getUserIdFromCookie, getRestaurantUserIdFromCookie, async (req, res) => {
  // TODO: Temporarily disabled plan requirement for development
  // requirePlan(['pro', 'plus', 'premium']), 
  try {
    const { employeeId, jobPostId, talentPoolId, type } = req.body;
    const userId = req.userId;
    let restaurantUserId = req.restaurantUserId;

    console.log('🔍 create-conversation - Request data:', {
      employeeId,
      jobPostId,
      talentPoolId,
      type,
      userId,
      restaurantUserId
    });

    // Handle admin users who might not have restaurantUserId set
    if (!restaurantUserId && userId) {
      console.log('🔍 Admin user detected, looking up restaurantUserId...');
      
      // Find the restaurant for this admin user
      const restaurant = await prisma.restaurant.findFirst({
        where: { userId: userId }
      });
      
      if (restaurant) {
        // Find or create RestaurantUser record for admin
        const adminRestaurantUser = await prisma.restaurantUser.upsert({
          where: {
            userId_restaurantId: {
              userId: userId,
              restaurantId: restaurant.id
            }
          },
          update: {},
          create: {
            userId: userId,
            restaurantId: restaurant.id,
            role: 'admin'
          }
        });
        
        restaurantUserId = adminRestaurantUser.id;
        console.log('✅ Created/found restaurantUserId for admin:', restaurantUserId);
      }
    }

    if (!restaurantUserId) {
      console.error('❌ No restaurantUserId available for conversation creation');
      return res.status(400).json({ 
        success: false,
        error: 'Restaurant user ID not found. Please ensure you are properly associated with a restaurant.' 
      });
    }

    let conversation;
    const parsedEmployeeId = parseInt(employeeId, 10);

    // Check for existing conversation
    if (jobPostId) {
      conversation = await findConversationByJobPost(parsedEmployeeId, jobPostId, restaurantUserId, type);
    }

    if (talentPoolId) {
      conversation = await findConversationByTalentPool(parsedEmployeeId, talentPoolId, restaurantUserId, type);
    }

    // Create new conversation if none exists
    if (!conversation) {
      console.log('🔍 Creating new conversation with:', {
        employeeId: parsedEmployeeId,
        jobPostId,
        talentPoolId,
        restaurantUserId,
        type
      });
      
      conversation = await createConversation({
        employeeId: parsedEmployeeId,
        jobPostId,
        talentPoolId,
        restaurantUserId,
        type
      });
      
      console.log('✅ Created conversation:', conversation.id);
    } else {
      console.log('✅ Found existing conversation:', conversation.id);
    }

    res.status(200).json({ 
      success: true,
      message: 'Conversation created/ensured.', 
      data: conversation 
    });
  } catch (error) {
    console.error('Error creating/ensuring conversation:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to create/ensure conversation.' 
    });
  }
});

// GET /conversations/:employeeId/:type - Get conversations for specific employee and type
router.get('/conversations/:employeeId/:type', checkCompany, getUserIdFromCookie, async (req, res) => {
  try {
    const { employeeId, type } = req.params;
    const { restaurantUserId } = req.cookies;

    const conversations = await getRestaurantConversations(restaurantUserId, employeeId, type);

    res.status(200).json({ 
      success: true,
      data: conversations 
    });
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch conversations.' 
    });
  }
});

// GET /conversations - Get all conversations for current user
router.get('/conversations', validateTokenAndIdentifyUser, async (req, res) => {
  try {
    if (req.employeeId) {
      const employeeConversations = await getEmployeeConversations(req.employeeId, req.query.type);
      return res.status(200).json({ 
        success: true,
        data: employeeConversations 
      });
    }

    if (req.restaurantUserId) {
      const restaurantConversations = await getRestaurantUserConversations(req.restaurantUserId, req.query.type);
      return res.status(200).json({ 
        success: true,
        data: restaurantConversations 
      });
    }

    console.log('No valid user type found in the request. Unable to fetch conversations.');
    return res.status(400).json({ 
      success: false,
      message: 'Invalid user type or ID' 
    });

  } catch (error) {
    console.error('Error fetching conversations:', error);
    return res.status(500).json({ 
      success: false,
      message: 'Internal Server Error' 
    });
  }
});

// DELETE /conversations/:conversationId - Delete conversation
router.delete('/conversations/:conversationId', validateTokenAndIdentifyUser, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.userId;
    const userType = req.userType;
    const role = req.role;

    console.log('🗑️ Delete conversation request:', { conversationId, userId, userType, role });

    // For admin/staff users, we need to check if they have access to this conversation
    if (userType === 'empresas' && (role === 'admin' || role === 'staff')) {
      console.log('🗑️ Admin/Staff user detected, checking conversation access');
      
      // Find the conversation to check if user has access
      const conversation = await prisma.conversation.findUnique({
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

      if (!conversation) {
        return res.status(404).json({ 
          success: false,
          error: 'Conversation not found.' 
        });
      }

      // For admin/staff, allow deletion if they're part of the conversation
      // Check if any messages were sent by this user or their restaurant
      const hasAccess = conversation.messages.some(message => {
        return message.senderId === userId || 
               (message.senderRestaurantUserId && message.senderRestaurantUserId === conversation.restaurantUserId);
      });

      if (!hasAccess) {
        return res.status(403).json({ 
          success: false,
          error: 'Unauthorized access to this conversation.' 
        });
      }

      console.log('🗑️ Admin/Staff user has access, proceeding with deletion');
    } else {
      // For regular users, use the existing logic
    const employeeId = req.employeeId;
    const restaurantUserId = req.restaurantUserId;

    if (!employeeId && !restaurantUserId) {
      return res.status(403).json({ 
        success: false,
        error: 'Unauthorized access.' 
      });
      }
    }

    const conversation = await getConversationWithMessages(conversationId);

    if (!conversation) {
      return res.status(404).json({ 
        success: false,
        error: 'Conversation not found.' 
      });
    }

    const conversationDeleted = await deleteConversation(conversationId);
    console.log('conversation deleted', conversationDeleted);

    res.status(200).json({ 
      success: true,
      message: 'Conversation deleted successfully.' 
    });
  } catch (error) {
    console.error('Error deleting conversation:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to delete conversation.' 
    });
  }
});

module.exports = router;

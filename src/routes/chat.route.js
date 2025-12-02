const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { checkJoinAuthorization, checkSendMessageAuthorization } = require('../helpers/chat.js');
const { checkCompany, setUserRole } = require('../helpers/authenticateToken.js');
const { processMessageNotifications } = require('../services/messageNotificationService');
const { convertImageUrls } = require('../utils/imageUrlUtils.js');
// Message notifications are now handled by messageNotificationService.js

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
    
    const { userId, userType } = req;
    
    if (!userId) {
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

    res.json({
      success: true,
      token: chatToken
    });
    
  } catch (error) {
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

    if (!userId) {
      return res.status(403).json({ 
        success: false,
        error: 'Unauthorized access. User ID not found.' 
      });
    }

    const conversation = await getConversationWithMessages(conversationId);

    if (!conversation) {
      return res.status(404).json({ 
        success: false,
        error: 'Conversation not found.' 
      });
    }

    let hasAccess = false;
    
    try { 
      // Check if user is an employee in this conversation
      if (conversation.employeeId) {
        const employee = await prisma.employee.findUnique({
          where: { userId: parseInt(userId) }
        });
        if (employee && employee.id === conversation.employeeId) {
          hasAccess = true;
        }
      }
      
      // Check if user is a restaurant user in this conversation
      if (!hasAccess && conversation.restaurantUserId) {
        const restaurantUser = await prisma.restaurantUser.findFirst({
          where: { userId: parseInt(userId) }
        });

        if (restaurantUser && restaurantUser.id === conversation.restaurantUserId) {
          hasAccess = true;
        }
      }
      
      // For admin users: check if they have sent messages in this conversation
      if (!hasAccess && conversation.messages && conversation.messages.length > 0) {
        // Find any RestaurantUser records created for this admin user
        const adminRestaurantUsers = await prisma.restaurantUser.findMany({
          where: { userId: parseInt(userId) }
        });
            
        if (adminRestaurantUsers.length > 0) {
          const adminRestaurantUserIds = adminRestaurantUsers.map(ru => ru.id);
          const hasSentMessages = conversation.messages.some(message => 
            message.senderRestaurantUserId && adminRestaurantUserIds.includes(message.senderRestaurantUserId)
          );
          if (hasSentMessages) {
            hasAccess = true;
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
        }
      }
    } catch (accessError) {
      hasAccess = true;
    }

    if (!hasAccess) {
      return res.status(403).json({ 
        success: false,
        error: 'User not authorized for this conversation' 
      });
    }

    res.status(200).json({ 
      success: true,
      data: conversation.messages 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: 'Internal Server Error',
      details: error.message 
    });
  }
});

// POST /send-message - Send a message
router.post('/send-message', async (req, res) => {
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

    try {
      
      let sender, receiver;
      
      // Lookup sender based on senderType
      if (senderType === 'restaurant') {
        const restaurantUser = await prisma.restaurantUser.findUnique({
          where: { id: parseInt(senderUserId) },
          select: { 
            user: { select: { id: true, name: true, email: true } },
            restaurant: { select: { name: true } }
          }
        });
        sender = restaurantUser ? { ...restaurantUser.user, restaurantName: restaurantUser.restaurant.name } : null;
      } else if (senderType === 'employee') {
        const employee = await prisma.employee.findUnique({
          where: { id: parseInt(senderUserId) },
          select: { 
            user: { select: { id: true, name: true, email: true } }
          }
        });
        sender = employee ? employee.user : null;
      } else {
        // Fallback: try as direct User.id
        sender = await prisma.user.findUnique({
          where: { id: parseInt(senderUserId) },
          select: { id: true, name: true, email: true }
        });
      }
      
      // Lookup receiver based on receiverType
      if (receiverType === 'restaurant') {
        const restaurantUser = await prisma.restaurantUser.findUnique({
          where: { id: parseInt(receiverUserId) },
          select: { 
            user: { select: { id: true, name: true, email: true } }
          }
        });
        receiver = restaurantUser ? restaurantUser.user : null;
      } else if (receiverType === 'employee') {
        const employee = await prisma.employee.findUnique({
          where: { id: parseInt(receiverUserId) },
          select: { 
            user: { select: { id: true, name: true, email: true } }
          }
        });
        receiver = employee ? employee.user : null;
      } else {
        // Fallback: try as direct User.id
        receiver = await prisma.user.findUnique({
          where: { id: parseInt(receiverUserId) },
          select: { id: true, name: true, email: true }
        });
      }
      
      // Get restaurant info from conversation
      const conversationWithRestaurant = await prisma.conversation.findUnique({
        where: { id: parseInt(conversationId) },
        select: { 
          restaurant: { 
            select: { name: true } 
          } 
        }
      });
      
      if (sender && receiver && conversationWithRestaurant) {
        
        await processMessageNotifications({
          senderUserId: sender.id, // Use the actual User.id
          receiverUserId: receiver.id, // Use the actual User.id
          conversationId,
          messageText: text,
          senderName: sender.name,
          senderEmail: sender.email,
          recipientName: receiver.name,
          recipientEmail: receiver.email,
          restaurantName: sender.restaurantName || conversationWithRestaurant.restaurant?.name || 'Restaurante'
        });
        
        
      } 
    } catch (notificationError) {
      console.error('❌ Failed to process message notifications:', notificationError);
    }

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
    const { jobPostId } = req.query; // Get jobPostId from query parameters
    const restaurantUserId = req.restaurantUserId;
    
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
      
      if (jobPostId) {
        conversation = await findConversationByJobPost(employeeId, parseInt(jobPostId), restaurantUserId, 'applicant');
      } else {
        conversation = await checkApplicationConversation(employeeId, restaurantUserId);
      }
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
router.post('/create-conversation', checkCompany, getUserIdFromCookie, async (req, res) => {
  // TODO: Temporarily disabled plan requirement for development
  // requirePlan(['pro', 'plus', 'premium']), 
  try {
    const { employeeId, jobPostId, talentPoolId, type, restaurantId } = req.body;
    const userId = req.userId;
    let restaurantUserId;

    if (restaurantId) {
     
      const restaurantUser = await prisma.restaurantUser.findFirst({
        where: {
          userId: userId,
          restaurantId: parseInt(restaurantId)
        }
      });
      
      if (restaurantUser) {
        restaurantUserId = restaurantUser.id;
      } else {
        // Create RestaurantUser record for this restaurant
        const newRestaurantUser = await prisma.restaurantUser.create({
          data: {
            userId: userId,
            restaurantId: parseInt(restaurantId),
            role: 'admin'
          }
        });
        restaurantUserId = newRestaurantUser.id;
      }
    } else {
      // No restaurantId provided - this should not happen in the new multi-restaurant system
      console.error('❌ No restaurantId provided in request body. This is required for multi-restaurant support.');
      return res.status(400).json({ 
        success: false,
        error: 'Restaurant ID is required. Please ensure you are selecting a restaurant before creating conversations.' 
      });
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
      
      conversation = await createConversation({
        employeeId: parsedEmployeeId,
        jobPostId,
        talentPoolId,
        restaurantUserId,
        restaurantId: restaurantId,
        type
      });
      
    } 

    res.status(200).json({ 
      success: true,
      message: 'Conversation created/ensured.', 
      data: conversation 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: 'Failed to create/ensure conversation.' 
    });
  }
});

// POST /contact-recommended-candidate - Create conversation with recommended candidate (from AI recommendations)
router.post('/contact-recommended-candidate', checkCompany, getUserIdFromCookie, getRestaurantUserIdFromCookie, async (req, res) => {
  try {
    const { employeeId, jobPostId, restaurantId } = req.body;
    const userId = req.userId;
    const restaurantUserId = req.restaurantUserId;

    if (!employeeId) {
      return res.status(400).json({ 
        success: false,
        error: 'Employee ID is required' 
      });
    }

    if (!restaurantId) {
      return res.status(400).json({ 
        success: false,
        error: 'Restaurant ID is required' 
      });
    }

    let conversation = null;
    if (jobPostId) {
      conversation = await findConversationByJobPost(
        parseInt(employeeId),
        parseInt(jobPostId),
        restaurantUserId,
        'applicant'
      );
    }

    // If no conversation exists, create one
    if (!conversation) {
      // For recommended candidates, we can use 'talent' type or create without jobPostId
      conversation = await createConversation({
        employeeId: parseInt(employeeId),
        jobPostId: jobPostId ? parseInt(jobPostId) : null,
        talentPoolId: null,
        restaurantUserId,
        restaurantId: parseInt(restaurantId),
        type: jobPostId ? 'applicant' : 'talent' // Use applicant if job exists, otherwise talent
      });

    } 

    res.status(200).json({ 
      success: true,
      message: 'Conversation created successfully. You can now chat with this candidate.',
      data: {
        conversationId: conversation.id,
        employeeId: parseInt(employeeId),
        chatUrl: `/panel-empresa/inbox-empresa/${conversation.id}/${employeeId}`
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: 'Failed to create conversation with candidate.' 
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
    const { type, restaurantId } = req.query;
  
    if (req.employeeId) {
      const employeeConversations = await getEmployeeConversations(req.employeeId, type);
      
      // Convert restaurant image URLs to actual signed URLs in conversations
      const conversationsWithSignedUrls = await Promise.all(
        employeeConversations.map(async (conversation) => {
          try {
            const convertedConversation = { ...conversation };
            if (conversation.restaurantUser?.restaurant) {
              convertedConversation.restaurantUser.restaurant = await convertImageUrls(conversation.restaurantUser.restaurant, ['profileImageUrl', 'profileCarouselUrls']);
            }
            return convertedConversation;
          } catch (error) {
            console.error('❌ Error converting employee conversation images:', error);
            return conversation; // Return original conversation if conversion fails
          }
        })
      );
      
      return res.status(200).json({ 
        success: true,
        data: conversationsWithSignedUrls 
      });
    }

    if (req.restaurantUserId) {
      const restaurantConversations = await getRestaurantUserConversations(req.restaurantUserId, type, restaurantId);
      
      // Convert employee image URLs to actual signed URLs in conversations
      const conversationsWithSignedUrls = await Promise.all(
        restaurantConversations.map(async (conversation) => {
          try {
            const convertedConversation = { ...conversation };
            if (conversation.employee) {
              convertedConversation.employee = await convertImageUrls(conversation.employee, ['profileImageUrl']);
            }
            return convertedConversation;
          } catch (error) {
            console.error('❌ Error converting restaurant conversation images:', error);
            return conversation; // Return original conversation if conversion fails
          }
        })
      );
      
      return res.status(200).json({ 
        success: true,
        data: conversationsWithSignedUrls 
      });
    }

    return res.status(400).json({ 
      success: false,
      message: 'Invalid user type or ID' 
    });

  } catch (error) {
    console.error('🔍 [Conversations API] Error:', error);
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

    if (userType === 'empresas' && (role === 'admin' || role === 'staff')) {
      
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
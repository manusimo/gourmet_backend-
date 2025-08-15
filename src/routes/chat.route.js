const express = require('express');
const { checkJoinAuthorization, checkSendMessageAuthorization } = require('../helpers/chat.js');
const { checkCompany, setUserRole } = require('../helpers/authenticateToken.js');
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
    console.log('🔍 chat-token: Request received');
    
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
        audience: 'chat' // Add audience for chat app validation
      }
    );

    console.log('✅ chat-token: Generated token for user:', userId);
    
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
    const { employeeId, restaurantUserId } = req;

    if (!employeeId && !restaurantUserId) {
      console.log('Unauthorized access: No valid user ID found');
      return res.status(403).json({ 
        success: false,
        error: 'Unauthorized access. You must be either an employee or a restaurant user.' 
      });
    }

    const conversation = await getConversationWithMessages(conversationId);

    if (!conversation) {
      console.log(`Conversation with ID ${conversationId} not found`);
      return res.status(404).json({ 
        success: false,
        error: 'Conversation not found.' 
      });
    }

    // Validate access
    if (!validateConversationAccess(conversation, employeeId, restaurantUserId)) {
      console.log(`User not authorized for conversation ${conversationId}`);
      return res.status(404).json({ 
        success: false,
        error: 'User not authorized for this conversation' 
      });
    }

    res.status(200).json({ 
      success: true,
      data: conversation.messages 
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal Server Error' 
    });
  }
});

// POST /send-message - Send a message
router.post('/send-message', async (req, res) => {
  // TODO: Temporarily disabled plan requirement for development
  // requirePlan(['pro', 'plus', 'premium']), 
  try {
    const { text, senderUserId, receiverUserId, conversationId, senderType, receiverType } = req.body;

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
    const restaurantUserId = req.restaurantUserId;

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
        type
      });
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
router.delete('/conversations/:conversationId', getEmployeeIdFromCookie, getRestaurantUserIdFromCookie, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const employeeId = req.employeeId;
    const restaurantUserId = req.restaurantUserId;

    if (!employeeId && !restaurantUserId) {
      return res.status(403).json({ 
        success: false,
        error: 'Unauthorized access.' 
      });
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

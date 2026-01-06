const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { checkJoinAuthorization, checkSendMessageAuthorization } = require('../helpers/chat.js');
const { checkCompany, setUserRole } = require('../helpers/authenticateToken.js');
const ChatService = require('../services/chatService.js');
const { sendSuccessResponse, handleChatError } = require('../utils/responseHelpers.js');
const Logger = require('../utils/logger.js');

const prisma = new PrismaClient();
const {
  getUserIdFromCookie,
  getRestaurantIdFromCookie,
  getEmployeeIdFromCookie,
  getRestaurantUserIdFromCookie
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
  deleteConversation,
  validateConversationAccess
} = require('../helpers/chatHelpers.js');

const router = express.Router();

// GET /chat-token - Generate chat socket token
router.get('/chat-token', getUserIdFromCookie, async (req, res) => {
  try {
    const { userId, userType } = req;

    const result = await ChatService.generateChatToken({ userId, userType });

    sendSuccessResponse(res, 200, null, result);
  } catch (error) {
    handleChatError(res, error, {
      context: {
        userId: req.userId,
        userType: req.userType
      },
      logger: Logger
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
router.get('/conversations/:conversationId/messages', getUserIdFromCookie, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { userId } = req;

    const result = await ChatService.getConversationMessages({ 
      conversationId, 
      userId 
    });

    sendSuccessResponse(res, 200, null, result.messages);
  } catch (error) {
    handleChatError(res, error, {
      context: {
        conversationId: req.params.conversationId,
        userId: req.userId
      },
      logger: Logger
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

    const message = await ChatService.sendMessage({
      text,
      senderUserId,
      receiverUserId,
      conversationId,
      senderType,
      receiverType
    });

    sendSuccessResponse(res, 200, 'Mensaje enviado exitosamente.', message);
  } catch (error) {
    handleChatError(res, error, {
      context: {
        conversationId: req.body?.conversationId,
        senderUserId: req.body?.senderUserId,
        receiverUserId: req.body?.receiverUserId
      },
      logger: Logger
    });
  }
});

// GET /check-conversation/:employeeId/:type - Check conversation existence
router.get('/check-conversation/:employeeId/:type', checkCompany, getRestaurantUserIdFromCookie, async (req, res) => {
  try {
    const { employeeId, type } = req.params;
    const { jobPostId } = req.query;
    const restaurantUserId = req.restaurantUserId;

    const conversation = await ChatService.checkConversation({
      employeeId,
      type,
      restaurantUserId,
      jobPostId
    });

    if (conversation) {
      sendSuccessResponse(res, 200, 'Conversación encontrada.', conversation);
    } else {
      sendErrorResponse(res, 404, 'Conversación no encontrada.');
    }
  } catch (error) {
    handleChatError(res, error, {
      context: {
        employeeId: req.params.employeeId,
        type: req.params.type,
        jobPostId: req.query.jobPostId,
        restaurantUserId: req.restaurantUserId
      },
      logger: Logger
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

    const conversation = await ChatService.createOrEnsureConversation({
      userId,
      employeeId,
      jobPostId,
      talentPoolId,
      type,
      restaurantId
    });

    sendSuccessResponse(res, 200, 'Conversación creada/asegurada.', conversation);
  } catch (error) {
    handleChatError(res, error, {
      context: {
        userId: req.userId,
        employeeId: req.body?.employeeId,
        jobPostId: req.body?.jobPostId,
        talentPoolId: req.body?.talentPoolId,
        type: req.body?.type,
        restaurantId: req.body?.restaurantId
      },
      logger: Logger
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
router.get('/conversations', getUserIdFromCookie, getRestaurantUserIdFromCookie, getEmployeeIdFromCookie, async (req, res) => {
  try {
    const { type, restaurantId } = req.query;

    const conversations = await ChatService.getConversations({
      employeeId: req.employeeId,
      restaurantUserId: req.restaurantUserId,
      type,
      restaurantId
    });

    sendSuccessResponse(res, 200, null, conversations);
  } catch (error) {
    handleChatError(res, error, {
      context: {
        employeeId: req.employeeId,
        restaurantUserId: req.restaurantUserId,
        type: req.query?.type,
        restaurantId: req.query?.restaurantId
      },
      logger: Logger
    });
  }
});

// DELETE /conversations/:conversationId - Delete conversation
router.delete('/conversations/:conversationId', getUserIdFromCookie, getRestaurantUserIdFromCookie, getEmployeeIdFromCookie, async (req, res) => {
  try {
    const { conversationId } = req.params;

    await ChatService.deleteConversation({
      conversationId,
      userId: req.userId,
      userType: req.userType,
      role: req.role,
      employeeId: req.employeeId,
      restaurantUserId: req.restaurantUserId
    });

    sendSuccessResponse(res, 200, 'Conversación eliminada exitosamente.');
  } catch (error) {
    handleChatError(res, error, {
      context: {
        conversationId: req.params.conversationId,
        userId: req.userId,
        userType: req.userType,
        role: req.role
      },
      logger: Logger
    });
  }
});

module.exports = router;
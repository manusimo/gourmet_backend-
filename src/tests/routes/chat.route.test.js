import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';

// Mock the helpers
const mockChatHelpers = {
  getConversationById: jest.fn(),
  getConversationWithMessages: jest.fn(),
  validateEmployeeAccess: jest.fn(),
  validateRestaurantUserAccess: jest.fn(),
  createMessage: jest.fn(),
  checkTalentConversation: jest.fn(),
  checkApplicationConversation: jest.fn(),
  findConversationByJobPost: jest.fn(),
  findConversationByTalentPool: jest.fn(),
  createConversation: jest.fn(),
  getRestaurantConversations: jest.fn(),
  getEmployeeConversations: jest.fn(),
  getRestaurantUserConversations: jest.fn(),
  deleteConversation: jest.fn(),
  validateConversationAccess: jest.fn(),
};

const mockChat = {
  checkJoinAuthorization: jest.fn(),
  checkSendMessageAuthorization: jest.fn(),
};

const mockAuthenticateToken = {
  checkCompany: jest.fn((req, res, next) => next()),
  setUserRole: jest.fn((req, res, next) => {
    req.userRole = 'admin';
    next();
  }),
};

const mockCookies = {
  getUserIdFromCookie: jest.fn((req, res, next) => {
    req.userId = 123;
    next();
  }),
  getRestaurantIdFromCookie: jest.fn((req, res, next) => {
    req.restaurantId = 456;
    next();
  }),
  getEmployeeIdFromCookie: jest.fn((req, res, next) => {
    req.employeeId = 789;
    next();
  }),
  getRestaurantUserIdFromCookie: jest.fn((req, res, next) => {
    req.restaurantUserId = 101;
    next();
  }),
  validateTokenAndIdentifyUser: jest.fn((req, res, next) => {
    req.employeeId = 789;
    req.restaurantUserId = 101;
    next();
  }),
};

const mockRequirePlan = {
  requirePlan: jest.fn(() => (req, res, next) => next()),
};

// Mock all the imports
jest.mock('../../helpers/chatHelpers.js', () => mockChatHelpers);
jest.mock('../../helpers/chat.js', () => mockChat);
jest.mock('../../helpers/authenticateToken.js', () => mockAuthenticateToken);
jest.mock('../../helpers/cookies.js', () => mockCookies);
jest.mock('../../middleware/checkPlan.js', () => mockRequirePlan);

// Import the router after mocking
import chatRouter from '../../routes/chat.route.js';

describe('Chat Routes', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/', chatRouter);
  });

  describe('GET /conversations/:conversationId', () => {
    it('should return conversation by ID successfully', async () => {
      const mockConversation = {
        id: 1,
        employeeId: 789,
        restaurantUserId: 101,
        type: 'application'
      };
      mockChatHelpers.getConversationById.mockResolvedValue(mockConversation);

      const response = await request(app)
        .get('/conversations/1')
        .expect(200);

      expect(mockChatHelpers.getConversationById).toHaveBeenCalledWith('1');
      expect(response.body).toEqual({
        success: true,
        data: mockConversation
      });
    });

    it('should return 404 when conversation not found', async () => {
      mockChatHelpers.getConversationById.mockResolvedValue(null);

      const response = await request(app)
        .get('/conversations/999')
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        error: 'Conversation not found'
      });
    });

    it('should handle errors gracefully', async () => {
      mockChatHelpers.getConversationById.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/conversations/1')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Internal Server Error'
      });
    });
  });

  describe('GET /conversations/:conversationId/messages', () => {
    it('should return conversation messages successfully', async () => {
      const mockConversation = {
        id: 1,
        employeeId: 789,
        restaurantUserId: 101,
        messages: [
          { id: 1, text: 'Hello', senderUserId: 789 },
          { id: 2, text: 'Hi there', senderUserId: 101 }
        ]
      };
      mockChatHelpers.getConversationWithMessages.mockResolvedValue(mockConversation);
      mockChatHelpers.validateConversationAccess.mockReturnValue(true);

      const response = await request(app)
        .get('/conversations/1/messages')
        .expect(200);

      expect(mockChatHelpers.getConversationWithMessages).toHaveBeenCalledWith('1');
      expect(mockChatHelpers.validateConversationAccess).toHaveBeenCalledWith(mockConversation, 789, 101);
      expect(response.body).toEqual({
        success: true,
        data: mockConversation.messages
      });
    });

    it('should return 403 when no valid user ID found', async () => {
      // Simulate no user IDs
      mockCookies.validateTokenAndIdentifyUser.mockImplementation((req, res, next) => {
        // Don't set any user IDs
        next();
      });

      const response = await request(app)
        .get('/conversations/1/messages')
        .expect(403);

      expect(response.body).toEqual({
        success: false,
        error: 'Unauthorized access. You must be either an employee or a restaurant user.'
      });
    });

    it('should return 404 when conversation not found', async () => {
      mockChatHelpers.getConversationWithMessages.mockResolvedValue(null);

      const response = await request(app)
        .get('/conversations/999/messages')
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        error: 'Conversation not found.'
      });
    });

    it('should return 404 when user not authorized for conversation', async () => {
      const mockConversation = {
        id: 1,
        employeeId: 789,
        restaurantUserId: 101
      };
      mockChatHelpers.getConversationWithMessages.mockResolvedValue(mockConversation);
      mockChatHelpers.validateConversationAccess.mockReturnValue(false);

      const response = await request(app)
        .get('/conversations/1/messages')
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        error: 'User not authorized for this conversation'
      });
    });

    it('should handle errors gracefully', async () => {
      mockChatHelpers.getConversationWithMessages.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/conversations/1/messages')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Internal Server Error'
      });
    });
  });

  describe('POST /send-message', () => {
    it('should send message successfully', async () => {
      const mockConversation = { id: 1, employeeId: 789, restaurantUserId: 101 };
      const mockMessage = {
        id: 1,
        text: 'Hello there',
        senderUserId: 789,
        receiverUserId: 101,
        conversationId: 1,
        senderType: 'employee',
        receiverType: 'restaurant'
      };

      mockChatHelpers.getConversationById.mockResolvedValue(mockConversation);
      mockChatHelpers.createMessage.mockResolvedValue(mockMessage);

      const messageData = {
        text: 'Hello there',
        senderUserId: 789,
        receiverUserId: 101,
        conversationId: 1,
        senderType: 'employee',
        receiverType: 'restaurant'
      };

      const response = await request(app)
        .post('/send-message')
        .send(messageData)
        .expect(200);

      expect(mockChatHelpers.getConversationById).toHaveBeenCalledWith(1);
      expect(mockChatHelpers.createMessage).toHaveBeenCalledWith(messageData);
      expect(response.body).toEqual({
        success: true,
        message: 'Message sent successfully.',
        data: mockMessage
      });
    });

    it('should return 404 when conversation not found', async () => {
      mockChatHelpers.getConversationById.mockResolvedValue(null);

      const response = await request(app)
        .post('/send-message')
        .send({
          text: 'Hello',
          conversationId: 999,
          senderUserId: 789,
          receiverUserId: 101
        })
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        error: 'Conversation not found.'
      });
    });

    it('should handle errors gracefully', async () => {
      mockChatHelpers.getConversationById.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/send-message')
        .send({
          text: 'Hello',
          conversationId: 1,
          senderUserId: 789,
          receiverUserId: 101
        })
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Failed to send message.'
      });
    });
  });

  describe('GET /check-conversation/:employeeId/:type', () => {
    it('should return talent conversation when found', async () => {
      const mockConversation = {
        id: 1,
        employeeId: 789,
        restaurantUserId: 101,
        type: 'talent'
      };
      mockChatHelpers.checkTalentConversation.mockResolvedValue(mockConversation);

      const response = await request(app)
        .get('/check-conversation/789/talent')
        .expect(200);

      expect(mockChatHelpers.checkTalentConversation).toHaveBeenCalledWith(789, 101);
      expect(response.body).toEqual({
        success: true,
        message: 'Conversation found.',
        data: mockConversation
      });
    });

    it('should return application conversation when found', async () => {
      const mockConversation = {
        id: 1,
        employeeId: 789,
        restaurantUserId: 101,
        type: 'application'
      };
      mockChatHelpers.checkApplicationConversation.mockResolvedValue(mockConversation);

      const response = await request(app)
        .get('/check-conversation/789/application')
        .expect(200);

      expect(mockChatHelpers.checkApplicationConversation).toHaveBeenCalledWith(789, 101);
      expect(response.body).toEqual({
        success: true,
        message: 'Conversation found.',
        data: mockConversation
      });
    });

    it('should return 400 when restaurant user ID not found', async () => {
      // Simulate missing restaurantUserId
      mockCookies.getRestaurantUserIdFromCookie.mockImplementation((req, res, next) => {
        // Don't set req.restaurantUserId
        next();
      });

      const response = await request(app)
        .get('/check-conversation/789/talent')
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: 'Restaurant user ID not found in cookies.'
      });
    });

    it('should return 404 when conversation not found', async () => {
      mockChatHelpers.checkTalentConversation.mockResolvedValue(null);

      const response = await request(app)
        .get('/check-conversation/789/talent')
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        message: 'Conversation not found.'
      });
    });

    it('should handle errors gracefully', async () => {
      mockChatHelpers.checkTalentConversation.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/check-conversation/789/talent')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Failed to check conversation.'
      });
    });
  });

  describe('POST /create-conversation', () => {
    it('should create conversation with job post successfully', async () => {
      const mockConversation = {
        id: 1,
        employeeId: 789,
        jobPostId: 123,
        restaurantUserId: 101,
        type: 'application'
      };
      mockChatHelpers.findConversationByJobPost.mockResolvedValue(null);
      mockChatHelpers.createConversation.mockResolvedValue(mockConversation);

      const conversationData = {
        employeeId: '789',
        jobPostId: 123,
        type: 'application'
      };

      const response = await request(app)
        .post('/create-conversation')
        .send(conversationData)
        .expect(200);

      expect(mockChatHelpers.findConversationByJobPost).toHaveBeenCalledWith(789, 123, 101, 'application');
      expect(mockChatHelpers.createConversation).toHaveBeenCalledWith({
        employeeId: 789,
        jobPostId: 123,
        restaurantUserId: 101,
        type: 'application'
      });
      expect(response.body).toEqual({
        success: true,
        message: 'Conversation created/ensured.',
        data: mockConversation
      });
    });

    it('should create conversation with talent pool successfully', async () => {
      const mockConversation = {
        id: 1,
        employeeId: 789,
        talentPoolId: 456,
        restaurantUserId: 101,
        type: 'talent'
      };
      mockChatHelpers.findConversationByTalentPool.mockResolvedValue(null);
      mockChatHelpers.createConversation.mockResolvedValue(mockConversation);

      const conversationData = {
        employeeId: '789',
        talentPoolId: 456,
        type: 'talent'
      };

      const response = await request(app)
        .post('/create-conversation')
        .send(conversationData)
        .expect(200);

      expect(mockChatHelpers.findConversationByTalentPool).toHaveBeenCalledWith(789, 456, 101, 'talent');
      expect(mockChatHelpers.createConversation).toHaveBeenCalledWith({
        employeeId: 789,
        talentPoolId: 456,
        restaurantUserId: 101,
        type: 'talent'
      });
      expect(response.body).toEqual({
        success: true,
        message: 'Conversation created/ensured.',
        data: mockConversation
      });
    });

    it('should return existing conversation when found', async () => {
      const mockConversation = {
        id: 1,
        employeeId: 789,
        jobPostId: 123,
        restaurantUserId: 101,
        type: 'application'
      };
      mockChatHelpers.findConversationByJobPost.mockResolvedValue(mockConversation);

      const conversationData = {
        employeeId: '789',
        jobPostId: 123,
        type: 'application'
      };

      const response = await request(app)
        .post('/create-conversation')
        .send(conversationData)
        .expect(200);

      expect(mockChatHelpers.findConversationByJobPost).toHaveBeenCalledWith(789, 123, 101, 'application');
      expect(mockChatHelpers.createConversation).not.toHaveBeenCalled();
      expect(response.body).toEqual({
        success: true,
        message: 'Conversation created/ensured.',
        data: mockConversation
      });
    });

    it('should handle errors gracefully', async () => {
      mockChatHelpers.findConversationByJobPost.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/create-conversation')
        .send({
          employeeId: '789',
          jobPostId: 123,
          type: 'application'
        })
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Failed to create/ensure conversation.'
      });
    });
  });

  describe('GET /conversations/:employeeId/:type', () => {
    it('should return restaurant conversations successfully', async () => {
      const mockConversations = [
        { id: 1, employeeId: 789, type: 'application' },
        { id: 2, employeeId: 789, type: 'talent' }
      ];
      mockChatHelpers.getRestaurantConversations.mockResolvedValue(mockConversations);

      const response = await request(app)
        .get('/conversations/789/application')
        .expect(200);

      expect(mockChatHelpers.getRestaurantConversations).toHaveBeenCalledWith(101, 789, 'application');
      expect(response.body).toEqual({
        success: true,
        data: mockConversations
      });
    });

    it('should handle errors gracefully', async () => {
      mockChatHelpers.getRestaurantConversations.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/conversations/789/application')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Failed to fetch conversations.'
      });
    });
  });

  describe('GET /conversations', () => {
    it('should return employee conversations successfully', async () => {
      const mockConversations = [
        { id: 1, restaurantUserId: 101, type: 'application' },
        { id: 2, restaurantUserId: 102, type: 'talent' }
      ];
      mockChatHelpers.getEmployeeConversations.mockResolvedValue(mockConversations);

      // Set employeeId in the middleware
      mockCookies.validateTokenAndIdentifyUser.mockImplementation((req, res, next) => {
        req.employeeId = 789;
        req.restaurantUserId = null;
        next();
      });

      const response = await request(app)
        .get('/conversations')
        .query({ type: 'application' })
        .expect(200);

      expect(mockChatHelpers.getEmployeeConversations).toHaveBeenCalledWith(789, 'application');
      expect(response.body).toEqual({
        success: true,
        data: mockConversations
      });
    });

    it('should return restaurant user conversations successfully', async () => {
      const mockConversations = [
        { id: 1, employeeId: 789, type: 'application' },
        { id: 2, employeeId: 790, type: 'talent' }
      ];
      mockChatHelpers.getRestaurantUserConversations.mockResolvedValue(mockConversations);

      // Set restaurantUserId in the middleware
      mockCookies.validateTokenAndIdentifyUser.mockImplementation((req, res, next) => {
        req.employeeId = null;
        req.restaurantUserId = 101;
        next();
      });

      const response = await request(app)
        .get('/conversations')
        .query({ type: 'application' })
        .expect(200);

      expect(mockChatHelpers.getRestaurantUserConversations).toHaveBeenCalledWith(101, 'application');
      expect(response.body).toEqual({
        success: true,
        data: mockConversations
      });
    });

    it('should return 400 when no valid user type found', async () => {
      // Don't set any user IDs
      mockCookies.validateTokenAndIdentifyUser.mockImplementation((req, res, next) => {
        req.employeeId = null;
        req.restaurantUserId = null;
        next();
      });

      const response = await request(app)
        .get('/conversations')
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        message: 'Invalid user type or ID'
      });
    });

    it('should handle errors gracefully', async () => {
      mockChatHelpers.getEmployeeConversations.mockRejectedValue(new Error('Database error'));

      // Set employeeId in the middleware
      mockCookies.validateTokenAndIdentifyUser.mockImplementation((req, res, next) => {
        req.employeeId = 789;
        req.restaurantUserId = null;
        next();
      });

      const response = await request(app)
        .get('/conversations')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        message: 'Internal Server Error'
      });
    });
  });

  describe('DELETE /conversations/:conversationId', () => {
    it('should delete conversation successfully', async () => {
      const mockConversation = {
        id: 1,
        employeeId: 789,
        restaurantUserId: 101
      };
      mockChatHelpers.getConversationWithMessages.mockResolvedValue(mockConversation);
      mockChatHelpers.deleteConversation.mockResolvedValue(mockConversation);

      const response = await request(app)
        .delete('/conversations/1')
        .expect(200);

      expect(mockChatHelpers.getConversationWithMessages).toHaveBeenCalledWith('1');
      expect(mockChatHelpers.deleteConversation).toHaveBeenCalledWith('1');
      expect(response.body).toEqual({
        success: true,
        message: 'Conversation deleted successfully.'
      });
    });

    it('should return 403 when no user IDs provided', async () => {
      // Don't set any user IDs
      mockCookies.getEmployeeIdFromCookie.mockImplementation((req, res, next) => {
        // Don't set req.employeeId
        next();
      });
      mockCookies.getRestaurantUserIdFromCookie.mockImplementation((req, res, next) => {
        // Don't set req.restaurantUserId
        next();
      });

      const response = await request(app)
        .delete('/conversations/1')
        .expect(403);

      expect(response.body).toEqual({
        success: false,
        error: 'Unauthorized access.'
      });
    });

    it('should return 404 when conversation not found', async () => {
      mockChatHelpers.getConversationWithMessages.mockResolvedValue(null);

      const response = await request(app)
        .delete('/conversations/999')
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        error: 'Conversation not found.'
      });
    });

    it('should handle errors gracefully', async () => {
      mockChatHelpers.getConversationWithMessages.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .delete('/conversations/1')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Failed to delete conversation.'
      });
    });
  });

  describe('Authentication and Authorization', () => {
    it('should require company authentication for check conversation route', async () => {
      const response = await request(app)
        .get('/check-conversation/789/talent')
        .expect(200);

      expect(mockAuthenticateToken.checkCompany).toHaveBeenCalled();
      expect(mockCookies.getRestaurantUserIdFromCookie).toHaveBeenCalled();
    });

    it('should require company authentication for create conversation route', async () => {
      const response = await request(app)
        .post('/create-conversation')
        .send({ employeeId: '789', type: 'application' })
        .expect(200);

      expect(mockAuthenticateToken.checkCompany).toHaveBeenCalled();
      expect(mockCookies.getUserIdFromCookie).toHaveBeenCalled();
      expect(mockCookies.getRestaurantUserIdFromCookie).toHaveBeenCalled();
    });

    it('should require company authentication for employee conversations route', async () => {
      const response = await request(app)
        .get('/conversations/789/application')
        .expect(200);

      expect(mockAuthenticateToken.checkCompany).toHaveBeenCalled();
      expect(mockCookies.getUserIdFromCookie).toHaveBeenCalled();
    });

    it('should require user identification for messages route', async () => {
      const response = await request(app)
        .get('/conversations/1/messages')
        .expect(200);

      expect(mockCookies.validateTokenAndIdentifyUser).toHaveBeenCalled();
    });

    it('should require user identification for all conversations route', async () => {
      const response = await request(app)
        .get('/conversations')
        .expect(200);

      expect(mockCookies.validateTokenAndIdentifyUser).toHaveBeenCalled();
    });
  });

  describe('Plan Management', () => {
    it('should require plan for send message route', async () => {
      const response = await request(app)
        .post('/send-message')
        .send({
          text: 'Hello',
          conversationId: 1,
          senderUserId: 789,
          receiverUserId: 101
        })
        .expect(200);

      expect(mockRequirePlan.requirePlan).toHaveBeenCalledWith(['pro', 'plus', 'premium']);
    });

    it('should require plan for create conversation route', async () => {
      const response = await request(app)
        .post('/create-conversation')
        .send({ employeeId: '789', type: 'application' })
        .expect(200);

      expect(mockRequirePlan.requirePlan).toHaveBeenCalledWith(['pro', 'plus', 'premium']);
    });
  });

  describe('Input Validation', () => {
    it('should handle invalid conversation ID', async () => {
      const response = await request(app)
        .get('/conversations/invalid')
        .expect(200); // Route doesn't validate conversation ID format

      expect(mockChatHelpers.getConversationById).toHaveBeenCalledWith('invalid');
    });

    it('should handle missing required fields in send message', async () => {
      const response = await request(app)
        .post('/send-message')
        .send({ text: 'Hello' }) // Missing required fields
        .expect(200); // Route doesn't validate required fields

      expect(mockChatHelpers.getConversationById).toHaveBeenCalledWith(undefined);
    });

    it('should handle missing required fields in create conversation', async () => {
      const response = await request(app)
        .post('/create-conversation')
        .send({}) // Missing required fields
        .expect(200); // Route doesn't validate required fields

      expect(mockChatHelpers.findConversationByJobPost).toHaveBeenCalledWith(NaN, undefined, 101, undefined);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      mockChatHelpers.getConversationById.mockRejectedValue(new Error('Database connection failed'));

      const response = await request(app)
        .get('/conversations/1')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Internal Server Error'
      });
    });

    it('should handle conversation access validation errors', async () => {
      mockChatHelpers.getConversationWithMessages.mockResolvedValue({
        id: 1,
        employeeId: 789,
        restaurantUserId: 101
      });
      mockChatHelpers.validateConversationAccess.mockImplementation(() => {
        throw new Error('Validation error');
      });

      const response = await request(app)
        .get('/conversations/1/messages')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Internal Server Error'
      });
    });

    it('should handle message creation errors', async () => {
      mockChatHelpers.getConversationById.mockResolvedValue({ id: 1 });
      mockChatHelpers.createMessage.mockRejectedValue(new Error('Message creation failed'));

      const response = await request(app)
        .post('/send-message')
        .send({
          text: 'Hello',
          conversationId: 1,
          senderUserId: 789,
          receiverUserId: 101
        })
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Failed to send message.'
      });
    });

    it('should handle conversation deletion errors', async () => {
      mockChatHelpers.getConversationWithMessages.mockResolvedValue({ id: 1 });
      mockChatHelpers.deleteConversation.mockRejectedValue(new Error('Deletion failed'));

      const response = await request(app)
        .delete('/conversations/1')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Failed to delete conversation.'
      });
    });
  });
}); 
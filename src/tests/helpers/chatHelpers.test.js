require('@jest/globals');
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
} = require('../../helpers/chatHelpers.js');

// Mock Prisma
const mockPrisma = {
  conversation: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  },
  message: {
    create: jest.fn(),
    deleteMany: jest.fn(),
  },
  employee: {
    findUnique: jest.fn(),
  },
  restaurantUser: {
    findUnique: jest.fn(),
  },
};

// Mock the prisma import
jest.mock('../../db.js', () => ({
  prisma: mockPrisma,
}));

describe('Chat Helpers', () => {
  let helpers;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    helpers = require('../../helpers/chatHelpers.js');
  });

  describe('getConversationById', () => {
    it('should return conversation when found', async () => {
      const mockConversation = {
        id: 1,
        employeeId: 123,
        restaurantUserId: 456,
        type: 'application'
      };
      mockPrisma.conversation.findFirst.mockResolvedValue(mockConversation);

      const result = await helpers.getConversationById('1');

      expect(mockPrisma.conversation.findFirst).toHaveBeenCalledWith({
        where: { 
          id: 1,
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
      expect(result).toEqual(mockConversation);
    });

    it('should return null when conversation not found', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue(null);

      const result = await helpers.getConversationById('1');

      expect(result).toBeNull();
    });
  });

  describe('getConversationWithMessages', () => {
    it('should return conversation with messages', async () => {
      const mockConversation = {
        id: 1,
        employeeId: 123,
        restaurantUserId: 456,
        messages: [
          { id: 1, text: 'Hello', senderUserId: 123 },
          { id: 2, text: 'Hi there', senderUserId: 456 }
        ]
      };
      mockPrisma.conversation.findFirst.mockResolvedValue(mockConversation);

      const result = await helpers.getConversationWithMessages('1');

      expect(mockPrisma.conversation.findFirst).toHaveBeenCalledWith({
        where: { 
          id: 1,
          deletedAt: null
        },
        include: {
          messages: true
        },
      });
      expect(result).toEqual(mockConversation);
    });

    it('should return null when conversation not found', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue(null);

      const result = await helpers.getConversationWithMessages('1');

      expect(result).toBeNull();
    });
  });

  describe('validateEmployeeAccess', () => {
    it('should return true when employee has access', () => {
      const conversation = { employeeId: 123 };
      const employeeId = 123;

      const result = helpers.validateEmployeeAccess(conversation, employeeId);

      expect(result).toBe(true);
    });

    it('should return false when employee does not have access', () => {
      const conversation = { employeeId: 123 };
      const employeeId = 456;

      const result = helpers.validateEmployeeAccess(conversation, employeeId);

      expect(result).toBe(false);
    });
  });

  describe('validateRestaurantUserAccess', () => {
    it('should return true when restaurant user has access', () => {
      const conversation = { restaurantUserId: 456 };
      const restaurantUserId = 456;

      const result = helpers.validateRestaurantUserAccess(conversation, restaurantUserId);

      expect(result).toBe(true);
    });

    it('should return false when restaurant user does not have access', () => {
      const conversation = { restaurantUserId: 456 };
      const restaurantUserId = 123;

      const result = helpers.validateRestaurantUserAccess(conversation, restaurantUserId);

      expect(result).toBe(false);
    });
  });

  describe('createMessage', () => {
    it('should create message successfully', async () => {
      const mockMessage = {
        id: 1,
        text: 'Hello there',
        conversationId: 1,
        senderUserId: 123,
        receiverUserId: 456,
        senderType: 'employee',
        receiverType: 'restaurant'
      };

      // Mock successful conversation lookup
      mockPrisma.conversation.findFirst.mockResolvedValue({ id: 1 });
      mockPrisma.message.create.mockResolvedValue(mockMessage);

      const messageData = {
        text: 'Hello there',
        conversationId: '1',
        senderUserId: '123',
        receiverUserId: '456',
        senderType: 'employee',
        receiverType: 'restaurant'
      };

      const result = await helpers.createMessage(messageData);

      expect(mockPrisma.message.create).toHaveBeenCalledWith({
        data: {
          text: 'Hello there',
          conversation: { connect: { id: 1 } },
          senderEmployee: { connect: { id: 123 } },
          receiverRestaurantUser: { connect: { id: 456 } },
        },
      });
      expect(result).toEqual(mockMessage);
    });
  });

  describe('checkTalentConversation', () => {
    it('should return conversation when found', async () => {
      const mockConversation = {
        id: 1,
        employeeId: 123,
        restaurantUserId: 456,
        type: 'talent'
      };
      mockPrisma.conversation.findFirst.mockResolvedValue(mockConversation);

      const result = await helpers.checkTalentConversation('123', '456');

      expect(mockPrisma.conversation.findFirst).toHaveBeenCalledWith({
        where: {
          employeeId: 123,
          restaurantUserId: 456,
          type: 'talent',
          deletedAt: null
        },
      });
      expect(result).toEqual(mockConversation);
    });

    it('should return null when conversation not found', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue(null);

      const result = await helpers.checkTalentConversation('123', '456');

      expect(result).toBeNull();
    });
  });

  describe('checkApplicationConversation', () => {
    it('should return conversation when found', async () => {
      const mockConversation = {
        id: 1,
        employeeId: 123,
        restaurantUserId: 456,
        type: 'applicant'
      };
      mockPrisma.conversation.findFirst.mockResolvedValue(mockConversation);

      const result = await helpers.checkApplicationConversation('123', '456');

      expect(mockPrisma.conversation.findFirst).toHaveBeenCalledWith({
        where: {
          employeeId: 123,
          restaurantUserId: 456,
          type: 'applicant',
          deletedAt: null
        },
      });
      expect(result).toEqual(mockConversation);
    });

    it('should return null when conversation not found', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue(null);

      const result = await helpers.checkApplicationConversation('123', '456');

      expect(result).toBeNull();
    });
  });

  describe('findConversationByJobPost', () => {
    it('should return conversation when found', async () => {
      const mockConversation = {
        id: 1,
        employeeId: 123,
        jobOfferId: 789,
        restaurantUserId: 456,
        type: 'application'
      };
      mockPrisma.conversation.findFirst.mockResolvedValue(mockConversation);

      const result = await helpers.findConversationByJobPost('123', 789, 456, 'application');

      expect(mockPrisma.conversation.findFirst).toHaveBeenCalledWith({
        where: {
          employeeId: 123,
          jobOfferId: 789,
          restaurantUserId: 456,
          type: 'application',
          deletedAt: null
        },
      });
      expect(result).toEqual(mockConversation);
    });

    it('should return null when conversation not found', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue(null);

      const result = await helpers.findConversationByJobPost('123', 789, 456, 'application');

      expect(result).toBeNull();
    });
  });

  describe('findConversationByTalentPool', () => {
    it('should return conversation when found', async () => {
      const mockConversation = {
        id: 1,
        employeeId: 123,
        talentPoolId: 999,
        restaurantUserId: 456,
        type: 'talent'
      };
      mockPrisma.conversation.findFirst.mockResolvedValue(mockConversation);

      const result = await helpers.findConversationByTalentPool('123', 999, 456, 'talent');

      expect(mockPrisma.conversation.findFirst).toHaveBeenCalledWith({
        where: {
          employeeId: 123,
          talentPoolId: 999,
          restaurantUserId: 456,
          type: 'talent',
          deletedAt: null
        },
      });
      expect(result).toEqual(mockConversation);
    });

    it('should return null when conversation not found', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue(null);

      const result = await helpers.findConversationByTalentPool('123', 999, 456, 'talent');

      expect(result).toBeNull();
    });
  });

  describe('createConversation', () => {
    it('should create conversation successfully', async () => {
      const mockConversation = {
        id: 1,
        employeeId: 123,
        jobOfferId: 789,
        restaurantUserId: 456,
        type: 'application'
      };

      // Mock successful employee and restaurant user lookups
      mockPrisma.employee.findUnique.mockResolvedValue({ id: 123 });
      mockPrisma.restaurantUser.findUnique.mockResolvedValue({ id: 456 });
      mockPrisma.conversation.create.mockResolvedValue(mockConversation);

      const conversationData = {
        employeeId: '123',
        jobPostId: 789,
        restaurantUserId: 456,
        type: 'application'
      };

      const result = await helpers.createConversation(conversationData);

      expect(mockPrisma.conversation.create).toHaveBeenCalledWith({
        data: {
          employeeId: 123,
          jobOfferId: 789,
          restaurantUserId: 456,
          type: 'application'
        },
      });
      expect(result).toEqual(mockConversation);
    });
  });

  describe('getRestaurantConversations', () => {
    it('should return restaurant conversations', async () => {
      const mockConversations = [
        { id: 1, employeeId: 123, type: 'application' },
        { id: 2, employeeId: 124, type: 'talent' }
      ];
      mockPrisma.conversation.findMany.mockResolvedValue(mockConversations);

      const result = await helpers.getRestaurantConversations('456', '123', 'APPLICATION');

      expect(mockPrisma.conversation.findMany).toHaveBeenCalledWith({
        where: {
          restaurantUserId: 456,
          employeeId: 123,
          type: 'application',
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
      expect(result).toEqual(mockConversations);
    });

    it('should return empty array when no conversations found', async () => {
      mockPrisma.conversation.findMany.mockResolvedValue([]);

      const result = await helpers.getRestaurantConversations('456', '123', 'APPLICATION');

      expect(result).toEqual([]);
    });
  });

  describe('getEmployeeConversations', () => {
    it('should return employee conversations', async () => {
      const mockConversations = [
        { id: 1, restaurantUserId: 456, type: 'application' },
        { id: 2, restaurantUserId: 457, type: 'talent' }
      ];
      mockPrisma.conversation.findMany.mockResolvedValue(mockConversations);

      const result = await helpers.getEmployeeConversations(123, 'application');

      expect(mockPrisma.conversation.findMany).toHaveBeenCalledWith({
        where: {
          employeeId: 123,
          type: 'application',
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
      expect(result).toEqual(mockConversations);
    });

    it('should use "none" as default type', async () => {
      mockPrisma.conversation.findMany.mockResolvedValue([]);

      await helpers.getEmployeeConversations(123);

      expect(mockPrisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            type: 'none'
          })
        })
      );
    });
  });

  describe('getRestaurantUserConversations', () => {
    it('should return restaurant user conversations', async () => {
      const mockConversations = [
        { id: 1, employeeId: 123, type: 'application' },
        { id: 2, employeeId: 124, type: 'talent' }
      ];
      mockPrisma.conversation.findMany.mockResolvedValue(mockConversations);

      const result = await helpers.getRestaurantUserConversations('456', 'application');

      expect(mockPrisma.conversation.findMany).toHaveBeenCalledWith({
        where: {
          restaurantUserId: 456,
          type: 'application',
          deletedAt: null
        },
        include: {
          messages: true,
          jobOffer: true,
          employee: true,
        },
      });
      expect(result).toEqual(mockConversations);
    });

    it('should use empty string as default type', async () => {
      mockPrisma.conversation.findMany.mockResolvedValue([]);

      await helpers.getRestaurantUserConversations('456');

      expect(mockPrisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            type: ''
          })
        })
      );
    });
  });

  describe('deleteConversation', () => {
    it('should delete conversation successfully', async () => {
      const mockDeletedConversation = { id: 1, employeeId: 123 };

      // Mock successful conversation lookup
      mockPrisma.conversation.findFirst.mockResolvedValue({ id: 1 });
      mockPrisma.message.deleteMany.mockResolvedValue({ count: 5 });
      mockPrisma.conversation.delete.mockResolvedValue(mockDeletedConversation);

      const result = await helpers.deleteConversation('1');

      expect(mockPrisma.message.deleteMany).toHaveBeenCalledWith({
        where: { conversationId: 1 },
      });
      expect(mockPrisma.conversation.delete).toHaveBeenCalledWith({
        where: { id: 1 },
      });
      expect(result).toEqual(mockDeletedConversation);
    });

    it('should handle database errors', async () => {
      mockPrisma.message.deleteMany.mockRejectedValue(new Error('Database error'));

      await expect(helpers.deleteConversation('1')).rejects.toThrow('Database error');
    });
  });

  describe('validateConversationAccess', () => {
    it('should return true when employee has access', () => {
      const conversation = { employeeId: 123, restaurantUserId: 456 };
      const employeeId = 123;
      const restaurantUserId = null;

      const result = helpers.validateConversationAccess(conversation, employeeId, restaurantUserId);

      expect(result).toBe(true);
    });

    it('should return true when restaurant user has access', () => {
      const conversation = { employeeId: 123, restaurantUserId: 456 };
      const employeeId = null;
      const restaurantUserId = 456;

      const result = helpers.validateConversationAccess(conversation, employeeId, restaurantUserId);

      expect(result).toBe(true);
    });

    it('should return false when employee does not have access', () => {
      const conversation = { employeeId: 123, restaurantUserId: 456 };
      const employeeId = 999;
      const restaurantUserId = null;

      const result = helpers.validateConversationAccess(conversation, employeeId, restaurantUserId);

      expect(result).toBe(false);
    });

    it('should return false when restaurant user does not have access', () => {
      const conversation = { employeeId: 123, restaurantUserId: 456 };
      const employeeId = null;
      const restaurantUserId = 999;

      const result = helpers.validateConversationAccess(conversation, employeeId, restaurantUserId);

      expect(result).toBe(false);
    });
  });
}); 
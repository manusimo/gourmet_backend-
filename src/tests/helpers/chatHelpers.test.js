import { jest } from '@jest/globals';
import {
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
} from '../../helpers/chatHelpers.js';

// Mock Prisma
const mockPrisma = {
  conversation: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
    delete: jest.fn(),
  },
  message: {
    create: jest.fn(),
    findMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  talentPool: {
    findFirst: jest.fn(),
  },
  application: {
    findFirst: jest.fn(),
  },
  employee: {
    findUnique: jest.fn(),
  },
  restaurantUser: {
    findUnique: jest.fn(),
  },
  $transaction: jest.fn(),
};

// Mock the prisma import
jest.mock('../../db.js', () => ({
  prisma: mockPrisma,
}));

describe('Chat Helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getConversationById', () => {
    it('should return conversation when found', async () => {
      const mockConversation = {
        id: 1,
        employeeId: 123,
        restaurantUserId: 456,
        type: 'application'
      };
      mockPrisma.conversation.findUnique.mockResolvedValue(mockConversation);

      const result = await getConversationById('1');

      expect(mockPrisma.conversation.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
      });
      expect(result).toEqual(mockConversation);
    });

    it('should return null when conversation not found', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue(null);

      const result = await getConversationById('1');

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
      mockPrisma.conversation.findUnique.mockResolvedValue(mockConversation);

      const result = await getConversationWithMessages('1');

      expect(mockPrisma.conversation.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
          },
        },
      });
      expect(result).toEqual(mockConversation);
    });

    it('should return null when conversation not found', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue(null);

      const result = await getConversationWithMessages('1');

      expect(result).toBeNull();
    });
  });

  describe('validateEmployeeAccess', () => {
    it('should return true when employee has access', async () => {
      const mockEmployee = { id: 123, name: 'John Doe' };
      mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee);

      const result = await validateEmployeeAccess(123);

      expect(mockPrisma.employee.findUnique).toHaveBeenCalledWith({
        where: { id: 123 },
      });
      expect(result).toBe(true);
    });

    it('should return false when employee not found', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(null);

      const result = await validateEmployeeAccess(123);

      expect(result).toBe(false);
    });
  });

  describe('validateRestaurantUserAccess', () => {
    it('should return true when restaurant user has access', async () => {
      const mockRestaurantUser = { id: 456, name: 'Restaurant ABC' };
      mockPrisma.restaurantUser.findUnique.mockResolvedValue(mockRestaurantUser);

      const result = await validateRestaurantUserAccess(456);

      expect(mockPrisma.restaurantUser.findUnique).toHaveBeenCalledWith({
        where: { id: 456 },
      });
      expect(result).toBe(true);
    });

    it('should return false when restaurant user not found', async () => {
      mockPrisma.restaurantUser.findUnique.mockResolvedValue(null);

      const result = await validateRestaurantUserAccess(456);

      expect(result).toBe(false);
    });
  });

  describe('createMessage', () => {
    it('should create message successfully', async () => {
      const mockMessage = {
        id: 1,
        text: 'Hello there',
        senderUserId: 123,
        receiverUserId: 456,
        conversationId: 1,
        senderType: 'employee',
        receiverType: 'restaurant'
      };
      mockPrisma.message.create.mockResolvedValue(mockMessage);

      const messageData = {
        text: 'Hello there',
        senderUserId: 123,
        receiverUserId: 456,
        conversationId: 1,
        senderType: 'employee',
        receiverType: 'restaurant'
      };

      const result = await createMessage(messageData);

      expect(mockPrisma.message.create).toHaveBeenCalledWith({
        data: messageData,
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

      const result = await checkTalentConversation(123, 456);

      expect(mockPrisma.conversation.findFirst).toHaveBeenCalledWith({
        where: {
          employeeId: 123,
          restaurantUserId: 456,
          type: 'talent',
        },
      });
      expect(result).toEqual(mockConversation);
    });

    it('should return null when conversation not found', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue(null);

      const result = await checkTalentConversation(123, 456);

      expect(result).toBeNull();
    });
  });

  describe('checkApplicationConversation', () => {
    it('should return conversation when found', async () => {
      const mockConversation = {
        id: 1,
        employeeId: 123,
        restaurantUserId: 456,
        type: 'application'
      };
      mockPrisma.conversation.findFirst.mockResolvedValue(mockConversation);

      const result = await checkApplicationConversation(123, 456);

      expect(mockPrisma.conversation.findFirst).toHaveBeenCalledWith({
        where: {
          employeeId: 123,
          restaurantUserId: 456,
          type: 'application',
        },
      });
      expect(result).toEqual(mockConversation);
    });

    it('should return null when conversation not found', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue(null);

      const result = await checkApplicationConversation(123, 456);

      expect(result).toBeNull();
    });
  });

  describe('findConversationByJobPost', () => {
    it('should return conversation when found', async () => {
      const mockConversation = {
        id: 1,
        employeeId: 123,
        jobPostId: 789,
        restaurantUserId: 456,
        type: 'application'
      };
      mockPrisma.conversation.findFirst.mockResolvedValue(mockConversation);

      const result = await findConversationByJobPost(123, 789, 456, 'application');

      expect(mockPrisma.conversation.findFirst).toHaveBeenCalledWith({
        where: {
          employeeId: 123,
          jobPostId: 789,
          restaurantUserId: 456,
          type: 'application',
        },
      });
      expect(result).toEqual(mockConversation);
    });

    it('should return null when conversation not found', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue(null);

      const result = await findConversationByJobPost(123, 789, 456, 'application');

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

      const result = await findConversationByTalentPool(123, 999, 456, 'talent');

      expect(mockPrisma.conversation.findFirst).toHaveBeenCalledWith({
        where: {
          employeeId: 123,
          talentPoolId: 999,
          restaurantUserId: 456,
          type: 'talent',
        },
      });
      expect(result).toEqual(mockConversation);
    });

    it('should return null when conversation not found', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue(null);

      const result = await findConversationByTalentPool(123, 999, 456, 'talent');

      expect(result).toBeNull();
    });
  });

  describe('createConversation', () => {
    it('should create conversation successfully', async () => {
      const mockConversation = {
        id: 1,
        employeeId: 123,
        jobPostId: 789,
        restaurantUserId: 456,
        type: 'application'
      };
      mockPrisma.conversation.create.mockResolvedValue(mockConversation);

      const conversationData = {
        employeeId: 123,
        jobPostId: 789,
        restaurantUserId: 456,
        type: 'application'
      };

      const result = await createConversation(conversationData);

      expect(mockPrisma.conversation.create).toHaveBeenCalledWith({
        data: conversationData,
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

      const result = await getRestaurantConversations(456, 123, 'application');

      expect(mockPrisma.conversation.findMany).toHaveBeenCalledWith({
        where: {
          restaurantUserId: 456,
          employeeId: 123,
          type: 'application',
        },
        include: {
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
        orderBy: { updatedAt: 'desc' },
      });
      expect(result).toEqual(mockConversations);
    });

    it('should return empty array when no conversations found', async () => {
      mockPrisma.conversation.findMany.mockResolvedValue([]);

      const result = await getRestaurantConversations(456, 123, 'application');

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

      const result = await getEmployeeConversations(123, 'application');

      expect(mockPrisma.conversation.findMany).toHaveBeenCalledWith({
        where: {
          employeeId: 123,
          type: 'application',
        },
        include: {
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
        orderBy: { updatedAt: 'desc' },
      });
      expect(result).toEqual(mockConversations);
    });

    it('should return empty array when no conversations found', async () => {
      mockPrisma.conversation.findMany.mockResolvedValue([]);

      const result = await getEmployeeConversations(123, 'application');

      expect(result).toEqual([]);
    });
  });

  describe('getRestaurantUserConversations', () => {
    it('should return restaurant user conversations', async () => {
      const mockConversations = [
        { id: 1, employeeId: 123, type: 'application' },
        { id: 2, employeeId: 124, type: 'talent' }
      ];
      mockPrisma.conversation.findMany.mockResolvedValue(mockConversations);

      const result = await getRestaurantUserConversations(456, 'application');

      expect(mockPrisma.conversation.findMany).toHaveBeenCalledWith({
        where: {
          restaurantUserId: 456,
          type: 'application',
        },
        include: {
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
        orderBy: { updatedAt: 'desc' },
      });
      expect(result).toEqual(mockConversations);
    });

    it('should return empty array when no conversations found', async () => {
      mockPrisma.conversation.findMany.mockResolvedValue([]);

      const result = await getRestaurantUserConversations(456, 'application');

      expect(result).toEqual([]);
    });
  });

  describe('deleteConversation', () => {
    it('should delete conversation successfully', async () => {
      const mockDeletedConversation = { id: 1, employeeId: 123 };
      mockPrisma.conversation.delete.mockResolvedValue(mockDeletedConversation);
      mockPrisma.message.deleteMany.mockResolvedValue({ count: 5 });
      mockPrisma.$transaction.mockImplementation(async (callback) => await callback());

      const result = await deleteConversation(1);

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockPrisma.message.deleteMany).toHaveBeenCalledWith({
        where: { conversationId: 1 },
      });
      expect(mockPrisma.conversation.delete).toHaveBeenCalledWith({
        where: { id: 1 },
      });
      expect(result).toEqual(mockDeletedConversation);
    });

    it('should handle transaction errors', async () => {
      mockPrisma.$transaction.mockRejectedValue(new Error('Transaction failed'));

      await expect(deleteConversation(1)).rejects.toThrow('Transaction failed');
    });
  });

  describe('validateConversationAccess', () => {
    it('should return true when employee has access', () => {
      const conversation = { employeeId: 123, restaurantUserId: 456 };
      const employeeId = 123;
      const restaurantUserId = null;

      const result = validateConversationAccess(conversation, employeeId, restaurantUserId);

      expect(result).toBe(true);
    });

    it('should return true when restaurant user has access', () => {
      const conversation = { employeeId: 123, restaurantUserId: 456 };
      const employeeId = null;
      const restaurantUserId = 456;

      const result = validateConversationAccess(conversation, employeeId, restaurantUserId);

      expect(result).toBe(true);
    });

    it('should return false when user has no access', () => {
      const conversation = { employeeId: 123, restaurantUserId: 456 };
      const employeeId = 999;
      const restaurantUserId = 999;

      const result = validateConversationAccess(conversation, employeeId, restaurantUserId);

      expect(result).toBe(false);
    });

    it('should return false when no user IDs provided', () => {
      const conversation = { employeeId: 123, restaurantUserId: 456 };
      const employeeId = null;
      const restaurantUserId = null;

      const result = validateConversationAccess(conversation, employeeId, restaurantUserId);

      expect(result).toBe(false);
    });
  });
}); 
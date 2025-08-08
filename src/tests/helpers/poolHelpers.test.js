const {
  checkTalentPoolEntry,
  createTalentPoolEntry,
  buildTalentPoolFilters,
  getTalentPoolEntryWithConversations,
  deleteTalentPoolEntry,
  approveTalentPoolEntry,
} = require('../../helpers/poolHelpers.js');

// Mock Prisma
const mockPrisma = {
  talentPool: {
    findFirst: jest.fn(),
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  $transaction: jest.fn(),
  message: {
    deleteMany: jest.fn(),
  },
  conversation: {
    deleteMany: jest.fn(),
  },
};

// Mock the prisma import
jest.mock('../../db.js', () => ({
  prisma: mockPrisma,
}));

describe('Pool Helpers', () => {
  let helpers;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    helpers = require('../../helpers/poolHelpers.js');
  });

  describe('checkTalentPoolEntry', () => {
    it('should return talent pool entry when found', async () => {
      const mockEntry = { id: 1, employeeId: 123, restaurantId: 456 };
      mockPrisma.talentPool.findFirst.mockResolvedValue(mockEntry);

      const result = await helpers.checkTalentPoolEntry(123, 456);

      expect(mockPrisma.talentPool.findFirst).toHaveBeenCalledWith({
        where: {
          employeeId: 123,
          restaurantId: 456,
        }
      });
      expect(result).toEqual(mockEntry);
    });

    it('should return null when talent pool entry not found', async () => {
      mockPrisma.talentPool.findFirst.mockResolvedValue(null);

      const result = await helpers.checkTalentPoolEntry(123, 456);

      expect(result).toBeNull();
    });

    it('should handle string employeeId by converting to integer', async () => {
      const mockEntry = { id: 1, employeeId: 123, restaurantId: 456 };
      mockPrisma.talentPool.findFirst.mockResolvedValue(mockEntry);

      await helpers.checkTalentPoolEntry('123', '456');

      expect(mockPrisma.talentPool.findFirst).toHaveBeenCalledWith({
        where: {
          employeeId: 123,  // employeeId is parsed
          restaurantId: '456',  // restaurantId is not parsed
        }
      });
    });
  });

  describe('createTalentPoolEntry', () => {
    it('should create talent pool entry successfully', async () => {
      const mockEntry = { id: 1, employeeId: 123, restaurantId: 456, status: 'accepted' };
      mockPrisma.talentPool.create.mockResolvedValue(mockEntry);

      const talentData = {
        employeeId: 123,
        restaurantId: 456,
        restaurantUserId: 789
      };

      const result = await helpers.createTalentPoolEntry(talentData);

      expect(mockPrisma.talentPool.create).toHaveBeenCalledWith({
        data: {
          employee: { connect: { id: 123 } },
          restaurant: { connect: { id: 456 } },
          addedByUser: { connect: { id: 789 } },
          status: 'accepted',
        }
      });
      expect(result).toEqual(mockEntry);
    });

    it('should handle string IDs by converting only employeeId to integer', async () => {
      const mockEntry = { id: 1, employeeId: 123, restaurantId: '456', status: 'accepted' };
      mockPrisma.talentPool.create.mockResolvedValue(mockEntry);

      const talentData = {
        employeeId: '123',
        restaurantId: '456',
        restaurantUserId: '789'
      };

      await helpers.createTalentPoolEntry(talentData);

      expect(mockPrisma.talentPool.create).toHaveBeenCalledWith({
        data: {
          employee: { connect: { id: 123 } },  // employeeId is parsed
          restaurant: { connect: { id: '456' } },  // restaurantId is not parsed
          addedByUser: { connect: { id: '789' } },  // restaurantUserId is not parsed
          status: 'accepted',
        }
      });
    });
  });

  describe('buildTalentPoolFilters', () => {
    it('should build filters with all parameters', () => {
      const queryParams = {
        position: 'Chef',
        experience: '5 years',
        region: 'Santiago',
        comuna: 'Providencia',
        available: 'Full-time',
        schedule: 'Morning'
      };

      const result = helpers.buildTalentPoolFilters(queryParams);

      expect(result).toEqual({
        position: 'Chef',
        available: 'Full-time',
        schedule: 'Morning',
        region: 'Santiago',
        comuna: 'Providencia'
      });
    });

    it('should build filters with partial parameters', () => {
      const queryParams = {
        position: 'Chef',
        region: 'Santiago'
      };

      const result = helpers.buildTalentPoolFilters(queryParams);

      expect(result).toEqual({
        position: 'Chef',
        region: 'Santiago'
      });
    });

    it('should return empty object when no parameters provided', () => {
      const queryParams = {};

      const result = helpers.buildTalentPoolFilters(queryParams);

      expect(result).toEqual({});
    });

    it('should ignore experience parameter', () => {
      const queryParams = {
        position: 'Chef',
        experience: '5 years',
        region: 'Santiago'
      };

      const result = helpers.buildTalentPoolFilters(queryParams);

      expect(result).toEqual({
        position: 'Chef',
        region: 'Santiago'
      });
      expect(result.experience).toBeUndefined();
    });

    it('should pass filter values through without modification', () => {
      const queryParams = {
        position: 'CHEF',  // uppercase
        region: 'santiago',  // lowercase
        comuna: 'Providencia ',  // trailing space
      };

      const result = helpers.buildTalentPoolFilters(queryParams);

      expect(result).toEqual({
        position: 'CHEF',
        region: 'santiago',
        comuna: 'Providencia ',
      });
    });
  });

  describe('getTalentPoolEntryWithConversations', () => {
    it('should return talent pool entry with conversations', async () => {
      const mockEntry = {
        id: 1,
        employeeId: 123,
        restaurantId: 456,
        conversations: [
          { id: 1, messages: [] },
          { id: 2, messages: [] }
        ]
      };
      mockPrisma.talentPool.findUnique.mockResolvedValue(mockEntry);

      const result = await helpers.getTalentPoolEntryWithConversations(1);

      expect(mockPrisma.talentPool.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        include: { conversations: true }
      });
      expect(result).toEqual(mockEntry);
    });

    it('should return null when talent pool entry not found', async () => {
      mockPrisma.talentPool.findUnique.mockResolvedValue(null);

      const result = await helpers.getTalentPoolEntryWithConversations(1);

      expect(result).toBeNull();
    });

    it('should not parse talentId to integer', async () => {
      const mockEntry = { id: '1', conversations: [] };
      mockPrisma.talentPool.findUnique.mockResolvedValue(mockEntry);

      await helpers.getTalentPoolEntryWithConversations('1');

      expect(mockPrisma.talentPool.findUnique).toHaveBeenCalledWith({
        where: { id: '1' },
        include: { conversations: true }
      });
    });
  });

  describe('deleteTalentPoolEntry', () => {
    it('should delete talent pool entry and associated conversations successfully', async () => {
      const mockEntry = {
        id: 1,
        employeeId: 123,
        restaurantId: 456,
        conversations: [
          { id: 1, messages: [] },
          { id: 2, messages: [] }
        ]
      };

      const mockTransaction = jest.fn(async (callback) => {
        const tx = {
          talentPool: {
            findUnique: jest.fn().mockResolvedValue(mockEntry),
            delete: jest.fn().mockResolvedValue(mockEntry)
          },
          message: {
            deleteMany: jest.fn().mockResolvedValue({ count: 5 })
          },
          conversation: {
            deleteMany: jest.fn().mockResolvedValue({ count: 2 })
          }
        };
        return await callback(tx);
      });

      mockPrisma.$transaction.mockImplementation(mockTransaction);

      const result = await helpers.deleteTalentPoolEntry(1);

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(result).toEqual(mockEntry);
    });

    it('should throw error when talent pool entry not found', async () => {
      const mockTransaction = jest.fn(async (callback) => {
        const tx = {
          talentPool: {
            findUnique: jest.fn().mockResolvedValue(null),
            delete: jest.fn()
          },
          message: {
            deleteMany: jest.fn()
          },
          conversation: {
            deleteMany: jest.fn()
          }
        };
        return await callback(tx);
      });

      mockPrisma.$transaction.mockImplementation(mockTransaction);

      await expect(helpers.deleteTalentPoolEntry(1)).rejects.toThrow('Talent not found in the pool.');
    });

    it('should handle empty conversations array', async () => {
      const mockEntry = {
        id: 1,
        employeeId: 123,
        restaurantId: 456,
        conversations: []
      };

      const mockTransaction = jest.fn(async (callback) => {
        const tx = {
          talentPool: {
            findUnique: jest.fn().mockResolvedValue(mockEntry),
            delete: jest.fn().mockResolvedValue(mockEntry)
          },
          message: {
            deleteMany: jest.fn().mockResolvedValue({ count: 0 })
          },
          conversation: {
            deleteMany: jest.fn().mockResolvedValue({ count: 0 })
          }
        };
        return await callback(tx);
      });

      mockPrisma.$transaction.mockImplementation(mockTransaction);

      const result = await helpers.deleteTalentPoolEntry(1);

      expect(result).toEqual(mockEntry);
    });

    it('should not parse talentId to integer', async () => {
      const mockEntry = { id: '1', conversations: [] };

      const mockTalentPoolFindUnique = jest.fn().mockResolvedValue(mockEntry);
      const mockTalentPoolDelete = jest.fn().mockResolvedValue(mockEntry);
      const mockMessageDeleteMany = jest.fn().mockResolvedValue({ count: 0 });
      const mockConversationDeleteMany = jest.fn().mockResolvedValue({ count: 0 });

      const mockTransaction = jest.fn(async (callback) => {
        const tx = {
          talentPool: {
            findUnique: mockTalentPoolFindUnique,
            delete: mockTalentPoolDelete
          },
          message: {
            deleteMany: mockMessageDeleteMany
          },
          conversation: {
            deleteMany: mockConversationDeleteMany
          }
        };
        return await callback(tx);
      });

      mockPrisma.$transaction.mockImplementation(mockTransaction);

      await helpers.deleteTalentPoolEntry('1');

      expect(mockTalentPoolFindUnique).toHaveBeenCalledWith({
        where: { id: '1' },
        include: { conversations: true }
      });
    });
  });

  describe('approveTalentPoolEntry', () => {
    it('should approve talent pool entry successfully', async () => {
      const mockEntry = {
        id: 1,
        employeeId: 123,
        restaurantId: 456,
        status: 'approved'
      };
      mockPrisma.talentPool.update.mockResolvedValue(mockEntry);

      const result = await helpers.approveTalentPoolEntry(1, 789);

      expect(mockPrisma.talentPool.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          status: "approved",
          addedByUser: { connect: { id: 789 } }
        }
      });
      expect(result).toEqual(mockEntry);
    });

    it('should handle string IDs by converting only talentId to integer', async () => {
      const mockEntry = {
        id: 1,
        employeeId: 123,
        restaurantId: 456,
        status: 'approved'
      };
      mockPrisma.talentPool.update.mockResolvedValue(mockEntry);

      await helpers.approveTalentPoolEntry('1', '789');

      expect(mockPrisma.talentPool.update).toHaveBeenCalledWith({
        where: { id: 1 },  // talentId is parsed
        data: {
          status: "approved",
          addedByUser: { connect: { id: '789' } }  // restaurantUserId is not parsed
        }
      });
    });
  });
}); 
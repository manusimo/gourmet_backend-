const mockPrisma = {
  jobOffer: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
  },
  application: {
    findFirst: jest.fn(),
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  employee: {
    findUnique: jest.fn(),
  },
  restaurant: {
    findUnique: jest.fn(),
  },
};

jest.mock('../../db.js', () => ({
  prisma: mockPrisma,
}));

describe('Application Helpers', () => {
  let helpers;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    helpers = require('../../helpers/applicationHelpers.js');
  });

  describe('validateApplicationInput', () => {
    it('should validate valid application input', () => {
      const input = {
        jobPostId: 123,
        answers: [
          { questionId: 1, answer: 'Yes, I have experience' },
          { questionId: 2, answer: 'I am available immediately' }
        ]
      };

      const result = helpers.validateApplicationInput(input);

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should reject missing jobPostId', () => {
      const input = {
        answers: [
          { questionId: 1, answer: 'Yes, I have experience' }
        ]
      };

      const result = helpers.validateApplicationInput(input);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Job post ID is required');
    });

    it('should reject invalid jobPostId', () => {
      const input = {
        jobPostId: 'invalid',
        answers: [
          { questionId: 1, answer: 'Yes, I have experience' }
        ]
      };

      const result = helpers.validateApplicationInput(input);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Job post ID must be a valid number');
    });

    it('should reject missing answers', () => {
      const input = {
        jobPostId: 123,
        answers: []
      };

      const result = helpers.validateApplicationInput(input);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('At least one answer is required');
    });

    it('should reject invalid answer format', () => {
      const input = {
        jobPostId: 123,
        answers: [
          { questionId: 'invalid', answer: 'Yes, I have experience' },
          { answer: 'Missing questionId' }
        ]
      };

      const result = helpers.validateApplicationInput(input);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Each answer must have a valid questionId and answer');
    });

    it('should reject empty answers', () => {
      const input = {
        jobPostId: 123,
        answers: [
          { questionId: 1, answer: '' },
          { questionId: 2, answer: '   ' }
        ]
      };

      const result = helpers.validateApplicationInput(input);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Answer cannot be empty');
    });
  });

  describe('getJobPost', () => {
    it('should return job post when found', async () => {
      const mockJobPost = {
        id: 123,
        position: 'Chef Position',
        description: 'Looking for an experienced chef',
        restaurantId: 456,
        isActive: true
      };
      mockPrisma.jobOffer.findUnique.mockResolvedValue(mockJobPost);

      const result = await helpers.getJobPost(123);

      expect(mockPrisma.jobOffer.findUnique).toHaveBeenCalledWith({
        where: { id: 123 },
        include: {
          restaurant: true,
          questions: true,
        },
      });
      expect(result).toEqual(mockJobPost);
    });

    it('should handle string input by parsing to integer', async () => {
      const mockJobPost = { id: 123 };
      mockPrisma.jobOffer.findUnique.mockResolvedValue(mockJobPost);

      const result = await helpers.getJobPost('123');

      expect(mockPrisma.jobOffer.findUnique).toHaveBeenCalledWith({
        where: { id: 123 },
        include: {
          restaurant: true,
          questions: true,
        },
      });
      expect(result).toEqual(mockJobPost);
    });

    it('should return null when job post not found', async () => {
      mockPrisma.jobOffer.findUnique.mockResolvedValue(null);

      const result = await helpers.getJobPost(999);

      expect(result).toBeNull();
    });

    it('should handle database errors', async () => {
      mockPrisma.jobOffer.findUnique.mockRejectedValue(new Error('Database error'));

      await expect(helpers.getJobPost(123)).rejects.toThrow('Database error');
    });
  });

  describe('getExistingApplication', () => {
    it('should return existing application when found', async () => {
      const mockApplication = {
        id: 1,
        jobPostId: 123,
        employeeId: 456,
        status: 'pending'
      };
      mockPrisma.application.findFirst.mockResolvedValue(mockApplication);

      const result = await helpers.getExistingApplication('123', '456');

      expect(mockPrisma.application.findFirst).toHaveBeenCalledWith({
        where: {
          jobPostId: 123,
          employeeId: 456,
        },
      });
      expect(result).toEqual(mockApplication);
    });

    it('should return null when no existing application', async () => {
      mockPrisma.application.findFirst.mockResolvedValue(null);

      const result = await helpers.getExistingApplication(123, 456);

      expect(result).toBeNull();
    });

    it('should handle database errors', async () => {
      mockPrisma.application.findFirst.mockRejectedValue(new Error('Database error'));

      await expect(helpers.getExistingApplication(123, 456)).rejects.toThrow('Database error');
    });
  });

  describe('createApplication', () => {
    it('should create application successfully', async () => {
      const mockApplication = {
        id: 1,
        jobPostId: 123,
        employeeId: 456,
        answers: [
          { questionId: 1, answer: 'Yes, I have experience' },
          { questionId: 2, answer: 'I am available immediately' }
        ],
        createdAt: new Date()
      };
      mockPrisma.application.create.mockResolvedValue(mockApplication);

      const answers = [
        { questionId: 1, answer: 'Yes, I have experience' },
        { questionId: 2, answer: 'I am available immediately' }
      ];

      const result = await helpers.createApplication('123', '456', answers);

      expect(mockPrisma.application.create).toHaveBeenCalledWith({
        data: {
          jobPost: { connect: { id: 123 } },
          employee: { connect: { id: 456 } },
          answers: { create: answers },
        },
        include: {
          jobPost: {
            include: {
              restaurant: true,
            },
          },
          employee: true,
        },
      });
      expect(result).toEqual(mockApplication);
    });

    it('should handle database errors', async () => {
      mockPrisma.application.create.mockRejectedValue(new Error('Database error'));

      const answers = [
        { questionId: 1, answer: 'Yes, I have experience' }
      ];

      await expect(helpers.createApplication(123, 456, answers)).rejects.toThrow('Database error');
    });
  });

  describe('getApplicationById', () => {
    it('should return application when found', async () => {
      const mockApplication = {
        id: 1,
        jobPostId: 123,
        employeeId: 456,
        status: 'pending',
        answers: [
          { questionId: 1, answer: 'Yes, I have experience' }
        ]
      };
      mockPrisma.application.findUnique.mockResolvedValue(mockApplication);

      const result = await helpers.getApplicationById('1');

      expect(mockPrisma.application.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        include: {
          jobPost: {
            include: {
              restaurant: true,
            },
          },
          employee: true,
        },
      });
      expect(result).toEqual(mockApplication);
    });

    it('should return null when application not found', async () => {
      mockPrisma.application.findUnique.mockResolvedValue(null);

      const result = await helpers.getApplicationById(999);

      expect(result).toBeNull();
    });

    it('should handle database errors', async () => {
      mockPrisma.application.findUnique.mockRejectedValue(new Error('Database error'));

      await expect(helpers.getApplicationById(1)).rejects.toThrow('Database error');
    });
  });

  describe('getJobOfferForRestaurant', () => {
    it('should return job offer when found and belongs to restaurant', async () => {
      const mockJobOffer = {
        id: 123,
        position: 'Chef Position',
        restaurantId: 456,
        isActive: true
      };
      mockPrisma.jobOffer.findFirst.mockResolvedValue(mockJobOffer);

      const result = await helpers.getJobOfferForRestaurant('123', '456');

      expect(mockPrisma.jobOffer.findFirst).toHaveBeenCalledWith({
        where: {
          id: 123,
          restaurantId: 456,
        },
      });
      expect(result).toEqual(mockJobOffer);
    });

    it('should return null when job offer not found', async () => {
      mockPrisma.jobOffer.findFirst.mockResolvedValue(null);

      const result = await helpers.getJobOfferForRestaurant(999, 456);

      expect(result).toBeNull();
    });

    it('should return null when job offer doesn\'t belong to restaurant', async () => {
      mockPrisma.jobOffer.findFirst.mockResolvedValue(null);

      const result = await helpers.getJobOfferForRestaurant(123, 999);

      expect(result).toBeNull();
    });

    it('should handle database errors', async () => {
      mockPrisma.jobOffer.findFirst.mockRejectedValue(new Error('Database error'));

      await expect(helpers.getJobOfferForRestaurant(123, 456)).rejects.toThrow('Database error');
    });
  });

  describe('getApplicationsForJobOffer', () => {
    it('should return applications for job offer', async () => {
      const mockApplications = [
        {
          id: 1,
          employeeId: 456,
          status: 'pending',
          employee: { name: 'John Doe' }
        },
        {
          id: 2,
          employeeId: 789,
          status: 'reviewed',
          employee: { name: 'Jane Smith' }
        }
      ];
      mockPrisma.application.findMany.mockResolvedValue(mockApplications);

      const result = await helpers.getApplicationsForJobOffer('123');

      expect(mockPrisma.application.findMany).toHaveBeenCalledWith({
        where: { jobPostId: 123 },
        include: {
          employee: true,
        },
      });
      expect(result).toEqual(mockApplications);
    });

    it('should return empty array when no applications found', async () => {
      mockPrisma.application.findMany.mockResolvedValue([]);

      const result = await helpers.getApplicationsForJobOffer(123);

      expect(result).toEqual([]);
    });

    it('should handle database errors', async () => {
      mockPrisma.application.findMany.mockRejectedValue(new Error('Database error'));

      await expect(helpers.getApplicationsForJobOffer(123)).rejects.toThrow('Database error');
    });
  });

  describe('Error Handling', () => {
    it('should handle Prisma record not found error', async () => {
      const prismaError = new Error('Record to update not found');
      prismaError.code = 'P2025';
      mockPrisma.application.create.mockRejectedValue(prismaError);

      const answers = [
        { questionId: 1, answer: 'Yes, I have experience' }
      ];

      await expect(helpers.createApplication(123, 456, answers)).rejects.toThrow('Record to update not found');
    });

    it('should handle Prisma foreign key constraint error', async () => {
      const prismaError = new Error('Foreign key constraint failed');
      prismaError.code = 'P2003';
      mockPrisma.application.create.mockRejectedValue(prismaError);

      const answers = [
        { questionId: 1, answer: 'Yes, I have experience' }
      ];

      await expect(helpers.createApplication(123, 456, answers)).rejects.toThrow('Foreign key constraint failed');
    });

    it('should handle Prisma unique constraint error', async () => {
      const prismaError = new Error('Unique constraint failed');
      prismaError.code = 'P2002';
      mockPrisma.application.create.mockRejectedValue(prismaError);

      const answers = [
        { questionId: 1, answer: 'Yes, I have experience' }
      ];

      await expect(helpers.createApplication(123, 456, answers)).rejects.toThrow('Unique constraint failed');
    });
  });

  describe('Input Validation Edge Cases', () => {
    it('should handle null input', () => {
      const result = helpers.validateApplicationInput(null);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Input data is required');
    });

    it('should handle undefined input', () => {
      const result = helpers.validateApplicationInput(undefined);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Input data is required');
    });

    it('should handle negative jobPostId', () => {
      const input = {
        jobPostId: -1,
        answers: [{ questionId: 1, answer: 'Yes' }]
      };

      const result = helpers.validateApplicationInput(input);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Job post ID must be a positive number');
    });

    it('should handle zero jobPostId', () => {
      const input = {
        jobPostId: 0,
        answers: [{ questionId: 1, answer: 'Yes' }]
      };

      const result = helpers.validateApplicationInput(input);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Job post ID must be a positive number');
    });

    it('should handle very large jobPostId', () => {
      const input = {
        jobPostId: Number.MAX_SAFE_INTEGER + 1,
        answers: [{ questionId: 1, answer: 'Yes' }]
      };

      const result = helpers.validateApplicationInput(input);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Job post ID must be a valid number');
    });

    it('should handle answers with very long text', () => {
      const longAnswer = 'a'.repeat(10001); // More than 10,000 characters
      const input = {
        jobPostId: 123,
        answers: [{ questionId: 1, answer: longAnswer }]
      };

      const result = helpers.validateApplicationInput(input);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Answer is too long (maximum 10,000 characters)');
    });

    it('should handle duplicate questionIds', () => {
      const input = {
        jobPostId: 123,
        answers: [
          { questionId: 1, answer: 'First answer' },
          { questionId: 1, answer: 'Second answer' }
        ]
      };

      const result = helpers.validateApplicationInput(input);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Duplicate question IDs are not allowed');
    });
  });

  describe('Database Query Optimization', () => {
    it('should use efficient queries for getJobPost', async () => {
      const mockJobPost = {
        id: 123,
        position: 'Chef Position',
        restaurant: { id: 456, name: 'Restaurant ABC' },
        questions: []
      };
      mockPrisma.jobOffer.findUnique.mockResolvedValue(mockJobPost);

      await helpers.getJobPost(123);

      expect(mockPrisma.jobOffer.findUnique).toHaveBeenCalledWith({
        where: { id: 123 },
        include: {
          restaurant: true,
          questions: true,
        },
      });
    });

    it('should use efficient queries for getApplicationsForJobOffer', async () => {
      const mockApplications = [];
      mockPrisma.application.findMany.mockResolvedValue(mockApplications);

      await helpers.getApplicationsForJobOffer(123);

      expect(mockPrisma.application.findMany).toHaveBeenCalledWith({
        where: { jobPostId: 123 },
        include: {
          employee: true,
        },
      });
    });

    it('should use efficient queries for getJobOfferForRestaurant', async () => {
      const mockJobOffer = { id: 123, restaurantId: 456 };
      mockPrisma.jobOffer.findFirst.mockResolvedValue(mockJobOffer);

      await helpers.getJobOfferForRestaurant(123, 456);

      expect(mockPrisma.jobOffer.findFirst).toHaveBeenCalledWith({
        where: {
          id: 123,
          restaurantId: 456,
        },
      });
    });
  });
}); 
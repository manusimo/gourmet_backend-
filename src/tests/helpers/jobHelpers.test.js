const {
  createJobOffer,
  getJobOfferWithLocation,
  generateJobPlanInfo,
  getEmployeeById,
  getEmployeeApplications,
  getJobsWithFilters,
  getTotalJobsCount,
  getRestaurantJobOffers,
  getJobOfferById,
  getRestaurantUserWithDetails,
  getRestaurantWithLocations,
  generateCompletePlanInfo
} = require('../../helpers/jobHelpers.js');

// Mock Prisma
const mockPrisma = {
  jobOffer: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  employee: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  application: {
    findMany: jest.fn(),
  },
  restaurantUser: {
    findUnique: jest.fn(),
  },
  restaurant: {
    findUnique: jest.fn(),
  },
};

// Mock the prisma import
jest.mock('../../db.js', () => ({
  prisma: mockPrisma,
}));

describe('Job Helpers', () => {
  let helpers;
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    helpers = require('../../helpers/jobHelpers.js');
  });
  afterEach(() => {
    delete global.mockPrisma;
  });

  describe('createJobOffer', () => {
    it('should create job offer successfully', async () => {
      const mockJobOffer = {
        id: 1,
        position: 'Chef',
        salary: 50000,
        tips: true,
        vacancies: 2
      };
      mockPrisma.jobOffer.create.mockResolvedValue(mockJobOffer);

      const jobData = {
        position: 'Chef',
        locationId: 1,
        schedule: 'Full-time',
        contract: 'Permanent',
        vacancies: '2',
        yearsOfExperience: '5',
        description: 'Looking for experienced chef',
        questions: [{ question: 'Experience?' }],
        requirements: '5 years experience',
        salary: '50000',
        propina: 'Si',
        functions: 'Cooking and management',
        restaurantId: 1,
        restaurantUserId: 1
      };

      const result = await helpers.createJobOffer(jobData);

      expect(mockPrisma.jobOffer.create).toHaveBeenCalledWith({
        data: {
          position: 'Chef',
          location: { connect: { id: 1 } },
          schedule: 'Full-time',
          contract: 'Permanent',
          vacancies: 2,
          yearsOfExperience: 5,
          description: 'Looking for experienced chef',
          restaurant: { connect: { id: 1 } },
          requirements: '5 years experience',
          functions: 'Cooking and management',
          tips: true,
          salary: 50000,
          questions: { create: [{ question: 'Experience?' }] },
          restaurantUser: { connect: { id: 1 } },
        },
      });
      expect(result).toEqual(mockJobOffer);
    });

    it('should handle null yearsOfExperience', async () => {
      const mockJobOffer = { id: 1, position: 'Chef' };
      mockPrisma.jobOffer.create.mockResolvedValue(mockJobOffer);

      const jobData = {
        position: 'Chef',
        locationId: 1,
        schedule: 'Full-time',
        contract: 'Permanent',
        vacancies: '2',
        yearsOfExperience: 'invalid',
        description: 'Looking for experienced chef',
        questions: [],
        requirements: '5 years experience',
        salary: '50000',
        propina: 'No',
        functions: 'Cooking',
        restaurantId: 1,
        restaurantUserId: 1
      };

      await helpers.createJobOffer(jobData);

      expect(mockPrisma.jobOffer.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          yearsOfExperience: null,
          tips: false
        })
      });
    });
  });

  describe('getJobOfferWithLocation', () => {
    it('should return job offer with location', async () => {
      const mockJobOffer = {
        id: 1,
        position: 'Chef',
        location: { id: 1, address: '123 Main St' }
      };
      mockPrisma.jobOffer.findUnique.mockResolvedValue(mockJobOffer);

      const result = await helpers.getJobOfferWithLocation(1);

      expect(mockPrisma.jobOffer.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        include: { location: true },
      });
      expect(result).toEqual(mockJobOffer);
    });

    it('should return null when job offer not found', async () => {
      mockPrisma.jobOffer.findUnique.mockResolvedValue(null);

      const result = await helpers.getJobOfferWithLocation(1);

      expect(result).toBeNull();
    });
  });

  describe('generateJobPlanInfo', () => {
    it('should generate plan info when remaining job offers > 0', () => {
      const planData = {
        paymentStatus: 'pro',
        remainingJobOffers: 3,
        jobOfferLimit: 5
      };

      const result = helpers.generateJobPlanInfo(planData);

      expect(result).toEqual({
        currentPlan: 'PRO',
        remainingJobOffers: 3,
        totalLimit: 5,
        upgradeMessage: 'Te quedan 3 ofertas de trabajo de tu plan PRO.'
      });
    });

    it('should generate upgrade message when remaining job offers = 0', () => {
      const planData = {
        paymentStatus: 'starter',
        remainingJobOffers: 0,
        jobOfferLimit: 1
      };

      const result = helpers.generateJobPlanInfo(planData);

      expect(result).toEqual({
        currentPlan: 'STARTER',
        remainingJobOffers: 0,
        totalLimit: 1,
        upgradeMessage: 'Has usado todas tus ofertas de trabajo. Actualiza a PRO para más.'
      });
    });

    it('should handle unknown payment status', () => {
      const planData = {
        paymentStatus: 'unknown',
        remainingJobOffers: 2,
        jobOfferLimit: 3
      };

      const result = helpers.generateJobPlanInfo(planData);

      expect(result.currentPlan).toBe('STARTER');
    });
  });

  describe('getEmployeeById', () => {
    it('should return employee when found', async () => {
      const mockEmployee = { id: 1, name: 'John Doe' };
      mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee);

      const result = await helpers.getEmployeeById(1);

      expect(mockPrisma.employee.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
      });
      expect(result).toEqual(mockEmployee);
    });

    it('should return null when employee not found', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(null);

      const result = await helpers.getEmployeeById(1);

      expect(result).toBeNull();
    });
  });

  describe('getEmployeeApplications', () => {
    it('should return employee applications', async () => {
      const mockApplications = [
        { id: 1, jobPost: { id: 1, position: 'Chef' } },
        { id: 2, jobPost: { id: 2, position: 'Waiter' } }
      ];
      mockPrisma.application.findMany.mockResolvedValue(mockApplications);

      const result = await helpers.getEmployeeApplications(1);

      expect(mockPrisma.application.findMany).toHaveBeenCalledWith({
        where: {
          employeeId: 1,
          jobPost: { deletedAt: null},
        },
        include: {
          jobPost: {
            include: {
              restaurant: true,
              location: true,
              questions: true,
            },
          },
          answers: {
            include: {
              question: true,
            },
          },
        },
      });
      expect(result).toEqual(mockApplications);
    });
  });

  describe('getJobsWithFilters', () => {
    it('should return jobs with filters', async () => {
      const mockJobs = [
        { id: 1, position: 'Chef' },
        { id: 2, position: 'Waiter' }
      ];
      mockPrisma.jobOffer.findMany.mockResolvedValue(mockJobs);

      const filters = { specialty: 'Restaurant' };
      const searchConditions = { position: { contains: 'Chef' } };
      const orderByCriteria = { createdAt: 'desc' };
      const limit = 10;
      const skip = 0;

      const result = await helpers.getJobsWithFilters(filters, searchConditions, orderByCriteria, limit, skip);

      expect(mockPrisma.jobOffer.findMany).toHaveBeenCalledWith({
        where: {
          restaurant: {
            ...filters,
          },
          ...searchConditions,
          deletedAt: null,
        },
        include: {
          restaurant: true,
          location: true,
          questions: true,
        },
        orderBy: orderByCriteria,
        skip,
        take: limit,
      });
      expect(result).toEqual(mockJobs);
    });
  });

  describe('getTotalJobsCount', () => {
    it('should return total jobs count', async () => {
      mockPrisma.jobOffer.count.mockResolvedValue(25);

      const filters = { specialty: 'Restaurant' };
      const searchConditions = { position: { contains: 'Chef' } };

      const result = await helpers.getTotalJobsCount(filters, searchConditions);

      expect(mockPrisma.jobOffer.count).toHaveBeenCalledWith({
        where: {
          ...searchConditions,
          restaurant: {
            ...filters,
          },
          deletedAt: null,
        },
      });
      expect(result).toBe(25);
    });
  });

  describe('getRestaurantJobOffers', () => {
    it('should return restaurant job offers', async () => {
      const mockJobOffers = [
        { id: 1, position: 'Chef' },
        { id: 2, position: 'Waiter' }
      ];
      mockPrisma.jobOffer.findMany.mockResolvedValue(mockJobOffers);

      const result = await helpers.getRestaurantJobOffers(1);

      expect(mockPrisma.jobOffer.findMany).toHaveBeenCalledWith({
        where: {
          restaurantId: 1,
          deletedAt: null,
        },
        include: {
          restaurant: true,
          questions: true,
          location: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });
      expect(result).toEqual(mockJobOffers);
    });
  });

  describe('getJobOfferById', () => {
    it('should return job offer by ID', async () => {
      const mockJobOffer = {
        id: 1,
        position: 'Chef',
        questions: [],
        restaurant: { id: 1, name: 'Restaurant' },
        applications: [],
        location: { id: 1, address: '123 Main St' }
      };
      mockPrisma.jobOffer.findFirst.mockResolvedValue(mockJobOffer);

      const result = await helpers.getJobOfferById(1);

      expect(mockPrisma.jobOffer.findFirst).toHaveBeenCalledWith({
        where: {
          id: 1,
          deletedAt: null,
        },
        include: {
          questions: true,
          restaurant: true,
          applications: true,
          location: true,
        },
      });
      expect(result).toEqual(mockJobOffer);
    });

    it('should return null when job offer not found', async () => {
      mockPrisma.jobOffer.findFirst.mockResolvedValue(null);

      const result = await helpers.getJobOfferById(1);

      expect(result).toBeNull();
    });

    it('should handle string jobId by converting to integer', async () => {
      const mockJobOffer = { id: 1, position: 'Chef' };
      mockPrisma.jobOffer.findFirst.mockResolvedValue(mockJobOffer);

      await helpers.getJobOfferById('1');

      expect(mockPrisma.jobOffer.findFirst).toHaveBeenCalledWith({
        where: {
          id: 1,
          deletedAt: null,
        },
        include: {
          questions: true,
          restaurant: true,
          applications: true,
          location: true,
        },
      });
    });
  });

  describe('getRestaurantUserWithDetails', () => {
    it('should return restaurant user with details', async () => {
      const mockRestaurantUser = {
        id: 1,
        user: { id: 1, name: 'John' },
        jobOffers: [
          { id: 1, position: 'Chef', applications: [] }
        ]
      };
      mockPrisma.restaurantUser.findUnique.mockResolvedValue(mockRestaurantUser);

      const result = await helpers.getRestaurantUserWithDetails(1);

      expect(mockPrisma.restaurantUser.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        include: {
          user: true,
          jobOffers: {
            where: { deletedAt: null },
            include: {
              applications: {
                where: { deletedAt: null }
              },
              location: true
            }
          }
        }
      });
      expect(result).toEqual(mockRestaurantUser);
    });

    it('should return null when restaurant user not found', async () => {
      mockPrisma.restaurantUser.findUnique.mockResolvedValue(null);

      const result = await helpers.getRestaurantUserWithDetails(1);

      expect(result).toBeNull();
    });
  });

  describe('getRestaurantWithLocations', () => {
    it('should return restaurant with locations', async () => {
      const mockRestaurant = {
        id: 1,
        name: 'Restaurant',
        locations: [
          { id: 1, address: '123 Main St' },
          { id: 2, address: '456 Oak Ave' }
        ]
      };
      mockPrisma.restaurant.findUnique.mockResolvedValue(mockRestaurant);

      const result = await helpers.getRestaurantWithLocations(1);

      expect(mockPrisma.restaurant.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        include: {
          locations: true
        }
      });
      expect(result).toEqual(mockRestaurant);
    });

    it('should return null when restaurant not found', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(null);

      const result = await helpers.getRestaurantWithLocations(1);

      expect(result).toBeNull();
    });
  });

  describe('generateCompletePlanInfo', () => {
    it('should generate complete plan info', () => {
      const planData = {
        user: {
          payment_status: 'pro',
          last_payment: '2024-01-01'
        },
        restaurantUser: {
          jobOffers: [
            { id: 1, applications: [{ id: 1 }] },
            { id: 2, applications: [{ id: 2 }, { id: 3 }] }
          ]
        },
        restaurant: {
          locations: [
            { id: 1, address: '123 Main St' },
            { id: 2, address: '456 Oak Ave' }
          ]
        },
        currentJobOffers: 2,
        currentLocations: 2
      };

      const result = helpers.generateCompletePlanInfo(planData);

      expect(result).toHaveProperty('planInfo');
      expect(result.planInfo).toHaveProperty('currentPlan', 'PRO');
      expect(result.planInfo).toHaveProperty('currentJobOffers', 2);
      expect(result.planInfo).toHaveProperty('remainingJobOffers', 3); // 5 - 2
      expect(result.planInfo).toHaveProperty('totalApplications', 3);
      expect(result.planInfo).toHaveProperty('currentLocations', 2);
      expect(result.planInfo).toHaveProperty('remainingLocations', 3); // 5 - 2
      expect(result.planInfo).toHaveProperty('jobOffers');
    });

    it('should handle starter plan correctly', () => {
      const planData = {
        user: {
          payment_status: 'starter',
          last_payment: null
        },
        restaurantUser: {
          jobOffers: []
        },
        restaurant: {
          locations: []
        },
        currentJobOffers: 0,
        currentLocations: 0
      };

      const result = helpers.generateCompletePlanInfo(planData);

      expect(result.planInfo.currentPlan).toBe('STARTER');
      expect(result.planInfo.remainingJobOffers).toBe(1);
      expect(result.planInfo.remainingLocations).toBe(1);
    });

    it('should handle premium plan correctly', () => {
      const planData = {
        user: {
          payment_status: 'premium',
          last_payment: '2024-01-01'
        },
        restaurantUser: {
          jobOffers: []
        },
        restaurant: {
          locations: []
        },
        currentJobOffers: 0,
        currentLocations: 0
      };

      const result = helpers.generateCompletePlanInfo(planData);

      expect(result.planInfo.currentPlan).toBe('PREMIUM');
      expect(result.planInfo.remainingJobOffers).toBe(Infinity);
      expect(result.planInfo.remainingLocations).toBe(Infinity);
    });
  });
}); 
const {
  getCompanies,
  getTotalCompanies,
  getRestaurantUserByUserId,
  getCompanyLocations,
  formatLocations,
  getTopRatedCompanies,
  getTotalCompaniesCount,
  getTalentsApplications,
  createCompanyProfile,
  createRestaurantUser,
  updateUserWithRestaurant,
  generateCompanyToken,
  getCompanyById,
  getCompanyByRestaurantId,
  getCurrentLocations,
  filterNewLocations,
  filterExistingLocations,
  findLocationsToDelete,
  generatePlanInfo,
  generateUpdatePlanInfo
} = require('../../helpers/companyHelpers.js');

// Mock Prisma
const mockPrisma = {
  restaurant: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  restaurantUser: {
    create: jest.fn(),
    findFirst: jest.fn(),
  },
  user: {
    update: jest.fn(),
  },
  location: {
    findMany: jest.fn(),
  },
  talentPool: {
    findMany: jest.fn(),
  },
  jobOffer: {
    count: jest.fn(),
  },
};

// Mock the prisma import
jest.mock('../../db.js', () => ({
  prisma: mockPrisma,
}));

// Mock jwt
const mockJwt = {
  sign: jest.fn(),
};
jest.mock('jsonwebtoken', () => mockJwt);

describe('Company Helpers', () => {
  let helpers; // Declared to hold the re-required helpers

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules(); // Crucial for re-importing mocked modules
    helpers = require('../../helpers/companyHelpers.js'); // Re-require helpers to get fresh mocks
  });

  describe('getCompanies', () => {
    it('should return companies with filters and pagination', async () => {
      const mockCompanies = [
        { id: 1, name: 'Restaurant ABC', specialty: 'Italian' },
        { id: 2, name: 'Restaurant XYZ', specialty: 'Mexican' }
      ];
      mockPrisma.restaurant.findMany.mockResolvedValue(mockCompanies);

      const filters = { 
        specialty: { 
          contains: 'italian',
          mode: 'insensitive'
        } 
      };
      const searchConditions = { 
        name: { 
          contains: 'Restaurant',
          mode: 'insensitive'
        } 
      };
      const limit = 10;
      const skip = 0;

      const result = await helpers.getCompanies(filters, searchConditions, limit, skip);

      expect(mockPrisma.restaurant.findMany).toHaveBeenCalledWith({
        where: {
          ...searchConditions,
          ...filters,
        },
        include: {
          locations: true,
          jobOffers: {
            where: { deletedAt: null },
            include: {
              applications: {
                where: { deletedAt: null },
              },
            },
          },
          _count: {
            select: {
              jobOffers: true,
            },
          },
        },
        orderBy: {
          id: 'desc',
        },
        skip,
        take: limit,
      });
      expect(result).toEqual(mockCompanies);
    });

    it('should handle empty filters and search conditions', async () => {
      const mockCompanies = [{ id: 1, name: 'Restaurant ABC' }];
      mockPrisma.restaurant.findMany.mockResolvedValue(mockCompanies);

      const result = await helpers.getCompanies({}, {}, 10, 0);

      expect(mockPrisma.restaurant.findMany).toHaveBeenCalledWith({
        where: {},
        include: {
          locations: true,
          jobOffers: {
            where: { deletedAt: null },
            include: {
              applications: {
                where: { deletedAt: null },
              },
            },
          },
          _count: {
            select: {
              jobOffers: true,
            },
          },
        },
        orderBy: {
          id: 'desc',
        },
        skip: 0,
        take: 10,
      });
      expect(result).toEqual(mockCompanies);
    });
  });

  describe('getTotalCompanies', () => {
    it('should return total companies count', async () => {
      mockPrisma.restaurant.count.mockResolvedValue(25);

      const filters = { specialty: 'Italian' };
      const searchConditions = { name: { contains: 'Restaurant' } };

      const result = await helpers.getTotalCompanies(filters, searchConditions);

      expect(mockPrisma.restaurant.count).toHaveBeenCalledWith({
        where: {
          ...searchConditions,
          ...filters,
        },
      });
      expect(result).toBe(25);
    });
  });

  describe('getRestaurantUserByUserId', () => {
    it('should return restaurant user when found', async () => {
      const mockRestaurantUser = { id: 1, userId: 123, restaurantId: 456 };
      mockPrisma.restaurantUser.findFirst.mockResolvedValue(mockRestaurantUser);

      const result = await helpers.getRestaurantUserByUserId(123);

      expect(mockPrisma.restaurantUser.findFirst).toHaveBeenCalledWith({
        where: { userId: 123 },
        include: {
          restaurant: {
            include: {
              locations: true,
            },
          },
        },
      });
      expect(result).toEqual(mockRestaurantUser);
    });

    it('should return null when restaurant user not found', async () => {
      mockPrisma.restaurantUser.findFirst.mockResolvedValue(null);

      const result = await helpers.getRestaurantUserByUserId(123);

      expect(result).toBeNull();
    });
  });

  describe('getCompanyLocations', () => {
    it('should return company locations', async () => {
      const mockLocations = [
        { id: 1, address: '123 Main St', restaurantId: 1 },
        { id: 2, address: '456 Oak Ave', restaurantId: 1 }
      ];
      mockPrisma.location.findMany.mockResolvedValue(mockLocations);

      const result = await helpers.getCompanyLocations(1);

      expect(mockPrisma.location.findMany).toHaveBeenCalledWith({
        where: { restaurantId: 1 },
      });
      expect(result).toEqual(mockLocations);
    });

    it('should return empty array when no locations found', async () => {
      mockPrisma.location.findMany.mockResolvedValue([]);

      const result = await helpers.getCompanyLocations(1);

      expect(result).toEqual([]);
    });
  });

  describe('formatLocations', () => {
    it('should format locations correctly', () => {
      const mockLocations = [
        { id: 1, address: '123 Main St', region: 'Santiago', comuna: 'Providencia' },
        { id: 2, address: '456 Oak Ave', region: 'Valparaiso', comuna: 'Vina del Mar' }
      ];

      const result = helpers.formatLocations(mockLocations);

      expect(result).toEqual([
        { id: 1, address: '123 Main St', region: 'Santiago', comuna: 'Providencia' },
        { id: 2, address: '456 Oak Ave', region: 'Valparaiso', comuna: 'Vina del Mar' }
      ]);
    });

    it('should handle empty locations array', () => {
      const result = helpers.formatLocations([]);

      expect(result).toEqual([]);
    });
  });

  describe('getTopRatedCompanies', () => {
    it('should return top rated companies', async () => {
      const mockCompanies = [
        { id: 1, name: 'Restaurant ABC', _count: { jobOffers: 5 } },
        { id: 2, name: 'Restaurant XYZ', _count: { jobOffers: 3 } }
      ];
      mockPrisma.restaurant.findMany.mockResolvedValue(mockCompanies);

      const result = await helpers.getTopRatedCompanies(4, 0);

      expect(mockPrisma.restaurant.findMany).toHaveBeenCalledWith({
        include: {
          locations: true,
          jobOffers: {
            where: { deletedAt: null },
            include: {
              applications: {
                where: { deletedAt: null },
              },
            },
          },
          _count: {
            select: {
              jobOffers: true,
            },
          },
        },
        orderBy: {
          jobOffers: {
            _count: 'desc',
          },
        },
        skip: 0,
        take: 4,
      });
      expect(result).toEqual(mockCompanies);
    });
  });

  describe('getTotalCompaniesCount', () => {
    it('should return total companies count', async () => {
      mockPrisma.restaurant.count.mockResolvedValue(50);

      const result = await helpers.getTotalCompaniesCount();

      expect(mockPrisma.restaurant.count).toHaveBeenCalledWith();
      expect(result).toBe(50);
    });
  });

  describe('getTalentsApplications', () => {
    it('should return talents applications', async () => {
      const mockTalents = [
        { id: 1, employeeId: 1, restaurantId: 1, employee: { name: 'John Doe' } },
        { id: 2, employeeId: 2, restaurantId: 1, employee: { name: 'Jane Smith' } }
      ];
      mockPrisma.talentPool.findMany.mockResolvedValue(mockTalents);

      const result = await helpers.getTalentsApplications(1);

      expect(mockPrisma.talentPool.findMany).toHaveBeenCalledWith({
        where: { restaurantId: 1 },
        include: {
          employee: {
            include: {
              experiences: true,
              educations: true,
            },
          },
        },
      });
      expect(result).toEqual(mockTalents);
    });

    it('should return empty array when no talents found', async () => {
      mockPrisma.talentPool.findMany.mockResolvedValue([]);

      const result = await helpers.getTalentsApplications(1);

      expect(result).toEqual([]);
    });
  });

  describe('createCompanyProfile', () => {
    it('should create company profile successfully', async () => {
      const mockCompany = {
        id: 1,
        name: 'Restaurant ABC',
        specialty: 'Italian',
        userId: 123
      };
      mockPrisma.restaurant.create.mockResolvedValue(mockCompany);

      const companyData = {
        name: 'Restaurant ABC',
        specialty: 'Italian',
        format: 'Restaurant',
        description: 'A great Italian restaurant',
        rut: '12345678-9',
        legalName: 'Restaurant ABC LLC',
        region: 'Santiago',
        comuna: 'Providencia',
        numberOfRestaurants: 1,
        workers: 20,
        weeklyAverageClients: 500,
        benefits: ['Health Insurance', 'Meals'],
        locations: [],
        jobOffers: [],
        profileImageUrl: 'https://example.com/image.jpg',
        profileCarouselUrls: ['https://example.com/carousel1.jpg'],
        userId: 123
      };

      const result = await helpers.createCompanyProfile(companyData);

      expect(mockPrisma.restaurant.create).toHaveBeenCalledWith({
        data: {
          name: 'Restaurant ABC',
          specialty: 'Italian',
          format: 'Restaurant',
          description: 'A great Italian restaurant',
          rut: '12345678-9',
          legalName: 'Restaurant ABC LLC',
          region: 'Santiago',
          comuna: 'Providencia',
          numberOfRestaurants: 1,
          workers: '20',
          weeklyAverageClients: '500',
          benefits: ['Health Insurance', 'Meals'],
          profileImageUrl: 'https://example.com/image.jpg',
          profileCarouselUrls: ['https://example.com/carousel1.jpg'],
          user: { connect: { id: 123 } },
        },
      });
      expect(result).toEqual(mockCompany);
    });
  });

  describe('createRestaurantUser', () => {
    it('should create restaurant user successfully', async () => {
      const mockRestaurantUser = { id: 1, userId: 123, restaurantId: 456 };
      mockPrisma.restaurantUser.create.mockResolvedValue(mockRestaurantUser);

      const result = await helpers.createRestaurantUser(123, 456);

      expect(mockPrisma.restaurantUser.create).toHaveBeenCalledWith({
        data: {
          user: { connect: { id: 123 } },
          restaurant: { connect: { id: 456 } },
        },
      });
      expect(result).toEqual(mockRestaurantUser);
    });
  });

  describe('updateUserWithRestaurant', () => {
    it('should update user with restaurant successfully', async () => {
      const mockUpdatedUser = { id: 123, restaurantId: 456 };
      mockPrisma.user.update.mockResolvedValue(mockUpdatedUser);

      const result = await helpers.updateUserWithRestaurant(123, 456);

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 123 },
        data: { restaurant: { connect: { id: 456 } } },
      });
      expect(result).toEqual(mockUpdatedUser);
    });
  });

  describe('generateCompanyToken', () => {
    it('should generate company token successfully', () => {
      const mockToken = 'mock.jwt.token';
      mockJwt.sign.mockReturnValue(mockToken);

      const tokenData = {
        userId: 123,
        restaurantId: 456,
        restaurantUserId: 789,
        role: 'admin'
      };

      const result = helpers.generateCompanyToken(tokenData);

      expect(mockJwt.sign).toHaveBeenCalledWith(
        tokenData,
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );
      expect(result).toBe(mockToken);
    });
  });

  describe('getCompanyById', () => {
    it('should return company when found', async () => {
      const mockCompany = { id: 1, name: 'Restaurant ABC', specialty: 'Italian' };
      mockPrisma.restaurant.findUnique.mockResolvedValue(mockCompany);

      const result = await helpers.getCompanyById('1');

      expect(mockPrisma.restaurant.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        include: {
          locations: true,
          jobOffers: {
            where: { deletedAt: null },
            include: {
              applications: {
                where: { deletedAt: null },
              },
            },
          },
        },
      });
      expect(result).toEqual(mockCompany);
    });

    it('should return null when company not found', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(null);

      const result = await helpers.getCompanyById('1');

      expect(result).toBeNull();
    });
  });

  describe('getCompanyByRestaurantId', () => {
    it('should return company when found', async () => {
      const mockCompany = { id: 1, name: 'Restaurant ABC', specialty: 'Italian' };
      mockPrisma.restaurant.findUnique.mockResolvedValue(mockCompany);

      const result = await helpers.getCompanyByRestaurantId(1);

      expect(mockPrisma.restaurant.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        include: {
          locations: true,
          jobOffers: {
            where: { deletedAt: null },
            include: {
              applications: {
                where: { deletedAt: null },
              },
            },
          },
        },
      });
      expect(result).toEqual(mockCompany);
    });

    it('should return null when company not found', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(null);

      const result = await helpers.getCompanyByRestaurantId(1);

      expect(result).toBeNull();
    });
  });

  describe('getCurrentLocations', () => {
    it('should return current locations', async () => {
      const mockLocations = [
        { id: 1, address: '123 Main St', restaurantId: 1 },
        { id: 2, address: '456 Oak Ave', restaurantId: 1 }
      ];
      mockPrisma.location.findMany.mockResolvedValue(mockLocations);

      const result = await helpers.getCurrentLocations(1);

      expect(mockPrisma.location.findMany).toHaveBeenCalledWith({
        where: { restaurantId: 1 },
      });
      expect(result).toEqual(mockLocations);
    });

    it('should return empty array when no locations found', async () => {
      mockPrisma.location.findMany.mockResolvedValue([]);

      const result = await helpers.getCurrentLocations(1);

      expect(result).toEqual([]);
    });
  });

  describe('filterNewLocations', () => {
    it('should filter new locations correctly', () => {
      const locations = [
        { id: 1, address: '123 Main St' }, // Existing
        { address: '456 Oak Ave' }, // New
        { id: 2, address: '789 Pine St' }, // Existing
        { address: '321 Elm St' } // New
      ];

      const result = helpers.filterNewLocations(locations);

      expect(result).toEqual([
        { address: '456 Oak Ave' },
        { address: '321 Elm St' }
      ]);
    });

    it('should return empty array when no new locations', () => {
      const locations = [
        { id: 1, address: '123 Main St' },
        { id: 2, address: '456 Oak Ave' }
      ];

      const result = helpers.filterNewLocations(locations);

      expect(result).toEqual([]);
    });
  });

  describe('filterExistingLocations', () => {
    it('should filter existing locations correctly', () => {
      const locations = [
        { id: 1, address: '123 Main St' }, // Existing
        { address: '456 Oak Ave' }, // New
        { id: 2, address: '789 Pine St' }, // Existing
        { address: '321 Elm St' } // New
      ];

      const result = helpers.filterExistingLocations(locations);

      expect(result).toEqual([
        { id: 1, address: '123 Main St' },
        { id: 2, address: '789 Pine St' }
      ]);
    });

    it('should return empty array when no existing locations', () => {
      const locations = [
        { address: '123 Main St' },
        { address: '456 Oak Ave' }
      ];

      const result = helpers.filterExistingLocations(locations);

      expect(result).toEqual([]);
    });
  });

  describe('findLocationsToDelete', () => {
    it('should find locations to delete correctly', () => {
      const currentLocations = [
        { id: 1, address: '123 Main St' },
        { id: 2, address: '456 Oak Ave' },
        { id: 3, address: '789 Pine St' }
      ];
      const newLocations = [
        { id: 1, address: '123 Main St' }, // Keep
        { address: '321 Elm St' } // New
      ];

      const result = helpers.findLocationsToDelete(currentLocations, newLocations);

      expect(result).toEqual([
        { id: 2, address: '456 Oak Ave' },
        { id: 3, address: '789 Pine St' }
      ]);
    });

    it('should return empty array when no locations to delete', () => {
      const currentLocations = [
        { id: 1, address: '123 Main St' },
        { id: 2, address: '456 Oak Ave' }
      ];
      const newLocations = [
        { id: 1, address: '123 Main St' },
        { id: 2, address: '456 Oak Ave' }
      ];

      const result = helpers.findLocationsToDelete(currentLocations, newLocations);

      expect(result).toEqual([]);
    });
  });

  describe('generatePlanInfo', () => {
    it('should generate plan info for pro user', () => {
      const result = helpers.generatePlanInfo('pro', 2, 5);

      expect(result).toEqual({
        currentPlan: 'PRO',
        requestedLocations: 2,
        locationLimit: 5,
        remainingLocations: 3,
        upgradeMessage: 'Te quedan 3 ubicaciones de tu plan PRO.'
      });
    });

    it('should generate plan info for starter user', () => {
      const result = helpers.generatePlanInfo('starter', 1, 1);

      expect(result).toEqual({
        currentPlan: 'STARTER',
        requestedLocations: 1,
        locationLimit: 1,
        remainingLocations: 0,
        upgradeMessage: 'Has usado todas tus ubicaciones. Actualiza a PRO para más.'
      });
    });

    it('should handle unknown payment status', () => {
      const result = helpers.generatePlanInfo('unknown', 1, 1);

      expect(result.currentPlan).toBe('STARTER');
    });
  });

  describe('generateUpdatePlanInfo', () => {
    it('should generate update plan info for pro user', () => {
      const result = helpers.generateUpdatePlanInfo('pro', 2, 5);

      expect(result).toEqual({
        currentPlan: 'PRO',
        requestedLocations: 2,
        locationLimit: 5,
        remainingLocations: 3,
        upgradeMessage: 'Te quedan 3 ubicaciones de tu plan PRO.'
      });
    });

    it('should generate update plan info for starter user', () => {
      const result = helpers.generateUpdatePlanInfo('starter', 1, 1);

      expect(result).toEqual({
        currentPlan: 'STARTER',
        requestedLocations: 1,
        locationLimit: 1,
        remainingLocations: 0,
        upgradeMessage: 'Has usado todas tus ubicaciones. Actualiza a PRO para más.'
      });
    });

    it('should handle unknown payment status', () => {
      const result = helpers.generateUpdatePlanInfo('unknown', 1, 1);

      expect(result.currentPlan).toBe('STARTER');
    });
  });
}); 
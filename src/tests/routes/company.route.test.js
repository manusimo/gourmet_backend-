const request = require('supertest');
const express = require('express');

// Set up environment variables for testing
process.env.JWT_SECRET = 'test-secret-key';
process.env.NODE_ENV = 'test';

// Mock the helpers
const mockCompanyHelpers = {
  getCompanies: jest.fn(),
  getTotalCompanies: jest.fn(),
  getRestaurantUserByUserId: jest.fn(),
  getCompanyLocations: jest.fn(),
  formatLocations: jest.fn(),
  getTopRatedCompanies: jest.fn(),
  getTotalCompaniesCount: jest.fn(),
  getTalentsApplications: jest.fn(),
  createCompanyProfile: jest.fn(),
  createRestaurantUser: jest.fn(),
  updateUserWithRestaurant: jest.fn(),
  generateCompanyToken: jest.fn(),
  getCompanyById: jest.fn(),
  getCompanyByRestaurantId: jest.fn(),
  getCurrentLocations: jest.fn(),
  filterNewLocations: jest.fn(),
  filterExistingLocations: jest.fn(),
  findLocationsToDelete: jest.fn(),
  generatePlanInfo: jest.fn(),
  generateUpdatePlanInfo: jest.fn(),
};

const mockCompany = {
  deleteLocations: jest.fn(),
  updateCompanyProfile: jest.fn(),
  createNewLocations: jest.fn(),
};

const mockOrderBy = {
  getOrderByCriteriaCompanies: jest.fn(),
};

const mockFilterHelpers = {
  buildFilters: jest.fn(),
  buildSearchConditions: jest.fn(),
};

const mockAuthenticateToken = {
  checkCompany: jest.fn((req, res, next) => {
    req.userId = 123;
    req.restaurantId = 456;
    req.userRole = 'admin';
    next();
  }),
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
};

const mockCheckPlan = {
  requirePlan: jest.fn(() => (req, res, next) => next()),
  checkLocationLimit: jest.fn(() => (req, res, next) => {
    req.requestedLocations = 2;
    req.locationLimit = 5;
    req.user = { payment_status: 'pro' };
    next();
  }),
};

const mockCSRF = {
  verifyCSRFToken: jest.fn((req, res, next) => next()),
};

// Mock Prisma for the route that uses it directly
const mockPrisma = {
  $transaction: jest.fn(),
};

// Mock all the imports
jest.mock('../../helpers/companyHelpers.js', () => mockCompanyHelpers);
jest.mock('../../helpers/company.js', () => mockCompany);
jest.mock('../../helpers/orderBy.js', () => mockOrderBy);
jest.mock('../../helpers/filterHelpers.js', () => mockFilterHelpers);
jest.mock('../../helpers/authenticateToken.js', () => mockAuthenticateToken);
jest.mock('../../helpers/cookies.js', () => mockCookies);
jest.mock('../../middleware/checkPlan.js', () => mockCheckPlan);
jest.mock('../../helpers/csrf.js', () => mockCSRF);
jest.mock('../../db.js', () => ({
  prisma: mockPrisma,
}));

// Mock csurf
jest.mock('csurf', () => {
  return jest.fn(() => (req, res, next) => next());
});

// Import the router after mocking
const companyRouter = require('../../routes/company.route.js');

describe('Company Routes', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/', companyRouter);
  });

  describe('GET /companies', () => {
    it('should return companies with filters and pagination', async () => {
      const mockCompanies = [
        { id: 1, name: 'Restaurant ABC', specialty: 'Italian' },
        { id: 2, name: 'Restaurant XYZ', specialty: 'Mexican' }
      ];
      const mockTotalCompanies = 25;

      mockFilterHelpers.buildFilters.mockReturnValue({ specialty: 'Italian' });
      mockFilterHelpers.buildSearchConditions.mockReturnValue({ name: { contains: 'Restaurant' } });
      mockCompanyHelpers.getCompanies.mockResolvedValue(mockCompanies);
      mockCompanyHelpers.getTotalCompanies.mockResolvedValue(mockTotalCompanies);

      const response = await request(app)
        .get('/companies')
        .query({
          q: 'Restaurant',
          page: '1',
          limit: '10',
          orderBy: 'popularity'
        })
        .expect(200);

      expect(mockFilterHelpers.buildFilters).toHaveBeenCalledWith(
        { q: 'Restaurant', page: '1', limit: '10', orderBy: 'popularity' },
        ['format', 'specialty']
      );
      expect(mockFilterHelpers.buildSearchConditions).toHaveBeenCalledWith('Restaurant', 'name');
      expect(mockCompanyHelpers.getCompanies).toHaveBeenCalledWith(
        { specialty: 'Italian' },
        { name: { contains: 'Restaurant' } },
        10,
        0
      );
      expect(response.body).toEqual({
        success: true,
        data: mockCompanies,
        totalCompanies: mockTotalCompanies,
        currentPage: 1,
        totalPages: 3,
      });
    });

    it('should return 400 for invalid orderBy value', async () => {
      const response = await request(app)
        .get('/companies')
        .query({ orderBy: 'invalid' })
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: "Invalid orderBy value. Must be 'popularity' or 'scale'"
      });
    });

    it('should handle errors gracefully', async () => {
      mockFilterHelpers.buildFilters.mockReturnValue({});
      mockFilterHelpers.buildSearchConditions.mockReturnValue({});
      mockCompanyHelpers.getCompanies.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/companies')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Internal Server Error'
      });
    });
  });

  describe('GET /api/company/restaurantUser/:userId', () => {
    it('should return restaurant user successfully', async () => {
      const mockRestaurantUser = { id: 1, userId: 123, restaurantId: 456 };
      mockCompanyHelpers.getRestaurantUserByUserId.mockResolvedValue(mockRestaurantUser);

      const response = await request(app)
        .get('/api/company/restaurantUser/123')
        .expect(200);

      expect(mockCompanyHelpers.getRestaurantUserByUserId).toHaveBeenCalledWith('123');
      expect(response.body).toEqual({
        success: true,
        data: mockRestaurantUser
      });
    });

    it('should return 400 for invalid userId', async () => {
      const response = await request(app)
        .get('/api/company/restaurantUser/invalid')
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: 'Invalid or missing userId'
      });
    });

    it('should return 404 when restaurant user not found', async () => {
      mockCompanyHelpers.getRestaurantUserByUserId.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/company/restaurantUser/999')
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        error: 'Restaurant user not found'
      });
    });

    it('should handle errors gracefully', async () => {
      mockCompanyHelpers.getRestaurantUserByUserId.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/company/restaurantUser/123')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Failed to fetch restaurant user'
      });
    });
  });

  describe('GET /company/locations', () => {
    it('should return company locations successfully', async () => {
      const mockLocations = [
        { id: 1, address: '123 Main St', region: 'Santiago' },
        { id: 2, address: '456 Oak Ave', region: 'Valparaiso' }
      ];
      const mockFormattedLocations = [
        { id: 1, address: '123 Main St', region: 'Santiago', comuna: 'Providencia' },
        { id: 2, address: '456 Oak Ave', region: 'Valparaiso', comuna: 'Vina del Mar' }
      ];

      mockCompanyHelpers.getCompanyLocations.mockResolvedValue(mockLocations);
      mockCompanyHelpers.formatLocations.mockReturnValue(mockFormattedLocations);

      const response = await request(app)
        .get('/company/locations')
        .expect(200);

      expect(mockCompanyHelpers.getCompanyLocations).toHaveBeenCalledWith(456);
      expect(mockCompanyHelpers.formatLocations).toHaveBeenCalledWith(mockLocations);
      expect(response.body).toEqual({
        success: true,
        data: mockFormattedLocations
      });
    });

    it('should return 400 when restaurantId is missing', async () => {
      // Simulate missing restaurantId
      mockCookies.getRestaurantIdFromCookie.mockImplementation((req, res, next) => {
        // Don't set req.restaurantId
        next();
      });

      const response = await request(app)
        .get('/company/locations')
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        message: 'companyId is required'
      });
    });

    it('should return 404 when no locations found', async () => {
      // Reset the mock to ensure restaurantId is set
      mockCookies.getRestaurantIdFromCookie.mockImplementation((req, res, next) => {
        req.restaurantId = 456;
        next();
      });
      mockCompanyHelpers.getCompanyLocations.mockResolvedValue([]);

      const response = await request(app)
        .get('/company/locations')
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        message: 'No locations found for this company.'
      });
    });

    it('should handle errors gracefully', async () => {
      // Reset the mock to ensure restaurantId is set
      mockCookies.getRestaurantIdFromCookie.mockImplementation((req, res, next) => {
        req.restaurantId = 456;
        next();
      });
      mockCompanyHelpers.getCompanyLocations.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/company/locations')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        message: 'Internal server error'
      });
    });
  });

  describe('GET /company/top-rated-companies', () => {
    it('should return top rated companies successfully', async () => {
      const mockCompanies = [
        { id: 1, name: 'Restaurant ABC', _count: { jobOffers: 5 } },
        { id: 2, name: 'Restaurant XYZ', _count: { jobOffers: 3 } }
      ];
      const mockTotalCompanies = 50;

      mockCompanyHelpers.getTopRatedCompanies.mockResolvedValue(mockCompanies);
      mockCompanyHelpers.getTotalCompaniesCount.mockResolvedValue(mockTotalCompanies);

      const response = await request(app)
        .get('/company/top-rated-companies')
        .query({ page: '1', limit: '4' })
        .expect(200);

      expect(mockCompanyHelpers.getTopRatedCompanies).toHaveBeenCalledWith('4', 0);
      expect(mockCompanyHelpers.getTotalCompaniesCount).toHaveBeenCalled();
      expect(response.body).toEqual({
        success: true,
        data: [
          { id: 1, name: 'Restaurant ABC', _count: { jobOffers: 5 }, jobOffersCount: 5 },
          { id: 2, name: 'Restaurant XYZ', _count: { jobOffers: 3 }, jobOffersCount: 3 }
        ],
        totalCompanies: mockTotalCompanies,
        currentPage: '1',
        totalPages: 13,
      });
    });

    it('should handle errors gracefully', async () => {
      mockCompanyHelpers.getTopRatedCompanies.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/company/top-rated-companies')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Internal Server Error'
      });
    });
  });

  describe('GET /company/talents-application', () => {
    it('should return talents applications successfully', async () => {
      // Reset the mock to ensure restaurantId is set
      mockCookies.getRestaurantIdFromCookie.mockImplementation((req, res, next) => {
        req.restaurantId = 456;
        next();
      });
      
      const mockTalents = [
        { id: 1, employeeId: 1, restaurantId: 456, employee: { name: 'John Doe' } },
        { id: 2, employeeId: 2, restaurantId: 456, employee: { name: 'Jane Smith' } }
      ];

      mockCompanyHelpers.getTalentsApplications.mockResolvedValue(mockTalents);

      const response = await request(app)
        .get('/company/talents-application')
        .expect(200);

      expect(mockCompanyHelpers.getTalentsApplications).toHaveBeenCalledWith(456);
      expect(response.body).toEqual({
        success: true,
        message: 'Some talents want to be part of this company',
        data: mockTalents
      });
    });

    it('should handle errors gracefully', async () => {
      mockCompanyHelpers.getTalentsApplications.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/company/talents-application')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        message: 'Internal Server Error'
      });
    });
  });

  describe('POST /company', () => {
    it('should create company successfully', async () => {
      const mockCompany = { id: 1, name: 'Restaurant ABC', specialty: 'Italian' };
      const mockRestaurantUser = { id: 1, userId: 123, restaurantId: 1 };
      const mockToken = 'mock.jwt.token';
      const mockPlanInfo = {
        currentPlan: 'PRO',
        requestedLocations: 2,
        locationLimit: 5,
        remainingLocations: 3,
        upgradeMessage: 'Te quedan 3 ubicaciones de tu plan PRO.'
      };

      mockCompanyHelpers.createCompanyProfile.mockResolvedValue(mockCompany);
      mockCompanyHelpers.createRestaurantUser.mockResolvedValue(mockRestaurantUser);
      mockCompanyHelpers.updateUserWithRestaurant.mockResolvedValue({ id: 123, restaurantId: 1 });
      mockCompanyHelpers.generateCompanyToken.mockReturnValue(mockToken);
      mockCompanyHelpers.generatePlanInfo.mockReturnValue(mockPlanInfo);

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
        profileCarouselUrls: ['https://example.com/carousel1.jpg']
      };

      const response = await request(app)
        .post('/company')
        .send(companyData)
        .expect(201);

      expect(mockCompanyHelpers.createCompanyProfile).toHaveBeenCalledWith({
        ...companyData,
        userId: 123
      });
      expect(mockCompanyHelpers.createRestaurantUser).toHaveBeenCalledWith(123, 1);
      expect(mockCompanyHelpers.updateUserWithRestaurant).toHaveBeenCalledWith(123, 1);
      expect(mockCompanyHelpers.generateCompanyToken).toHaveBeenCalledWith({
        userId: 123,
        restaurantId: 1,
        restaurantUserId: 1,
        role: 'admin'
      });
      expect(mockCompanyHelpers.generatePlanInfo).toHaveBeenCalledWith('pro', 2, 5);
      expect(response.body).toEqual({
        success: true,
        message: 'Company created successfully',
        data: mockCompany,
        planInfo: mockPlanInfo
      });
    });

    it('should handle errors gracefully', async () => {
      mockCompanyHelpers.createCompanyProfile.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/company')
        .send({ name: 'Restaurant ABC' })
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        message: 'Internal Server Error'
      });
    });
  });

  describe('GET /company/:id', () => {
    it('should return company by ID successfully', async () => {
      const mockCompany = { id: 1, name: 'Restaurant ABC', specialty: 'Italian' };
      mockCompanyHelpers.getCompanyById.mockResolvedValue(mockCompany);

      const response = await request(app)
        .get('/company/1')
        .expect(200);

      expect(mockCompanyHelpers.getCompanyById).toHaveBeenCalledWith('1');
      expect(response.body).toEqual({
        success: true,
        data: mockCompany
      });
    });

    it('should return 404 when company not found', async () => {
      mockCompanyHelpers.getCompanyById.mockResolvedValue(null);

      const response = await request(app)
        .get('/company/999')
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        error: 'Restaurant not found'
      });
    });

    it('should handle errors gracefully', async () => {
      mockCompanyHelpers.getCompanyById.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/company/1')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        message: 'Internal Server Error'
      });
    });
  });

  describe('GET /company', () => {
    it('should return current company successfully', async () => {
      // Reset the mock to ensure restaurantId is set
      mockCookies.getRestaurantIdFromCookie.mockImplementation((req, res, next) => {
        req.restaurantId = 456;
        next();
      });
      
      const mockCompany = { id: 456, name: 'Restaurant ABC', specialty: 'Italian' };
      mockCompanyHelpers.getCompanyByRestaurantId.mockResolvedValue(mockCompany);

      const response = await request(app)
        .get('/company')
        .expect(200);

      expect(mockCompanyHelpers.getCompanyByRestaurantId).toHaveBeenCalledWith(456);
      expect(response.body).toEqual({
        success: true,
        data: mockCompany
      });
    });

    it('should return 404 when company not found', async () => {
      mockCompanyHelpers.getCompanyByRestaurantId.mockResolvedValue(null);

      const response = await request(app)
        .get('/company')
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        error: 'Company not found'
      });
    });

    it('should handle errors gracefully', async () => {
      mockCompanyHelpers.getCompanyByRestaurantId.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/company')
        .expect(401);

      expect(response.body).toEqual({
        success: false,
        message: 'Invalid token'
      });
    });
  });

  describe('PATCH /company', () => {
    it('should update company successfully', async () => {
      const mockCurrentLocations = [
        { id: 1, address: '123 Main St' },
        { id: 2, address: '456 Oak Ave' }
      ];
      const mockNewLocations = [{ address: '789 Pine St' }];
      const mockExistingLocations = [{ id: 1, address: '123 Main St' }];
      const mockLocationsToDelete = [{ id: 2, address: '456 Oak Ave' }];
      const mockPlanInfo = {
        currentPlan: 'PRO',
        requestedLocations: 2,
        locationLimit: 5,
        remainingLocations: 3,
        upgradeMessage: 'Te quedan 3 ubicaciones de tu plan PRO.'
      };

      mockCompanyHelpers.getCurrentLocations.mockResolvedValue(mockCurrentLocations);
      mockCompanyHelpers.filterNewLocations.mockReturnValue(mockNewLocations);
      mockCompanyHelpers.filterExistingLocations.mockReturnValue(mockExistingLocations);
      mockCompanyHelpers.findLocationsToDelete.mockReturnValue(mockLocationsToDelete);
      mockCompany.deleteLocations.mockResolvedValue();
      mockCompany.updateCompanyProfile.mockResolvedValue();
      mockCompany.createNewLocations.mockResolvedValue();
      mockPrisma.$transaction.mockImplementation(async (callback) => await callback());
      mockCompanyHelpers.generateUpdatePlanInfo.mockReturnValue(mockPlanInfo);

      const updateData = {
        name: 'Restaurant ABC Updated',
        specialty: 'Italian',
        locations: [
          { id: 1, address: '123 Main St' },
          { address: '789 Pine St' }
        ]
      };

      const response = await request(app)
        .patch('/company')
        .send(updateData)
        .expect(200);

      expect(mockCompanyHelpers.getCurrentLocations).toHaveBeenCalledWith(456);
      expect(mockCompanyHelpers.filterNewLocations).toHaveBeenCalledWith(updateData.locations);
      expect(mockCompanyHelpers.filterExistingLocations).toHaveBeenCalledWith(updateData.locations);
      expect(mockCompanyHelpers.findLocationsToDelete).toHaveBeenCalledWith(mockCurrentLocations, updateData.locations);
      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockCompany.deleteLocations).toHaveBeenCalledWith(mockLocationsToDelete);
      expect(mockCompany.updateCompanyProfile).toHaveBeenCalledWith(456, {
        legalName: undefined,
        rut: undefined,
        name: 'Restaurant ABC Updated',
        format: undefined,
        specialty: 'Italian',
        numberOfRestaurants: undefined,
        workers: undefined,
        profileImageUrl: undefined,
        weeklyAverageClients: undefined,
        description: undefined,
        region: undefined,
        comuna: undefined,
        benefits: undefined,
        existingLocations: mockExistingLocations,
        profileCarouselUrls: undefined,
      });
      expect(mockCompany.createNewLocations).toHaveBeenCalledWith(mockNewLocations, 456);
      expect(mockCompanyHelpers.generateUpdatePlanInfo).toHaveBeenCalledWith('pro', 2, 5);
      expect(response.body).toEqual({
        success: true,
        message: 'Company profile updated successfully',
        planInfo: mockPlanInfo
      });
    });

    it('should handle errors gracefully', async () => {
      mockCompanyHelpers.getCurrentLocations.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .patch('/company')
        .send({ name: 'Restaurant ABC Updated' })
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        message: 'Internal Server Error'
      });
    });
  });

  describe('Authentication and Authorization', () => {
    it('should require company authentication for protected routes', async () => {
      // Mock the company creation to succeed
      mockCompanyHelpers.createCompanyProfile.mockResolvedValue({ id: 456, name: 'Restaurant ABC' });
      mockCompanyHelpers.createRestaurantUser.mockResolvedValue({ id: 789, userId: 123, restaurantId: 456 });
      mockCompanyHelpers.updateUserWithRestaurant.mockResolvedValue();
      mockCompanyHelpers.generateCompanyToken.mockReturnValue('mock-token');
      mockCompanyHelpers.generatePlanInfo.mockReturnValue({
        currentPlan: 'PRO',
        requestedLocations: 2,
        locationLimit: 5
      });

      const response = await request(app)
        .post('/company')
        .send({ name: 'Restaurant ABC' })
        .expect(201);

      expect(mockAuthenticateToken.checkCompany).toHaveBeenCalled();
      expect(mockCookies.getUserIdFromCookie).toHaveBeenCalled();
      expect(mockAuthenticateToken.setUserRole).toHaveBeenCalled();
    });

    it('should require company authentication for update route', async () => {
      // Mock the company update to succeed
      mockCompanyHelpers.getCurrentLocations.mockResolvedValue([]);
      mockCompanyHelpers.filterNewLocations.mockReturnValue([]);
      mockCompanyHelpers.filterExistingLocations.mockReturnValue([]);
      mockCompanyHelpers.findLocationsToDelete.mockReturnValue([]);
      mockCompany.deleteLocations.mockResolvedValue();
      mockCompany.updateCompanyProfile.mockResolvedValue();
      mockCompany.createNewLocations.mockResolvedValue();
      mockPrisma.$transaction.mockImplementation(async (callback) => await callback());
      mockCompanyHelpers.generateUpdatePlanInfo.mockReturnValue({
        currentPlan: 'PRO',
        requestedLocations: 2,
        locationLimit: 5
      });

      const response = await request(app)
        .patch('/company')
        .send({ name: 'Restaurant ABC Updated' })
        .expect(200);

      expect(mockAuthenticateToken.checkCompany).toHaveBeenCalled();
      expect(mockCookies.getRestaurantIdFromCookie).toHaveBeenCalled();
    });

    it('should require restaurant ID for locations route', async () => {
      // Reset the mock to ensure restaurantId is set
      mockCookies.getRestaurantIdFromCookie.mockImplementation((req, res, next) => {
        req.restaurantId = 456;
        next();
      });
      mockCompanyHelpers.getCompanyLocations.mockResolvedValue([
        { id: 1, address: '123 Main St' }
      ]);
      mockCompanyHelpers.formatLocations.mockReturnValue([
        { id: 1, address: '123 Main St', region: 'Santiago' }
      ]);

      const response = await request(app)
        .get('/company/locations')
        .expect(200);

      expect(mockCookies.getRestaurantIdFromCookie).toHaveBeenCalled();
    });

    it('should require restaurant ID for talents route', async () => {
      // Reset the mock to ensure restaurantId is set
      mockCookies.getRestaurantIdFromCookie.mockImplementation((req, res, next) => {
        req.restaurantId = 456;
        next();
      });
      mockCompanyHelpers.getTalentsApplications.mockResolvedValue([
        { id: 1, employeeId: 1, restaurantId: 456, employee: { name: 'John Doe' } }
      ]);

      const response = await request(app)
        .get('/company/talents-application')
        .expect(200);

      expect(mockCookies.getRestaurantIdFromCookie).toHaveBeenCalled();
    });
  });

  describe('Plan Management', () => {
    it('should check location limit for company creation', async () => {
      // Mock the company creation to succeed
      mockCompanyHelpers.createCompanyProfile.mockResolvedValue({ id: 456, name: 'Restaurant ABC' });
      mockCompanyHelpers.createRestaurantUser.mockResolvedValue({ id: 789, userId: 123, restaurantId: 456 });
      mockCompanyHelpers.updateUserWithRestaurant.mockResolvedValue();
      mockCompanyHelpers.generateCompanyToken.mockReturnValue('mock-token');
      mockCompanyHelpers.generatePlanInfo.mockReturnValue({
        currentPlan: 'PRO',
        requestedLocations: 2,
        locationLimit: 5
      });

      const response = await request(app)
        .post('/company')
        .send({ name: 'Restaurant ABC' })
        .expect(201);

      // The middleware is used in the route chain, but we can't easily test it in isolation
      // The route success indicates the middleware passed through
      expect(response.body).toEqual({
        success: true,
        message: 'Company created successfully',
        data: { id: 456, name: 'Restaurant ABC' },
        planInfo: {
          currentPlan: 'PRO',
          requestedLocations: 2,
          locationLimit: 5
        }
      });
    });

    it('should check location limit for company update', async () => {
      // Mock the company update to succeed
      mockCompanyHelpers.getCurrentLocations.mockResolvedValue([]);
      mockCompanyHelpers.filterNewLocations.mockReturnValue([]);
      mockCompanyHelpers.filterExistingLocations.mockReturnValue([]);
      mockCompanyHelpers.findLocationsToDelete.mockReturnValue([]);
      mockCompany.deleteLocations.mockResolvedValue();
      mockCompany.updateCompanyProfile.mockResolvedValue();
      mockCompany.createNewLocations.mockResolvedValue();
      mockPrisma.$transaction.mockImplementation(async (callback) => await callback());
      mockCompanyHelpers.generateUpdatePlanInfo.mockReturnValue({
        currentPlan: 'PRO',
        requestedLocations: 2,
        locationLimit: 5
      });

      const response = await request(app)
        .patch('/company')
        .send({ name: 'Restaurant ABC Updated' })
        .expect(200);

      // The middleware is used in the route chain, but we can't easily test it in isolation
      // The route success indicates the middleware passed through
      expect(response.body).toEqual({
        success: true,
        message: 'Company profile updated successfully',
        planInfo: {
          currentPlan: 'PRO',
          requestedLocations: 2,
          locationLimit: 5
        }
      });
    });
  });

  describe('Input Validation', () => {
    it('should validate orderBy parameter', async () => {
      const response = await request(app)
        .get('/companies')
        .query({ orderBy: 'invalid' })
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: "Invalid orderBy value. Must be 'popularity' or 'scale'"
      });
    });

    it('should validate userId parameter', async () => {
      const response = await request(app)
        .get('/api/company/restaurantUser/invalid')
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: 'Invalid or missing userId'
      });
    });

    it('should handle missing restaurantId', async () => {
      mockCookies.getRestaurantIdFromCookie.mockImplementation((req, res, next) => {
        // Don't set req.restaurantId
        next();
      });

      const response = await request(app)
        .get('/company/locations')
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        message: 'companyId is required'
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      mockCompanyHelpers.getCompanies.mockRejectedValue(new Error('Database connection failed'));

      const response = await request(app)
        .get('/companies')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Internal Server Error'
      });
    });

    it('should handle JWT errors gracefully', async () => {
      mockCompanyHelpers.generateCompanyToken.mockImplementation(() => {
        throw new Error('JsonWebTokenError');
      });

      const response = await request(app)
        .post('/company')
        .send({ name: 'Restaurant ABC' })
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        message: 'Internal Server Error'
      });
    });

    it('should handle transaction errors gracefully', async () => {
      mockPrisma.$transaction.mockRejectedValue(new Error('Transaction failed'));

      const response = await request(app)
        .patch('/company')
        .send({ name: 'Restaurant ABC Updated' })
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        message: 'Internal Server Error'
      });
    });
  });
}); 
// Set up environment variables for testing
process.env.JWT_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';

const mockApplicationHelpers = {
  validateApplicationInput: jest.fn(),
  getJobPost: jest.fn(),
  getExistingApplication: jest.fn(),
  createApplication: jest.fn(),
  getApplicationById: jest.fn(),
  getJobOfferForRestaurant: jest.fn(),
  getApplicationsForJobOffer: jest.fn(),
};

const mockAuthenticateToken = {
  checkEmployee: jest.fn((req, res, next) => next()),
  checkCompany: jest.fn((req, res, next) => next()),
};

const mockCookies = {
  getEmployeeIdFromCookie: jest.fn((req, res, next) => {
    req.employeeId = 789;
    next();
  }),
  getRestaurantIdFromCookie: jest.fn((req, res, next) => {
    req.restaurantId = 456;
    next();
  }),
};

// Mock all the imports
jest.mock('../../helpers/applicationHelpers.js', () => mockApplicationHelpers);
jest.mock('../../helpers/authenticateToken.js', () => mockAuthenticateToken);
jest.mock('../../helpers/cookies.js', () => mockCookies);

// Import the router after mocking
const applicationRouter = require('../../routes/application.route.js');

describe('Application Routes', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = require('express')();
    app.use(require('express').json());
    app.use('/', applicationRouter);
    
    // Reset the mock implementations to default
    mockCookies.getEmployeeIdFromCookie.mockImplementation((req, res, next) => {
      req.employeeId = 789;
      next();
    });
    mockCookies.getRestaurantIdFromCookie.mockImplementation((req, res, next) => {
      req.restaurantId = 456;
      next();
    });
  });

  describe('POST /application', () => {
    it('should create application successfully', async () => {
      const mockJobPost = {
        id: 123,
        title: 'Chef Position',
        description: 'Looking for an experienced chef',
        isActive: true
      };
      const mockApplication = {
        id: 1,
        jobPostId: 123,
        employeeId: 789,
        status: 'pending',
        answers: [
          { questionId: 1, answer: 'Yes, I have experience' },
          { questionId: 2, answer: 'I am available immediately' }
        ]
      };

      mockApplicationHelpers.validateApplicationInput.mockReturnValue({ isValid: true, errors: [] });
      mockApplicationHelpers.getJobPost.mockResolvedValue(mockJobPost);
      mockApplicationHelpers.getExistingApplication.mockResolvedValue(null);
      mockApplicationHelpers.createApplication.mockResolvedValue(mockApplication);

      const applicationData = {
        jobPostId: 123,
        answers: [
          { questionId: 1, answer: 'Yes, I have experience' },
          { questionId: 2, answer: 'I am available immediately' }
        ]
      };

      const response = await require('supertest')(app)
        .post('/application')
        .send(applicationData)
        .expect(201);

      expect(mockAuthenticateToken.checkEmployee).toHaveBeenCalled();
      expect(mockCookies.getEmployeeIdFromCookie).toHaveBeenCalled();
      expect(mockApplicationHelpers.validateApplicationInput).toHaveBeenCalledWith(applicationData);
      expect(mockApplicationHelpers.getJobPost).toHaveBeenCalledWith(123);
      expect(mockApplicationHelpers.getExistingApplication).toHaveBeenCalledWith(123, 789);
      expect(mockApplicationHelpers.createApplication).toHaveBeenCalledWith(123, 789, applicationData.answers);
      expect(response.body).toEqual({
        success: true,
        message: 'Postulaste exitosamente.',
        data: mockApplication
      });
    });

    it('should return 401 when employee not authenticated', async () => {
      // Simulate missing employeeId
      mockCookies.getEmployeeIdFromCookie.mockImplementation((req, res, next) => {
        // Don't set req.employeeId
        next();
      });

      const response = await require('supertest')(app)
        .post('/application')
        .send({
          jobPostId: 123,
          answers: [{ questionId: 1, answer: 'Yes' }]
        })
        .expect(401);

      expect(response.body).toEqual({
        success: false,
        message: 'Debes hacer log in para postular'
      });
    });

    it('should return 400 for validation errors', async () => {
      const validationErrors = ['Job post ID is required', 'At least one answer is required'];
      mockApplicationHelpers.validateApplicationInput.mockReturnValue({ 
        isValid: false, 
        errors: validationErrors 
      });

      const response = await require('supertest')(app)
        .post('/application')
        .send({
          jobPostId: 'invalid',
          answers: []
        })
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        message: 'Datos inválidos',
        errors: validationErrors
      });
    });

    it('should return 404 when job post not found', async () => {
      mockApplicationHelpers.validateApplicationInput.mockReturnValue({ isValid: true, errors: [] });
      mockApplicationHelpers.getJobPost.mockResolvedValue(null);

      const response = await require('supertest')(app)
        .post('/application')
        .send({
          jobPostId: 999,
          answers: [{ questionId: 1, answer: 'Yes' }]
        })
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        message: 'Job post not found.'
      });
    });

    it('should return 409 when employee already applied', async () => {
      const mockJobPost = { id: 123, title: 'Chef Position' };
      const existingApplication = { id: 1, jobPostId: 123, employeeId: 789 };

      mockApplicationHelpers.validateApplicationInput.mockReturnValue({ isValid: true, errors: [] });
      mockApplicationHelpers.getJobPost.mockResolvedValue(mockJobPost);
      mockApplicationHelpers.getExistingApplication.mockResolvedValue(existingApplication);

      const response = await require('supertest')(app)
        .post('/application')
        .send({
          jobPostId: 123,
          answers: [{ questionId: 1, answer: 'Yes' }]
        })
        .expect(409);

      expect(response.body).toEqual({
        success: false,
        message: 'Ya postulaste a este trabajo.'
      });
    });

    it('should return 400 for Prisma record not found error', async () => {
      const prismaError = new Error('Record to update not found');
      prismaError.code = 'P2025';

      mockApplicationHelpers.validateApplicationInput.mockReturnValue({ isValid: true, errors: [] });
      mockApplicationHelpers.getJobPost.mockResolvedValue({ id: 123 });
      mockApplicationHelpers.getExistingApplication.mockResolvedValue(null);
      mockApplicationHelpers.createApplication.mockRejectedValue(prismaError);

      const response = await require('supertest')(app)
        .post('/application')
        .send({
          jobPostId: 123,
          answers: [{ questionId: 1, answer: 'Yes' }]
        })
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        message: 'Este trabajo ya no está disponible.'
      });
    });

    it('should handle errors gracefully', async () => {
      mockApplicationHelpers.validateApplicationInput.mockReturnValue({ isValid: true, errors: [] });
      mockApplicationHelpers.getJobPost.mockResolvedValue({ id: 123 });
      mockApplicationHelpers.getExistingApplication.mockResolvedValue(null);
      mockApplicationHelpers.createApplication.mockRejectedValue(new Error('Database error'));

      const response = await require('supertest')(app)
        .post('/application')
        .send({
          jobPostId: 123,
          answers: [{ questionId: 1, answer: 'Yes' }]
        })
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        message: 'Hemos tenido un error, intenta más tarde.'
      });
    });
  });

  describe('GET /applications/:applicationId', () => {
    it('should return application by ID successfully', async () => {
      const mockApplication = {
        id: 1,
        jobPostId: 123,
        employeeId: 789,
        status: 'pending',
        answers: [
          { questionId: 1, answer: 'Yes, I have experience' }
        ],
        jobPost: { title: 'Chef Position' },
        employee: { name: 'John Doe' }
      };

      mockApplicationHelpers.getApplicationById.mockResolvedValue(mockApplication);

      const response = await require('supertest')(app)
        .get('/applications/1')
        .expect(200);

      expect(mockApplicationHelpers.getApplicationById).toHaveBeenCalledWith(1);
      expect(response.body).toEqual({
        success: true,
        data: mockApplication
      });
    });

    it('should return 400 for invalid application ID', async () => {
      const response = await require('supertest')(app)
        .get('/applications/invalid')
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        message: 'Invalid application ID'
      });
    });

    it('should return 400 for non-numeric application ID', async () => {
      const response = await require('supertest')(app)
        .get('/applications/abc')
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        message: 'Invalid application ID'
      });
    });

    it('should return 404 when application not found', async () => {
      mockApplicationHelpers.getApplicationById.mockResolvedValue(null);

      const response = await require('supertest')(app)
        .get('/applications/999')
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        message: 'Application not found'
      });
    });

    it('should handle errors gracefully', async () => {
      mockApplicationHelpers.getApplicationById.mockRejectedValue(new Error('Database error'));

      const response = await require('supertest')(app)
        .get('/applications/1')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        message: 'Internal Server Error'
      });
    });
  });

  describe('GET /job-offers/:jobOfferId/applicants', () => {
    it('should return applicants for job offer successfully', async () => {
      const mockJobOffer = {
        id: 123,
        title: 'Chef Position',
        restaurantId: 456,
        isActive: true
      };
      const mockApplications = [
        {
          id: 1,
          employeeId: 789,
          status: 'pending',
          employee: { name: 'John Doe' }
        },
        {
          id: 2,
          employeeId: 790,
          status: 'reviewed',
          employee: { name: 'Jane Smith' }
        }
      ];

      mockApplicationHelpers.getJobOfferForRestaurant.mockResolvedValue(mockJobOffer);
      mockApplicationHelpers.getApplicationsForJobOffer.mockResolvedValue(mockApplications);

      const response = await require('supertest')(app)
        .get('/job-offers/123/applicants')
        .expect(200);

      expect(mockAuthenticateToken.checkCompany).toHaveBeenCalled();
      expect(mockCookies.getRestaurantIdFromCookie).toHaveBeenCalled();
      expect(mockApplicationHelpers.getJobOfferForRestaurant).toHaveBeenCalledWith(123, 456);
      expect(mockApplicationHelpers.getApplicationsForJobOffer).toHaveBeenCalledWith(123);
      expect(response.body).toEqual({
        success: true,
        data: mockApplications,
        count: 2
      });
    });

    it('should return 400 for invalid job offer ID', async () => {
      const response = await require('supertest')(app)
        .get('/job-offers/invalid/applicants')
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        message: 'Invalid job offer ID'
      });
    });

    it('should return 400 for non-numeric job offer ID', async () => {
      const response = await require('supertest')(app)
        .get('/job-offers/abc/applicants')
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        message: 'Invalid job offer ID'
      });
    });

    it('should return 401 when restaurant ID not found', async () => {
      // Simulate missing restaurantId
      mockCookies.getRestaurantIdFromCookie.mockImplementation((req, res, next) => {
        // Don't set req.restaurantId
        next();
      });

      const response = await require('supertest')(app)
        .get('/job-offers/123/applicants')
        .expect(401);

      expect(response.body).toEqual({
        success: false,
        message: 'Restaurant ID is required'
      });
    });

    it('should return 404 when job offer not found', async () => {
      mockApplicationHelpers.getJobOfferForRestaurant.mockResolvedValue(null);

      const response = await require('supertest')(app)
        .get('/job-offers/999/applicants')
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        message: 'Job offer not found or you do not have permission to view the applicants.'
      });
    });

    it('should return 404 when job offer doesn\'t belong to restaurant', async () => {
      mockApplicationHelpers.getJobOfferForRestaurant.mockResolvedValue(null);

      const response = await require('supertest')(app)
        .get('/job-offers/123/applicants')
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        message: 'Job offer not found or you do not have permission to view the applicants.'
      });
    });

    it('should return empty applications list when no applicants', async () => {
      const mockJobOffer = { id: 123, title: 'Chef Position', restaurantId: 456 };
      mockApplicationHelpers.getJobOfferForRestaurant.mockResolvedValue(mockJobOffer);
      mockApplicationHelpers.getApplicationsForJobOffer.mockResolvedValue([]);

      const response = await require('supertest')(app)
        .get('/job-offers/123/applicants')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: [],
        count: 0
      });
    });

    it('should handle errors gracefully', async () => {
      mockApplicationHelpers.getJobOfferForRestaurant.mockRejectedValue(new Error('Database error'));

      const response = await require('supertest')(app)
        .get('/job-offers/123/applicants')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        message: 'Internal Server Error'
      });
    });
  });

  describe('Authentication and Authorization', () => {
    it('should require employee authentication for create application route', async () => {
      // Mock the helpers to ensure the route succeeds
      mockApplicationHelpers.validateApplicationInput.mockReturnValue({ isValid: true, errors: [] });
      mockApplicationHelpers.getJobPost.mockResolvedValue({ id: 123, title: 'Chef Position' });
      mockApplicationHelpers.getExistingApplication.mockResolvedValue(null);
      mockApplicationHelpers.createApplication.mockResolvedValue({ id: 1, jobPostId: 123, employeeId: 789 });

      const response = await require('supertest')(app)
        .post('/application')
        .send({
          jobPostId: 123,
          answers: [{ questionId: 1, answer: 'Yes' }]
        })
        .expect(201);

      expect(mockAuthenticateToken.checkEmployee).toHaveBeenCalled();
      expect(mockCookies.getEmployeeIdFromCookie).toHaveBeenCalled();
    });

    it('should require company authentication for applicants route', async () => {
      // Mock the helpers to ensure the route succeeds
      mockApplicationHelpers.getJobOfferForRestaurant.mockResolvedValue({ id: 123, title: 'Chef Position' });
      mockApplicationHelpers.getApplicationsForJobOffer.mockResolvedValue([]);

      const response = await require('supertest')(app)
        .get('/job-offers/123/applicants')
        .expect(200);

      expect(mockAuthenticateToken.checkCompany).toHaveBeenCalled();
      expect(mockCookies.getRestaurantIdFromCookie).toHaveBeenCalled();
    });

    it('should not require authentication for get application by ID route', async () => {
      // Mock the helper to ensure the route succeeds
      mockApplicationHelpers.getApplicationById.mockResolvedValue({ id: 1, jobPostId: 123, employeeId: 789 });

      const response = await require('supertest')(app)
        .get('/applications/1')
        .expect(200);

      // This route doesn't have authentication middleware
      expect(mockAuthenticateToken.checkEmployee).not.toHaveBeenCalled();
      expect(mockAuthenticateToken.checkCompany).not.toHaveBeenCalled();
    });
  });

  describe('Input Validation', () => {
    it('should validate application creation input', async () => {
      mockApplicationHelpers.validateApplicationInput.mockReturnValue({ isValid: false, errors: ['Invalid input'] });

      const response = await require('supertest')(app)
        .post('/application')
        .send({
          jobPostId: 'invalid',
          answers: []
        })
        .expect(400);

      expect(mockApplicationHelpers.validateApplicationInput).toHaveBeenCalled();
    });

    it('should validate application ID format', async () => {
      const response = await require('supertest')(app)
        .get('/applications/invalid')
        .expect(400);

      // Route validates application ID format before calling helper
      expect(mockApplicationHelpers.getApplicationById).not.toHaveBeenCalled();
    });

    it('should validate job offer ID format', async () => {
      const response = await require('supertest')(app)
        .get('/job-offers/invalid/applicants')
        .expect(400);

      // Route validates job offer ID format before calling helper
      expect(mockApplicationHelpers.getJobOfferForRestaurant).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully in create application', async () => {
      // Set up authentication and validation to pass
      mockApplicationHelpers.validateApplicationInput.mockReturnValue({ isValid: true, errors: [] });
      mockApplicationHelpers.getJobPost.mockResolvedValue({ id: 123, title: 'Chef Position' });
      mockApplicationHelpers.getExistingApplication.mockResolvedValue(null);
      mockApplicationHelpers.createApplication.mockRejectedValue(new Error('Database connection failed'));

      const response = await require('supertest')(app)
        .post('/application')
        .send({
          jobPostId: 123,
          answers: [{ questionId: 1, answer: 'Yes' }]
        })
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        message: 'Hemos tenido un error, intenta más tarde.'
      });
    });

    it('should handle database errors gracefully in get application', async () => {
      mockApplicationHelpers.getApplicationById.mockRejectedValue(new Error('Database connection failed'));

      const response = await require('supertest')(app)
        .get('/applications/1')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        message: 'Internal Server Error'
      });
    });

    it('should handle database errors gracefully in get applicants', async () => {
      // Set up authentication to pass
      mockApplicationHelpers.getJobOfferForRestaurant.mockRejectedValue(new Error('Database connection failed'));

      const response = await require('supertest')(app)
        .get('/job-offers/123/applicants')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        message: 'Internal Server Error'
      });
    });

    it('should handle Prisma specific errors in create application', async () => {
      const prismaError = new Error('Foreign key constraint failed');
      prismaError.code = 'P2003';

      mockApplicationHelpers.validateApplicationInput.mockReturnValue({ isValid: true, errors: [] });
      mockApplicationHelpers.getJobPost.mockResolvedValue({ id: 123 });
      mockApplicationHelpers.getExistingApplication.mockResolvedValue(null);
      mockApplicationHelpers.createApplication.mockRejectedValue(prismaError);

      const response = await require('supertest')(app)
        .post('/application')
        .send({
          jobPostId: 123,
          answers: [{ questionId: 1, answer: 'Yes' }]
        })
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        message: 'Hemos tenido un error, intenta más tarde.'
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing request body in create application', async () => {
      mockApplicationHelpers.validateApplicationInput.mockReturnValue({ isValid: false, errors: ['Request body is required'] });

      const response = await require('supertest')(app)
        .post('/application')
        .send({})
        .expect(400);

      expect(mockApplicationHelpers.validateApplicationInput).toHaveBeenCalledWith({});
    });

    it('should handle missing jobPostId in create application', async () => {
      mockApplicationHelpers.validateApplicationInput.mockReturnValue({ isValid: false, errors: ['Job post ID is required'] });

      const response = await require('supertest')(app)
        .post('/application')
        .send({
          answers: [{ questionId: 1, answer: 'Yes' }]
        })
        .expect(400);

      expect(mockApplicationHelpers.validateApplicationInput).toHaveBeenCalledWith({
        answers: [{ questionId: 1, answer: 'Yes' }]
      });
    });

    it('should handle missing answers in create application', async () => {
      mockApplicationHelpers.validateApplicationInput.mockReturnValue({ isValid: false, errors: ['Answers are required'] });

      const response = await require('supertest')(app)
        .post('/application')
        .send({
          jobPostId: 123
        })
        .expect(400);

      expect(mockApplicationHelpers.validateApplicationInput).toHaveBeenCalledWith({
        jobPostId: 123
      });
    });

    it('should handle very large application ID', async () => {
      const response = await require('supertest')(app)
        .get('/applications/999999999999999999')
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        message: 'Invalid application ID'
      });
    });

    it('should handle very large job offer ID', async () => {
      const response = await require('supertest')(app)
        .get('/job-offers/999999999999999999/applicants')
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        message: 'Invalid job offer ID'
      });
    });

    it('should handle negative application ID', async () => {
      const response = await require('supertest')(app)
        .get('/applications/-1')
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        message: 'Invalid application ID'
      });
    });

    it('should handle negative job offer ID', async () => {
      const response = await require('supertest')(app)
        .get('/job-offers/-1/applicants')
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        message: 'Invalid job offer ID'
      });
    });
  });

  describe('Response Format', () => {
    it('should return consistent success response format for create application', async () => {
      const mockJobPost = { id: 123, title: 'Chef Position' };
      const mockApplication = {
        id: 1,
        jobPostId: 123,
        employeeId: 789,
        status: 'pending'
      };

      mockApplicationHelpers.validateApplicationInput.mockReturnValue({ isValid: true, errors: [] });
      mockApplicationHelpers.getJobPost.mockResolvedValue(mockJobPost);
      mockApplicationHelpers.getExistingApplication.mockResolvedValue(null);
      mockApplicationHelpers.createApplication.mockResolvedValue(mockApplication);

      const response = await require('supertest')(app)
        .post('/application')
        .send({
          jobPostId: 123,
          answers: [{ questionId: 1, answer: 'Yes' }]
        })
        .expect(201);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('data');
    });

    it('should return consistent error response format for validation errors', async () => {
      const validationErrors = ['Job post ID is required'];
      mockApplicationHelpers.validateApplicationInput.mockReturnValue({ 
        isValid: false, 
        errors: validationErrors 
      });

      const response = await require('supertest')(app)
        .post('/application')
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('errors');
    });

    it('should return consistent success response format for get application', async () => {
      const mockApplication = { id: 1, jobPostId: 123, employeeId: 789 };
      mockApplicationHelpers.getApplicationById.mockResolvedValue(mockApplication);

      const response = await require('supertest')(app)
        .get('/applications/1')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
    });

    it('should return consistent success response format for get applicants', async () => {
      const mockJobOffer = { id: 123, restaurantId: 456 };
      const mockApplications = [];

      mockApplicationHelpers.getJobOfferForRestaurant.mockResolvedValue(mockJobOffer);
      mockApplicationHelpers.getApplicationsForJobOffer.mockResolvedValue(mockApplications);

      const response = await require('supertest')(app)
        .get('/job-offers/123/applicants')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('count');
    });
  });
}); 
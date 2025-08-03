import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';

// Mock the helpers
const mockJobHelpers = {
  createJobOffer: jest.fn(),
  getJobOfferWithLocation: jest.fn(),
  generateJobPlanInfo: jest.fn(),
  getEmployeeById: jest.fn(),
  getEmployeeApplications: jest.fn(),
  getJobsWithFilters: jest.fn(),
  getTotalJobsCount: jest.fn(),
  getRestaurantJobOffers: jest.fn(),
  getJobOfferById: jest.fn(),
  getRestaurantUserWithDetails: jest.fn(),
  getRestaurantWithLocations: jest.fn(),
  generateCompletePlanInfo: jest.fn(),
};

const mockJobs = {
  fetchTopRatedJobs: jest.fn(),
  fetchJobsByNameAndLocation: jest.fn(),
  softDeleteJobCascade: jest.fn(),
  updateJobOffer: jest.fn(),
};

const mockAuthenticateToken = {
  checkCompany: jest.fn((req, res, next) => next()),
  checkEmployee: jest.fn((req, res, next) => next()),
};

const mockCookies = {
  getUserIdFromCookie: jest.fn((req, res, next) => {
    req.userId = 1;
    next();
  }),
  getRestaurantIdFromCookie: jest.fn((req, res, next) => {
    req.restaurantId = 123;
    next();
  }),
  getEmployeeIdFromCookie: jest.fn((req, res, next) => {
    req.employeeId = 456;
    next();
  }),
  getRestaurantUserIdFromCookie: jest.fn((req, res, next) => {
    req.restaurantUserId = 789;
    next();
  }),
  optionalAuth: jest.fn((req, res, next) => {
    req.userId = 1;
    req.userType = 'employee';
    next();
  }),
};

const mockFilterHelpers = {
  buildFilters: jest.fn(),
  buildSearchConditions: jest.fn(),
};

const mockCheckPlan = {
  checkJobOfferLimit: jest.fn(() => (req, res, next) => {
    req.remainingJobOffers = 5;
    req.jobOfferLimit = 10;
    req.user = { payment_status: 'pro' };
    next();
  }),
};

// Mock all the imports
jest.mock('../../helpers/jobHelpers.js', () => mockJobHelpers);
jest.mock('../../helpers/jobs.js', () => mockJobs);
jest.mock('../../helpers/authenticateToken.js', () => mockAuthenticateToken);
jest.mock('../../helpers/cookies.js', () => mockCookies);
jest.mock('../../helpers/filterHelpers.js', () => mockFilterHelpers);
jest.mock('../../middleware/checkPlan.js', () => mockCheckPlan);

// Import the router after mocking
import jobRouter from '../../routes/job.route.js';

describe('Job Routes', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api', jobRouter);
  });

  describe('POST /job', () => {
    it('should create job offer successfully', async () => {
      const mockJobOffer = { id: 1, position: 'Chef', salary: 50000 };
      const mockJobOfferWithLocation = { id: 1, position: 'Chef', location: { id: 1 } };
      const mockPlanInfo = {
        currentPlan: 'PRO',
        remainingJobOffers: 4,
        totalLimit: 10,
        upgradeMessage: 'Te quedan 4 ofertas de trabajo de tu plan PRO.'
      };

      mockJobHelpers.createJobOffer.mockResolvedValue(mockJobOffer);
      mockJobHelpers.getJobOfferWithLocation.mockResolvedValue(mockJobOfferWithLocation);
      mockJobHelpers.generateJobPlanInfo.mockReturnValue(mockPlanInfo);

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
        functions: 'Cooking and management'
      };

      const response = await request(app)
        .post('/api/job')
        .send(jobData)
        .expect(201);

      expect(mockJobHelpers.createJobOffer).toHaveBeenCalledWith({
        ...jobData,
        restaurantId: 123,
        restaurantUserId: 789
      });
      expect(mockJobHelpers.generateJobPlanInfo).toHaveBeenCalledWith({
        paymentStatus: 'pro',
        remainingJobOffers: 4,
        jobOfferLimit: 10
      });
      expect(response.body).toEqual({
        success: true,
        message: 'Job offer created successfully',
        data: mockJobOffer,
        planInfo: mockPlanInfo
      });
    });

    it('should return 400 when locationId is missing', async () => {
      const response = await request(app)
        .post('/api/job')
        .send({
          position: 'Chef',
          schedule: 'Full-time'
        })
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        message: 'locationId is required'
      });
    });

    it('should handle errors gracefully', async () => {
      mockJobHelpers.createJobOffer.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/api/job')
        .send({
          position: 'Chef',
          locationId: 1,
          schedule: 'Full-time'
        })
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        message: 'Internal Server Error'
      });
    });
  });

  describe('GET /jobs/recommended-jobs', () => {
    it('should return recommended jobs', async () => {
      const mockJobs = [
        { id: 1, position: 'Chef' },
        { id: 2, position: 'Waiter' }
      ];
      mockJobs.fetchJobsByNameAndLocation.mockResolvedValue(mockJobs);

      const response = await request(app)
        .get('/api/jobs/recommended-jobs')
        .query({
          jobName: 'Chef',
          location: 'Santiago',
          limit: '4'
        })
        .expect(200);

      expect(mockJobs.fetchJobsByNameAndLocation).toHaveBeenCalledWith(
        'Chef',
        'Santiago',
        null,
        expect.any(Date)
      );
      expect(response.body).toEqual({
        success: true,
        data: mockJobs
      });
    });

    it('should handle errors gracefully', async () => {
      mockJobs.fetchJobsByNameAndLocation.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/jobs/recommended-jobs')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Internal Server Error'
      });
    });
  });

  describe('GET /jobs/top-rated-jobs-carousel', () => {
    it('should return top rated jobs', async () => {
      const mockJobs = [
        { id: 1, position: 'Chef' },
        { id: 2, position: 'Waiter' }
      ];
      mockJobs.fetchTopRatedJobs.mockResolvedValue(mockJobs);

      const response = await request(app)
        .get('/api/jobs/top-rated-jobs-carousel')
        .query({ limit: '4' })
        .expect(200);

      expect(mockJobs.fetchTopRatedJobs).toHaveBeenCalledWith(
        '4',
        expect.any(Date)
      );
      expect(response.body).toEqual({
        success: true,
        data: mockJobs
      });
    });

    it('should handle errors gracefully', async () => {
      mockJobs.fetchTopRatedJobs.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/jobs/top-rated-jobs-carousel')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Internal Server Error'
      });
    });
  });

  describe('PATCH /job/:id', () => {
    it('should update job offer successfully', async () => {
      const mockUpdatedJob = { id: 1, position: 'Senior Chef', salary: 60000 };
      mockJobs.updateJobOffer.mockResolvedValue(mockUpdatedJob);

      const updateData = {
        position: 'Senior Chef',
        salary: '60000'
      };

      const response = await request(app)
        .patch('/api/job/1')
        .send(updateData)
        .expect(200);

      expect(mockJobs.updateJobOffer).toHaveBeenCalledWith(1, 123, updateData);
      expect(response.body).toEqual({
        success: true,
        message: 'Job offer updated successfully',
        data: mockUpdatedJob
      });
    });

    it('should handle errors gracefully', async () => {
      mockJobs.updateJobOffer.mockRejectedValue(new Error('Invalid data'));

      const response = await request(app)
        .patch('/api/job/1')
        .send({ position: 'Chef' })
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        message: 'Invalid data'
      });
    });
  });

  describe('GET /jobs/applied', () => {
    it('should return employee applications', async () => {
      const mockEmployee = { id: 456, name: 'John Doe' };
      const mockApplications = [
        { id: 1, jobPost: { id: 1, position: 'Chef' } },
        { id: 2, jobPost: { id: 2, position: 'Waiter' } }
      ];

      mockJobHelpers.getEmployeeById.mockResolvedValue(mockEmployee);
      mockJobHelpers.getEmployeeApplications.mockResolvedValue(mockApplications);

      const response = await request(app)
        .get('/api/jobs/applied')
        .expect(200);

      expect(mockJobHelpers.getEmployeeById).toHaveBeenCalledWith(456);
      expect(mockJobHelpers.getEmployeeApplications).toHaveBeenCalledWith(456);
      expect(response.body).toEqual({
        success: true,
        data: mockApplications
      });
    });

    it('should return 404 when employee not found', async () => {
      mockJobHelpers.getEmployeeById.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/jobs/applied')
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        message: 'Employee not found'
      });
    });

    it('should handle errors gracefully', async () => {
      mockJobHelpers.getEmployeeById.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/jobs/applied')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        message: 'Internal Server Error'
      });
    });
  });

  describe('GET /jobs', () => {
    it('should return jobs with filters and pagination', async () => {
      const mockJobs = [
        { id: 1, position: 'Chef' },
        { id: 2, position: 'Waiter' }
      ];
      const mockFilters = { specialty: 'Restaurant' };
      const mockSearchConditions = { position: { contains: 'Chef' } };

      mockFilterHelpers.buildFilters.mockReturnValue(mockFilters);
      mockFilterHelpers.buildSearchConditions.mockReturnValue(mockSearchConditions);
      mockJobHelpers.getJobsWithFilters.mockResolvedValue(mockJobs);
      mockJobHelpers.getTotalJobsCount.mockResolvedValue(25);

      const response = await request(app)
        .get('/api/jobs')
        .query({
          page: '1',
          limit: '10',
          q: 'Chef',
          region: 'Santiago'
        })
        .expect(200);

      expect(mockFilterHelpers.buildFilters).toHaveBeenCalledWith(
        expect.any(Object),
        ['specialty', 'format', 'benefits', 'region', 'comuna']
      );
      expect(mockFilterHelpers.buildSearchConditions).toHaveBeenCalledWith('Chef', 'position');
      expect(mockJobHelpers.getJobsWithFilters).toHaveBeenCalledWith(
        mockFilters,
        mockSearchConditions,
        { createdAt: 'desc' },
        10,
        0
      );
      expect(response.body).toEqual({
        success: true,
        data: mockJobs,
        totalPages: 3,
        totalJobs: 25,
        currentPage: 1
      });
    });

    it('should handle orderBy applications', async () => {
      const mockJobs = [{ id: 1, position: 'Chef' }];
      mockFilterHelpers.buildFilters.mockReturnValue({});
      mockFilterHelpers.buildSearchConditions.mockReturnValue({});
      mockJobHelpers.getJobsWithFilters.mockResolvedValue(mockJobs);
      mockJobHelpers.getTotalJobsCount.mockResolvedValue(1);

      const response = await request(app)
        .get('/api/jobs')
        .query({ orderBy: 'applications' })
        .expect(200);

      expect(mockJobHelpers.getJobsWithFilters).toHaveBeenCalledWith(
        {},
        {},
        { applications: { _count: 'desc' } },
        10,
        0
      );
    });

    it('should handle errors gracefully', async () => {
      mockFilterHelpers.buildFilters.mockReturnValue({});
      mockFilterHelpers.buildSearchConditions.mockReturnValue({});
      mockJobHelpers.getJobsWithFilters.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/jobs')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        message: 'Database error'
      });
    });
  });

  describe('GET /jobs/restaurant', () => {
    it('should return restaurant job offers', async () => {
      const mockJobOffers = [
        { id: 1, position: 'Chef' },
        { id: 2, position: 'Waiter' }
      ];
      mockJobHelpers.getRestaurantJobOffers.mockResolvedValue(mockJobOffers);

      const response = await request(app)
        .get('/api/jobs/restaurant')
        .expect(200);

      expect(mockJobHelpers.getRestaurantJobOffers).toHaveBeenCalledWith(123);
      expect(response.body).toEqual({
        success: true,
        data: mockJobOffers
      });
    });

    it('should handle errors gracefully', async () => {
      mockJobHelpers.getRestaurantJobOffers.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/jobs/restaurant')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Internal Server Error'
      });
    });
  });

  describe('GET /jobs/:jobId', () => {
    it('should return job offer by ID', async () => {
      const mockJobOffer = {
        id: 1,
        position: 'Chef',
        applications: [{ id: 1 }, { id: 2 }],
        createdAt: new Date('2024-01-01')
      };
      mockJobHelpers.getJobOfferById.mockResolvedValue(mockJobOffer);

      const response = await request(app)
        .get('/api/jobs/1')
        .expect(200);

      expect(mockJobHelpers.getJobOfferById).toHaveBeenCalledWith('1');
      expect(response.body).toEqual({
        success: true,
        data: {
          ...mockJobOffer,
          applicationsCount: 2,
          createdAt: '2024-01-01'
        }
      });
    });

    it('should return 404 when job offer not found', async () => {
      mockJobHelpers.getJobOfferById.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/jobs/999')
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        error: 'Job offer not found'
      });
    });

    it('should handle errors gracefully', async () => {
      mockJobHelpers.getJobOfferById.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/jobs/1')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Database error'
      });
    });
  });

  describe('DELETE /job/:id', () => {
    it('should delete job offer successfully', async () => {
      const mockDeletedJob = { id: 1, position: 'Chef', deletedAt: new Date() };
      mockJobs.softDeleteJobCascade.mockResolvedValue(mockDeletedJob);

      const response = await request(app)
        .delete('/api/job/1')
        .expect(200);

      expect(mockJobs.softDeleteJobCascade).toHaveBeenCalledWith(1, 123);
      expect(response.body).toEqual({
        success: true,
        message: 'Job offer soft deleted successfully',
        data: mockDeletedJob
      });
    });

    it('should handle errors gracefully', async () => {
      mockJobs.softDeleteJobCascade.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .delete('/api/job/1')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        message: 'Database error'
      });
    });
  });

  describe('GET /my-plan-info', () => {
    it('should return plan info successfully', async () => {
      const mockRestaurantUser = {
        id: 789,
        user: { id: 1, payment_status: 'pro', last_payment: '2024-01-01' },
        jobOffers: [
          { id: 1, applications: [{ id: 1 }] },
          { id: 2, applications: [{ id: 2 }, { id: 3 }] }
        ]
      };
      const mockRestaurant = {
        id: 123,
        locations: [
          { id: 1, address: '123 Main St' },
          { id: 2, address: '456 Oak Ave' }
        ]
      };
      const mockPlanInfo = {
        planInfo: {
          currentPlan: 'PRO',
          currentJobOffers: 2,
          remainingJobOffers: 3,
          totalApplications: 3,
          currentLocations: 2,
          remainingLocations: 3
        }
      };

      mockJobHelpers.getRestaurantUserWithDetails.mockResolvedValue(mockRestaurantUser);
      mockJobHelpers.getRestaurantWithLocations.mockResolvedValue(mockRestaurant);
      mockJobHelpers.generateCompletePlanInfo.mockReturnValue(mockPlanInfo);

      const response = await request(app)
        .get('/api/my-plan-info')
        .expect(200);

      expect(mockJobHelpers.getRestaurantUserWithDetails).toHaveBeenCalledWith(789);
      expect(mockJobHelpers.getRestaurantWithLocations).toHaveBeenCalledWith(123);
      expect(mockJobHelpers.generateCompletePlanInfo).toHaveBeenCalledWith({
        user: mockRestaurantUser.user,
        restaurantUser: mockRestaurantUser,
        restaurant: mockRestaurant,
        currentJobOffers: 2,
        currentLocations: 2
      });
      expect(response.body).toEqual(mockPlanInfo);
    });

    it('should return 401 when restaurant user not found', async () => {
      mockJobHelpers.getRestaurantUserWithDetails.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/my-plan-info')
        .expect(401);

      expect(response.body).toEqual({
        success: false,
        message: 'Usuario de restaurante no encontrado'
      });
    });

    it('should return 401 when restaurant user exists but user is null', async () => {
      mockJobHelpers.getRestaurantUserWithDetails.mockResolvedValue({
        id: 789,
        user: null
      });

      const response = await request(app)
        .get('/api/my-plan-info')
        .expect(401);

      expect(response.body).toEqual({
        success: false,
        message: 'Usuario de restaurante no encontrado'
      });
    });

    it('should handle errors gracefully', async () => {
      mockJobHelpers.getRestaurantUserWithDetails.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/my-plan-info')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        message: 'Error interno del servidor'
      });
    });
  });

  describe('Authentication and Authorization', () => {
    it('should require authentication for protected routes', async () => {
      const response = await request(app)
        .post('/api/job')
        .send({ position: 'Chef', locationId: 1 })
        .expect(201);

      expect(mockAuthenticateToken.checkCompany).toHaveBeenCalled();
      expect(mockCookies.getRestaurantIdFromCookie).toHaveBeenCalled();
      expect(mockCookies.getRestaurantUserIdFromCookie).toHaveBeenCalled();
    });

    it('should require employee authentication for applied jobs route', async () => {
      const response = await request(app)
        .get('/api/jobs/applied')
        .expect(200);

      expect(mockAuthenticateToken.checkEmployee).toHaveBeenCalled();
      expect(mockCookies.getEmployeeIdFromCookie).toHaveBeenCalled();
    });
  });
}); 
const request = require('supertest');
const express = require('express');

// Set up environment variables for testing
process.env.JWT_SECRET = 'test-secret-key';
process.env.NODE_ENV = 'test';

// Mock the helpers
const mockEmployeeHelpers = {
  getEmployeeById: jest.fn(),
  getEmployeeByUserId: jest.fn(),
  createEmployeeProfile: jest.fn(),
  generateEmployeeToken: jest.fn(),
  getEmployeeProfile: jest.fn(),
  updateEmployeeProfile: jest.fn(),
  createExperience: jest.fn(),
  createEducation: jest.fn(),
  getEmployeeWithDetails: jest.fn(),
  searchEmployees: jest.fn(),
  getJobOfferById: jest.fn(),
  getEmployeeByEmployeeId: jest.fn(),
  checkFavoriteJobExists: jest.fn(),
  createFavoriteJob: jest.fn(),
  getFavoriteJobById: jest.fn(),
  deleteFavoriteJob: jest.fn(),
  getFavoriteJobs: jest.fn(),
  checkTalentPoolRecord: jest.fn(),
  createTalentPoolRecord: jest.fn(),
};

const mockFindApplication = {
  findApplicationDetails: jest.fn(),
};

const mockAuthenticateToken = {
  checkEmployee: jest.fn((req, res, next) => next()),
  checkCompany: jest.fn((req, res, next) => next()),
};

const mockCookies = {
  getUserIdFromCookie: jest.fn((req, res, next) => {
    req.userId = 123;
    next();
  }),
  getEmployeeIdFromCookie: jest.fn((req, res, next) => {
    req.employeeId = 456;
    next();
  }),
  getRestaurantIdFromCookie: jest.fn((req, res, next) => {
    req.restaurantId = 789;
    next();
  }),
  getRestaurantUserIdFromCookie: jest.fn((req, res, next) => {
    req.restaurantUserId = 101;
    next();
  }),
};

const mockRequirePlan = {
  requirePlan: jest.fn(() => (req, res, next) => next()),
};

// Mock Prisma for the route that uses it directly
const mockPrisma = {
  jobOffer: {
    findMany: jest.fn(),
  },
};

// Mock all the imports
jest.mock('../../helpers/employeeHelpers.js', () => mockEmployeeHelpers);
jest.mock('../../helpers/employee/findApplication.js', () => mockFindApplication);
jest.mock('../../helpers/authenticateToken.js', () => mockAuthenticateToken);
jest.mock('../../helpers/cookies.js', () => mockCookies);
jest.mock('../../middleware/checkPlan.js', () => mockRequirePlan);
jest.mock('../../db.js', () => ({
  prisma: mockPrisma,
}));

// Import the router after mocking
const employeeRouter = require('../../routes/employee.route.js');

describe('Employee Routes', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api', employeeRouter);
  });

  describe('GET /employee/:id', () => {
    it('should return employee by ID successfully', async () => {
      const mockEmployee = { id: 1, name: 'John Doe', position: 'Chef' };
      mockEmployeeHelpers.getEmployeeById.mockResolvedValue(mockEmployee);

      const response = await request(app)
        .get('/api/employee/1')
        .expect(200);

      expect(mockEmployeeHelpers.getEmployeeById).toHaveBeenCalledWith(1);
      expect(response.body).toEqual({
        success: true,
        data: mockEmployee
      });
    });

    it('should return 400 for invalid employee ID', async () => {
      const response = await request(app)
        .get('/api/employee/invalid')
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: 'Invalid employee ID'
      });
    });

    it('should return 404 when employee not found', async () => {
      mockEmployeeHelpers.getEmployeeById.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/employee/999')
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        error: 'Employee profile not found'
      });
    });

    it('should handle errors gracefully', async () => {
      mockEmployeeHelpers.getEmployeeById.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/employee/1')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Internal Server Error'
      });
    });
  });

  describe('POST /employee', () => {
    it('should create employee profile successfully', async () => {
      const mockEmployee = { id: 1, name: 'John Doe', position: 'Chef' };
      mockEmployeeHelpers.getEmployeeByUserId.mockResolvedValue(null);
      mockEmployeeHelpers.createEmployeeProfile.mockResolvedValue(mockEmployee);

      const response = await request(app)
        .post('/api/employee')
        .send({ name: 'John Doe', position: 'Chef' })
        .expect(201);

      expect(mockEmployeeHelpers.getEmployeeByUserId).toHaveBeenCalledWith(123);
      expect(mockEmployeeHelpers.createEmployeeProfile).toHaveBeenCalled();
      expect(response.body).toEqual({
        success: true,
        message: 'Employee created successfully',
        data: mockEmployee
      });
    });

    it('should return 400 when employee profile already exists', async () => {
      const existingEmployee = { id: 1, name: 'John Doe' };
      mockEmployeeHelpers.getEmployeeByUserId.mockResolvedValue(existingEmployee);

      const response = await request(app)
        .post('/api/employee')
        .send({ name: 'John Doe', position: 'Chef' })
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        message: 'Employee profile already exists'
      });
    });

    it('should handle JWT errors', async () => {
      // Mock the authentication middleware to throw an error
      mockAuthenticateToken.checkEmployee.mockImplementation((req, res, next) => {
        const error = new Error('JWT Error');
        error.name = 'JsonWebTokenError';
        next(error);
      });

      const response = await request(app)
        .post('/api/employee')
        .send({ name: 'John Doe', position: 'Chef' })
        .expect(401);

      expect(response.body).toEqual({
        success: false,
        message: 'Invalid token'
      });
    });

    it('should handle errors gracefully', async () => {
      mockEmployeeHelpers.getEmployeeByUserId.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/api/employee')
        .send({ name: 'John Doe', position: 'Chef' })
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        message: 'Internal Server Error'
      });
    });
  });

  describe('GET /employee', () => {
    it('should return current employee profile successfully', async () => {
      const mockEmployee = { id: 1, name: 'John Doe', position: 'Chef' };
      mockEmployeeHelpers.getEmployeeProfile.mockResolvedValue(mockEmployee);

      const response = await request(app)
        .get('/api/employee')
        .expect(200);

      expect(mockEmployeeHelpers.getEmployeeProfile).toHaveBeenCalledWith(456);
      expect(response.body).toEqual({
        success: true,
        data: mockEmployee
      });
    });

    it('should return 404 when employee profile not found', async () => {
      mockEmployeeHelpers.getEmployeeProfile.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/employee')
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        error: 'Employee profile not found'
      });
    });

    it('should handle errors gracefully', async () => {
      mockEmployeeHelpers.getEmployeeProfile.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/employee')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Internal Server Error'
      });
    });
  });

  describe('PATCH /employee', () => {
    it('should update employee profile successfully', async () => {
      const mockEmployee = { id: 1, name: 'John Doe Updated', position: 'Chef' };
      mockEmployeeHelpers.updateEmployeeProfile.mockResolvedValue(mockEmployee);

      const response = await request(app)
        .patch('/api/employee')
        .send({ name: 'John Doe Updated' })
        .expect(200);

      expect(mockEmployeeHelpers.updateEmployeeProfile).toHaveBeenCalledWith(456, { name: 'John Doe Updated' });
      expect(response.body).toEqual({
        success: true,
        message: 'Employee profile updated successfully.',
        data: mockEmployee
      });
    });

    it('should handle errors gracefully', async () => {
      mockEmployeeHelpers.updateEmployeeProfile.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .patch('/api/employee')
        .send({ name: 'John Doe Updated' })
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        message: 'Internal Server Error.'
      });
    });
  });

  describe('GET /employees/:employeeId/applications', () => {
    it('should return employee applications successfully', async () => {
      const mockApplications = [
        { id: 1, jobPostId: 1, employeeId: 1 },
        { id: 2, jobPostId: 2, employeeId: 1 }
      ];
      mockPrisma.jobOffer.findMany.mockResolvedValue(mockApplications);

      const response = await request(app)
        .get('/api/employees/1/applications')
        .expect(200);

      expect(mockPrisma.jobOffer.findMany).toHaveBeenCalledWith({
        where: {
          id: 1,
          deletedAt: null,
        },
        include: {
          experiences: true,
          educations: true,
          applications: {
            where: { deletedAt: null },
          },
        },
      });
      expect(response.body).toEqual({
        success: true,
        data: mockApplications
      });
    });

    it('should return 404 when employee not found', async () => {
      mockPrisma.jobOffer.findMany.mockResolvedValue([]);

      const response = await request(app)
        .get('/api/employees/999/applications')
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        error: 'Employee not found'
      });
    });

    it('should handle errors gracefully', async () => {
      mockPrisma.jobOffer.findMany.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/employees/1/applications')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Database error'
      });
    });
  });

  describe('GET /employees/:employeeId/job-posts/:jobPostId/application', () => {
    it('should return specific application successfully', async () => {
      const mockApplication = { id: 1, jobPostId: 1, employeeId: 1 };
      mockFindApplication.findApplicationDetails.mockResolvedValue(mockApplication);

      const response = await request(app)
        .get('/api/employees/1/job-posts/1/application')
        .expect(200);

      expect(mockFindApplication.findApplicationDetails).toHaveBeenCalledWith(1, 1);
      expect(response.body).toEqual({
        success: true,
        data: mockApplication
      });
    });

    it('should return 400 for invalid IDs', async () => {
      const response = await request(app)
        .get('/api/employees/invalid/job-posts/invalid/application')
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        message: 'Invalid employee or job post ID.'
      });
    });

    it('should return 404 when application not found', async () => {
      mockFindApplication.findApplicationDetails.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/employees/1/job-posts/1/application')
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        message: 'Application not found.'
      });
    });

    it('should handle errors gracefully', async () => {
      mockFindApplication.findApplicationDetails.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/employees/1/job-posts/1/application')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        message: 'Internal Server Error'
      });
    });
  });

  describe('GET /employees/search', () => {
    it('should return search results successfully', async () => {
      const mockResults = [
        { id: 1, name: 'John Doe', position: 'Chef' },
        { id: 2, name: 'Jane Smith', position: 'Waiter' }
      ];
      mockEmployeeHelpers.searchEmployees.mockResolvedValue(mockResults);

      const response = await request(app)
        .get('/api/employees/search?position=Chef&region=Santiago')
        .expect(200);

      expect(mockEmployeeHelpers.searchEmployees).toHaveBeenCalledWith({
        position: 'Chef',
        region: 'Santiago'
      });
      expect(response.body).toEqual({
        success: true,
        data: mockResults
      });
    });

    it('should handle errors gracefully', async () => {
      mockEmployeeHelpers.searchEmployees.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/employees/search')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        message: 'Internal Server Error'
      });
    });
  });

  describe('POST /employees/favorite-jobs/:jobPostId', () => {
    it('should add favorite job successfully', async () => {
      const mockJobOffer = { id: 1, position: 'Chef' };
      const mockEmployee = { id: 456, name: 'John Doe' };
      const mockFavoriteJob = { id: 1, employeeId: 456, jobPostId: 1 };

      mockEmployeeHelpers.getJobOfferById.mockResolvedValue(mockJobOffer);
      mockEmployeeHelpers.getEmployeeByEmployeeId.mockResolvedValue(mockEmployee);
      mockEmployeeHelpers.checkFavoriteJobExists.mockResolvedValue(null);
      mockEmployeeHelpers.createFavoriteJob.mockResolvedValue(mockFavoriteJob);

      const response = await request(app)
        .post('/api/employees/favorite-jobs/1')
        .expect(201);

      expect(mockEmployeeHelpers.getJobOfferById).toHaveBeenCalledWith('1');
      expect(mockEmployeeHelpers.getEmployeeByEmployeeId).toHaveBeenCalledWith(456);
      expect(mockEmployeeHelpers.checkFavoriteJobExists).toHaveBeenCalledWith(456, '1');
      expect(mockEmployeeHelpers.createFavoriteJob).toHaveBeenCalledWith(456, '1');
      expect(response.body).toEqual({
        success: true,
        message: 'Job post added to favorites',
        data: mockFavoriteJob
      });
    });

    it('should return 404 when job post not found', async () => {
      mockEmployeeHelpers.getJobOfferById.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/employees/favorite-jobs/999')
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        message: 'Job post not found'
      });
    });

    it('should return 404 when employee not found', async () => {
      const mockJobOffer = { id: 1, position: 'Chef' };
      mockEmployeeHelpers.getJobOfferById.mockResolvedValue(mockJobOffer);
      mockEmployeeHelpers.getEmployeeByEmployeeId.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/employees/favorite-jobs/1')
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        message: 'Employee not found'
      });
    });

    it('should return 400 when job is already favorite', async () => {
      const mockJobOffer = { id: 1, position: 'Chef' };
      const mockEmployee = { id: 456, name: 'John Doe' };
      const existingFavorite = { id: 1, employeeId: 456, jobPostId: 1 };

      mockEmployeeHelpers.getJobOfferById.mockResolvedValue(mockJobOffer);
      mockEmployeeHelpers.getEmployeeByEmployeeId.mockResolvedValue(mockEmployee);
      mockEmployeeHelpers.checkFavoriteJobExists.mockResolvedValue(existingFavorite);

      const response = await request(app)
        .post('/api/employees/favorite-jobs/1')
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        message: 'Job post is already a favorite'
      });
    });

    it('should handle errors gracefully', async () => {
      mockEmployeeHelpers.getJobOfferById.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/api/employees/favorite-jobs/1')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        message: 'Internal Server Error'
      });
    });
  });

  describe('DELETE /employees/favorite-jobs/:jobPostId', () => {
    it('should delete favorite job successfully', async () => {
      const mockFavoriteJob = { id: 1, employeeId: 456, jobPostId: 1 };

      mockEmployeeHelpers.getFavoriteJobById.mockResolvedValue(mockFavoriteJob);
      mockEmployeeHelpers.deleteFavoriteJob.mockResolvedValue(mockFavoriteJob);

      const response = await request(app)
        .delete('/api/employees/favorite-jobs/1')
        .expect(200);

      expect(mockEmployeeHelpers.getFavoriteJobById).toHaveBeenCalledWith(456, '1');
      expect(mockEmployeeHelpers.deleteFavoriteJob).toHaveBeenCalledWith(1);
      expect(response.body).toEqual({
        success: true,
        message: 'Favourite Job deleted successfully'
      });
    });

    it('should return 403 when employeeId is missing', async () => {
      // Mock the cookie middleware to not set employeeId
      mockCookies.getEmployeeIdFromCookie.mockImplementation((req, res, next) => {
        next();
      });

      const response = await request(app)
        .delete('/api/employees/favorite-jobs/1')
        .expect(403);

      expect(response.body).toEqual({
        success: false,
        error: 'Unauthorized access.'
      });
    });

    it('should return 404 when favorite job not found', async () => {
      mockEmployeeHelpers.getFavoriteJobById.mockResolvedValue(null);

      const response = await request(app)
        .delete('/api/employees/favorite-jobs/999')
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        error: 'Favorite job not found.'
      });
    });

    it('should handle errors gracefully', async () => {
      mockEmployeeHelpers.getFavoriteJobById.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .delete('/api/employees/favorite-jobs/1')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Failed to delete favorite job.'
      });
    });
  });

  describe('GET /employees/favorite-jobs', () => {
    it('should return favorite jobs successfully', async () => {
      const mockFavoriteJobs = [
        { id: 1, employeeId: 456, jobPostId: 1 },
        { id: 2, employeeId: 456, jobPostId: 2 }
      ];

      mockEmployeeHelpers.getFavoriteJobs.mockResolvedValue(mockFavoriteJobs);

      const response = await request(app)
        .get('/api/employees/favorite-jobs')
        .expect(200);

      expect(mockEmployeeHelpers.getFavoriteJobs).toHaveBeenCalledWith(456);
      expect(response.body).toEqual({
        success: true,
        data: mockFavoriteJobs
      });
    });

    it('should return 404 when employee not found', async () => {
      mockEmployeeHelpers.getFavoriteJobs.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/employees/favorite-jobs')
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        error: 'Employee not found'
      });
    });

    it('should return 404 when no favorite jobs found', async () => {
      mockEmployeeHelpers.getFavoriteJobs.mockResolvedValue([]);

      const response = await request(app)
        .get('/api/employees/favorite-jobs')
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        message: 'jobs where not found'
      });
    });

    it('should handle errors gracefully', async () => {
      mockEmployeeHelpers.getFavoriteJobs.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/employees/favorite-jobs')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Internal Server Error'
      });
    });
  });

  describe('GET /employees/favorite-jobs/:jobPostId', () => {
    it('should return true when job is favorite', async () => {
      const mockFavoriteJob = { id: 1, employeeId: 456, jobPostId: 1 };

      mockEmployeeHelpers.checkFavoriteJobExists.mockResolvedValue(mockFavoriteJob);

      const response = await request(app)
        .get('/api/employees/favorite-jobs/1')
        .expect(200);

      expect(mockEmployeeHelpers.checkFavoriteJobExists).toHaveBeenCalledWith(456, '1');
      expect(response.body).toEqual({
        success: true,
        message: "You have already saved this job",
        isSaved: true
      });
    });

    it('should return false when job is not favorite', async () => {
      mockEmployeeHelpers.checkFavoriteJobExists.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/employees/favorite-jobs/999')
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        message: 'Job not found',
        isSaved: false
      });
    });

    it('should return 404 when employee not found', async () => {
      mockEmployeeHelpers.checkFavoriteJobExists.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/employees/favorite-jobs/1')
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        error: 'Employee not found'
      });
    });

    it('should handle errors gracefully', async () => {
      mockEmployeeHelpers.checkFavoriteJobExists.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/employees/favorite-jobs/1')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Internal Server Error'
      });
    });
  });

  describe('POST /employee/talent-pool', () => {
    it('should create talent pool record successfully', async () => {
      const mockTalentPool = { id: 1, employeeId: 456, restaurantId: 1 };

      mockEmployeeHelpers.checkTalentPoolRecord.mockResolvedValue(null);
      mockEmployeeHelpers.createTalentPoolRecord.mockResolvedValue(mockTalentPool);

      const response = await request(app)
        .post('/api/employee/talent-pool')
        .send({ restaurantId: 1 })
        .expect(201);

      expect(mockEmployeeHelpers.checkTalentPoolRecord).toHaveBeenCalledWith(456, 1);
      expect(mockEmployeeHelpers.createTalentPoolRecord).toHaveBeenCalledWith(456, 1);
      expect(response.body).toEqual({
        success: true,
        message: 'Talent pool record created successfully',
        data: mockTalentPool
      });
    });

    it('should return 409 when record already exists', async () => {
      const existingRecord = { id: 1, employeeId: 456, restaurantId: 1 };

      mockEmployeeHelpers.checkTalentPoolRecord.mockResolvedValue(existingRecord);

      const response = await request(app)
        .post('/api/employee/talent-pool')
        .send({ restaurantId: 1 })
        .expect(409);

      expect(response.body).toEqual({
        success: false,
        message: 'You have already applied to this company.'
      });
    });

    it('should return 404 when creation fails', async () => {
      mockEmployeeHelpers.checkTalentPoolRecord.mockResolvedValue(null);
      mockEmployeeHelpers.createTalentPoolRecord.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/employee/talent-pool')
        .send({ restaurantId: 1 })
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        message: 'We were not able to send the cv to this company',
        data: null
      });
    });

    it('should handle errors gracefully', async () => {
      mockEmployeeHelpers.checkTalentPoolRecord.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/api/employee/talent-pool')
        .send({ restaurantId: 1 })
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        message: 'Internal Server Error'
      });
    });
  });

  describe('GET /employee/talent-pool/check', () => {
    it('should return true when CV is sent', async () => {
      const mockRecord = { id: 1, employeeId: 456, restaurantId: 1 };

      mockEmployeeHelpers.checkTalentPoolRecord.mockResolvedValue(mockRecord);

      const response = await request(app)
        .get('/api/employee/talent-pool/check?restaurantId=1')
        .expect(200);

      expect(mockEmployeeHelpers.checkTalentPoolRecord).toHaveBeenCalledWith(456, 1);
      expect(response.body).toEqual({
        success: true,
        isCvSent: true,
        message: 'Application already exists for this company.'
      });
    });

    it('should return false when CV is not sent', async () => {
      mockEmployeeHelpers.checkTalentPoolRecord.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/employee/talent-pool/check?restaurantId=1')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        isCvSent: false,
        message: 'No application found for this company.'
      });
    });

    it('should return 400 for invalid restaurant ID', async () => {
      const response = await request(app)
        .get('/api/employee/talent-pool/check?restaurantId=invalid')
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        message: 'Invalid restaurant ID'
      });
    });

    it('should return 400 for missing restaurant ID', async () => {
      const response = await request(app)
        .get('/api/employee/talent-pool/check')
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        message: 'Invalid restaurant ID'
      });
    });

    it('should handle errors gracefully', async () => {
      mockEmployeeHelpers.checkTalentPoolRecord.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/employee/talent-pool/check?restaurantId=1')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        message: 'Internal Server Error'
      });
    });
  });

  describe('Authentication and Authorization', () => {
    it('should require employee authentication for protected routes', async () => {
      const mockEmployee = { id: 1, name: 'John Doe', position: 'Chef' };
      mockEmployeeHelpers.getEmployeeByUserId.mockResolvedValue(null);
      mockEmployeeHelpers.createEmployeeProfile.mockResolvedValue(mockEmployee);

      const response = await request(app)
        .post('/api/employee')
        .send({ name: 'John Doe', position: 'Chef' })
        .expect(201);

      expect(mockAuthenticateToken.checkEmployee).toHaveBeenCalled();
      expect(mockCookies.getUserIdFromCookie).toHaveBeenCalled();
    });

    it('should require company authentication for search route', async () => {
      const mockResults = [{ id: 1, name: 'John Doe', position: 'Chef' }];
      mockEmployeeHelpers.searchEmployees.mockResolvedValue(mockResults);

      const response = await request(app)
        .get('/api/employees/search')
        .expect(200);

      expect(mockAuthenticateToken.checkCompany).toHaveBeenCalled();
      expect(mockCookies.getUserIdFromCookie).toHaveBeenCalled();
    });

    it('should require employee authentication for favorite jobs routes', async () => {
      const mockJobOffer = { id: 1, position: 'Chef' };
      const mockEmployee = { id: 456, name: 'John Doe' };
      const mockFavoriteJob = { id: 1, employeeId: 456, jobPostId: 1 };

      mockEmployeeHelpers.getJobOfferById.mockResolvedValue(mockJobOffer);
      mockEmployeeHelpers.getEmployeeByEmployeeId.mockResolvedValue(mockEmployee);
      mockEmployeeHelpers.checkFavoriteJobExists.mockResolvedValue(null);
      mockEmployeeHelpers.createFavoriteJob.mockResolvedValue(mockFavoriteJob);

      const response = await request(app)
        .post('/api/employees/favorite-jobs/1')
        .expect(201);

      expect(mockAuthenticateToken.checkEmployee).toHaveBeenCalled();
      expect(mockCookies.getEmployeeIdFromCookie).toHaveBeenCalled();
    });
  });
}); 
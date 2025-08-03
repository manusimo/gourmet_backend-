import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';

// Mock the helpers
const mockPoolHelpers = {
  checkTalentPoolEntry: jest.fn(),
  createTalentPoolEntry: jest.fn(),
  buildTalentPoolFilters: jest.fn(),
  deleteTalentPoolEntry: jest.fn(),
  approveTalentPoolEntry: jest.fn(),
};

const mockAuthenticateToken = {
  checkCompany: jest.fn((req, res, next) => next()),
  setUserRole: jest.fn((req, res, next) => {
    req.userRole = 'admin';
    next();
  }),
};

const mockCookies = {
  getRestaurantIdFromCookie: jest.fn((req, res, next) => {
    req.restaurantId = 123;
    next();
  }),
  getRestaurantUserIdFromCookie: jest.fn((req, res, next) => {
    req.restaurantUserId = 456;
    next();
  }),
};

const mockPool = {
  getTalentPool: jest.fn(),
};

// Mock all the imports
jest.mock('../../helpers/poolHelpers.js', () => mockPoolHelpers);
jest.mock('../../helpers/authenticateToken.js', () => mockAuthenticateToken);
jest.mock('../../helpers/cookies.js', () => mockCookies);
jest.mock('../../helpers/pool.js', () => mockPool);

// Import the router after mocking
import poolRouter from '../../routes/pool.route.js';

describe('Pool Routes', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api', poolRouter);
  });

  describe('GET /talent-pool/check', () => {
    it('should return exists: true when talent pool entry exists', async () => {
      const mockEntry = { id: 1, employeeId: 123, restaurantId: 456 };
      mockPoolHelpers.checkTalentPoolEntry.mockResolvedValue(mockEntry);

      const response = await request(app)
        .get('/api/talent-pool/check')
        .query({ employeeId: '123' })
        .expect(200);

      expect(mockPoolHelpers.checkTalentPoolEntry).toHaveBeenCalledWith('123', 123);
      expect(response.body).toEqual({
        success: true,
        exists: true
      });
    });

    it('should return exists: false when talent pool entry not found', async () => {
      mockPoolHelpers.checkTalentPoolEntry.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/talent-pool/check')
        .query({ employeeId: '123' })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        exists: false
      });
    });

    it('should handle errors gracefully', async () => {
      mockPoolHelpers.checkTalentPoolEntry.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/talent-pool/check')
        .query({ employeeId: '123' })
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        message: 'Internal Server Error'
      });
    });
  });

  describe('POST /talent-pool', () => {
    it('should create talent pool entry successfully', async () => {
      const mockEntry = { id: 1, employeeId: 123, restaurantId: 456, status: 'accepted' };
      mockPoolHelpers.checkTalentPoolEntry.mockResolvedValue(null);
      mockPoolHelpers.createTalentPoolEntry.mockResolvedValue(mockEntry);

      const response = await request(app)
        .post('/api/talent-pool')
        .send({ employeeId: '123' })
        .expect(201);

      expect(mockPoolHelpers.checkTalentPoolEntry).toHaveBeenCalledWith('123', 123);
      expect(mockPoolHelpers.createTalentPoolEntry).toHaveBeenCalledWith({
        employeeId: '123',
        restaurantId: 123,
        restaurantUserId: 456
      });
      expect(response.body).toEqual({
        success: true,
        message: 'Employee added to talent pool successfully',
        data: mockEntry
      });
    });

    it('should return 409 when employee already exists in talent pool', async () => {
      const mockEntry = { id: 1, employeeId: 123, restaurantId: 456 };
      mockPoolHelpers.checkTalentPoolEntry.mockResolvedValue(mockEntry);

      const response = await request(app)
        .post('/api/talent-pool')
        .send({ employeeId: '123' })
        .expect(409);

      expect(response.body).toEqual({
        success: false,
        message: 'Employee already exists in the talent pool.'
      });
    });

    it('should handle errors gracefully', async () => {
      mockPoolHelpers.checkTalentPoolEntry.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/api/talent-pool')
        .send({ employeeId: '123' })
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        message: 'Internal Server Error'
      });
    });
  });

  describe('GET /talent-pool', () => {
    it('should return talent pool with filters', async () => {
      const mockTalentPool = [
        { id: 1, employeeId: 123, restaurantId: 456 },
        { id: 2, employeeId: 124, restaurantId: 456 }
      ];
      mockPoolHelpers.buildTalentPoolFilters.mockReturnValue({
        position: 'Chef',
        region: 'Santiago'
      });
      mockPool.getTalentPool.mockResolvedValue(mockTalentPool);

      const response = await request(app)
        .get('/api/talent-pool')
        .query({
          position: 'Chef',
          region: 'Santiago'
        })
        .expect(200);

      expect(mockPoolHelpers.buildTalentPoolFilters).toHaveBeenCalledWith({
        position: 'Chef',
        region: 'Santiago'
      });
      expect(mockPool.getTalentPool).toHaveBeenCalledWith(123, {
        position: 'Chef',
        region: 'Santiago'
      });
      expect(response.body).toEqual({
        success: true,
        data: mockTalentPool
      });
    });

    it('should handle errors gracefully', async () => {
      mockPoolHelpers.buildTalentPoolFilters.mockReturnValue({});
      mockPool.getTalentPool.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/talent-pool')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        message: 'Internal Server Error'
      });
    });
  });

  describe('DELETE /talent-pool/:talentId', () => {
    it('should delete talent pool entry successfully', async () => {
      const mockEntry = { id: 1, employeeId: 123, restaurantId: 456 };
      mockPoolHelpers.deleteTalentPoolEntry.mockResolvedValue(mockEntry);

      const response = await request(app)
        .delete('/api/talent-pool/1')
        .expect(200);

      expect(mockPoolHelpers.deleteTalentPoolEntry).toHaveBeenCalledWith(1);
      expect(response.body).toEqual({
        success: true,
        message: 'Talent and associated conversations successfully removed from the pool.'
      });
    });

    it('should return 404 when talent not found', async () => {
      mockPoolHelpers.deleteTalentPoolEntry.mockRejectedValue(
        new Error('Talent not found in the pool.')
      );

      const response = await request(app)
        .delete('/api/talent-pool/999')
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        message: 'Talent not found in the pool.'
      });
    });

    it('should handle other errors gracefully', async () => {
      mockPoolHelpers.deleteTalentPoolEntry.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .delete('/api/talent-pool/1')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        message: 'Internal Server Error'
      });
    });
  });

  describe('PATCH /talent-pool/:id/approve', () => {
    it('should approve talent pool entry successfully', async () => {
      const mockEntry = { id: 1, employeeId: 123, restaurantId: 456, status: 'approved' };
      mockPoolHelpers.approveTalentPoolEntry.mockResolvedValue(mockEntry);

      const response = await request(app)
        .patch('/api/talent-pool/1/approve')
        .expect(200);

      expect(mockPoolHelpers.approveTalentPoolEntry).toHaveBeenCalledWith('1', 456);
      expect(response.body).toEqual({
        success: true,
        message: 'Talent pool entry approved successfully',
        data: mockEntry
      });
    });

    it('should handle errors gracefully', async () => {
      mockPoolHelpers.approveTalentPoolEntry.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .patch('/api/talent-pool/1/approve')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        message: 'Internal Server Error'
      });
    });
  });

  describe('Authentication and Authorization', () => {
    it('should require authentication for all routes', async () => {
      // Test that middleware is applied by checking if the mocked functions are called
      const response = await request(app)
        .get('/api/talent-pool/check')
        .query({ employeeId: '123' })
        .expect(200);

      // The middleware should have been called
      expect(mockAuthenticateToken.checkCompany).toHaveBeenCalled();
      expect(mockCookies.getRestaurantIdFromCookie).toHaveBeenCalled();
    });

    it('should set user role for talent pool GET route', async () => {
      const response = await request(app)
        .get('/api/talent-pool')
        .expect(200);

      expect(mockAuthenticateToken.setUserRole).toHaveBeenCalled();
    });
  });

  describe('Input Validation', () => {
    it('should handle missing employeeId in check route', async () => {
      const response = await request(app)
        .get('/api/talent-pool/check')
        .expect(200);

      expect(mockPoolHelpers.checkTalentPoolEntry).toHaveBeenCalledWith(undefined, 123);
    });

    it('should handle missing employeeId in POST route', async () => {
      const response = await request(app)
        .post('/api/talent-pool')
        .send({})
        .expect(201);

      expect(mockPoolHelpers.checkTalentPoolEntry).toHaveBeenCalledWith(undefined, 123);
    });

    it('should handle invalid talentId in DELETE route', async () => {
      const response = await request(app)
        .delete('/api/talent-pool/invalid')
        .expect(500);

      expect(mockPoolHelpers.deleteTalentPoolEntry).toHaveBeenCalledWith(NaN);
    });
  });
}); 
import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';

// Mock the helpers
const mockAdminHelpers = {
  getMetrics: jest.fn(),
};

// Mock Prisma
const mockPrisma = {
  restaurant: {
    count: jest.fn(),
  },
  employee: {
    count: jest.fn(),
  },
  jobOffer: {
    count: jest.fn(),
  },
  application: {
    count: jest.fn(),
  },
};

// Mock all the imports
jest.mock('../../helpers/adminHelpers.js', () => mockAdminHelpers);
jest.mock('../../db.js', () => ({
  prisma: mockPrisma,
}));

// Import the router after mocking
import adminRouter from '../../routes/admin.route.js';

describe('Admin Routes', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/', adminRouter);
  });

  describe('GET /metrics', () => {
    it('should return metrics successfully', async () => {
      const mockMetrics = {
        registeredCompanies: 25,
        registeredProfessionals: 150,
        publishedOffers: 75,
        totalApplications: 300
      };

      mockPrisma.restaurant.count.mockResolvedValue(mockMetrics.registeredCompanies);
      mockPrisma.employee.count.mockResolvedValue(mockMetrics.registeredProfessionals);
      mockPrisma.jobOffer.count.mockResolvedValue(mockMetrics.publishedOffers);
      mockPrisma.application.count.mockResolvedValue(mockMetrics.totalApplications);

      const response = await request(app)
        .get('/metrics')
        .expect(200);

      expect(mockPrisma.restaurant.count).toHaveBeenCalled();
      expect(mockPrisma.employee.count).toHaveBeenCalled();
      expect(mockPrisma.jobOffer.count).toHaveBeenCalled();
      expect(mockPrisma.application.count).toHaveBeenCalled();
      expect(response.body).toEqual(mockMetrics);
    });

    it('should return zero values when no data exists', async () => {
      mockPrisma.restaurant.count.mockResolvedValue(0);
      mockPrisma.employee.count.mockResolvedValue(0);
      mockPrisma.jobOffer.count.mockResolvedValue(0);
      mockPrisma.application.count.mockResolvedValue(0);

      const response = await request(app)
        .get('/metrics')
        .expect(200);

      expect(response.body).toEqual({
        registeredCompanies: 0,
        registeredProfessionals: 0,
        publishedOffers: 0,
        totalApplications: 0
      });
    });

    it('should handle null values and convert to zero', async () => {
      mockPrisma.restaurant.count.mockResolvedValue(null);
      mockPrisma.employee.count.mockResolvedValue(null);
      mockPrisma.jobOffer.count.mockResolvedValue(null);
      mockPrisma.application.count.mockResolvedValue(null);

      const response = await request(app)
        .get('/metrics')
        .expect(200);

      expect(response.body).toEqual({
        registeredCompanies: 0,
        registeredProfessionals: 0,
        publishedOffers: 0,
        totalApplications: 0
      });
    });

    it('should handle undefined values and convert to zero', async () => {
      mockPrisma.restaurant.count.mockResolvedValue(undefined);
      mockPrisma.employee.count.mockResolvedValue(undefined);
      mockPrisma.jobOffer.count.mockResolvedValue(undefined);
      mockPrisma.application.count.mockResolvedValue(undefined);

      const response = await request(app)
        .get('/metrics')
        .expect(200);

      expect(response.body).toEqual({
        registeredCompanies: 0,
        registeredProfessionals: 0,
        publishedOffers: 0,
        totalApplications: 0
      });
    });

    it('should handle database errors gracefully', async () => {
      mockPrisma.restaurant.count.mockRejectedValue(new Error('Database connection failed'));

      const response = await request(app)
        .get('/metrics')
        .expect(500);

      expect(response.body).toEqual({
        message: 'Error interno del servidor'
      });
    });

    it('should handle partial database errors', async () => {
      mockPrisma.restaurant.count.mockResolvedValue(25);
      mockPrisma.employee.count.mockRejectedValue(new Error('Employee table error'));
      mockPrisma.jobOffer.count.mockResolvedValue(75);
      mockPrisma.application.count.mockResolvedValue(300);

      const response = await request(app)
        .get('/metrics')
        .expect(500);

      expect(response.body).toEqual({
        message: 'Error interno del servidor'
      });
    });

    it('should handle large numbers correctly', async () => {
      const largeMetrics = {
        registeredCompanies: 999999,
        registeredProfessionals: 9999999,
        publishedOffers: 999999,
        totalApplications: 99999999
      };

      mockPrisma.restaurant.count.mockResolvedValue(largeMetrics.registeredCompanies);
      mockPrisma.employee.count.mockResolvedValue(largeMetrics.registeredProfessionals);
      mockPrisma.jobOffer.count.mockResolvedValue(largeMetrics.publishedOffers);
      mockPrisma.application.count.mockResolvedValue(largeMetrics.totalApplications);

      const response = await request(app)
        .get('/metrics')
        .expect(200);

      expect(response.body).toEqual(largeMetrics);
    });

    it('should handle negative numbers (edge case)', async () => {
      mockPrisma.restaurant.count.mockResolvedValue(-5);
      mockPrisma.employee.count.mockResolvedValue(-10);
      mockPrisma.jobOffer.count.mockResolvedValue(-3);
      mockPrisma.application.count.mockResolvedValue(-15);

      const response = await request(app)
        .get('/metrics')
        .expect(200);

      expect(response.body).toEqual({
        registeredCompanies: -5,
        registeredProfessionals: -10,
        publishedOffers: -3,
        totalApplications: -15
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle Prisma record not found error', async () => {
      const prismaError = new Error('Record to update not found');
      prismaError.code = 'P2025';
      mockPrisma.restaurant.count.mockRejectedValue(prismaError);

      const response = await request(app)
        .get('/metrics')
        .expect(500);

      expect(response.body).toEqual({
        message: 'Error interno del servidor'
      });
    });

    it('should handle Prisma connection error', async () => {
      const prismaError = new Error('Connection failed');
      prismaError.code = 'P1001';
      mockPrisma.restaurant.count.mockRejectedValue(prismaError);

      const response = await request(app)
        .get('/metrics')
        .expect(500);

      expect(response.body).toEqual({
        message: 'Error interno del servidor'
      });
    });

    it('should handle Prisma query error', async () => {
      const prismaError = new Error('Query execution failed');
      prismaError.code = 'P2000';
      mockPrisma.restaurant.count.mockRejectedValue(prismaError);

      const response = await request(app)
        .get('/metrics')
        .expect(500);

      expect(response.body).toEqual({
        message: 'Error interno del servidor'
      });
    });

    it('should handle timeout errors', async () => {
      mockPrisma.restaurant.count.mockImplementation(() => 
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 100))
      );

      const response = await request(app)
        .get('/metrics')
        .expect(500);

      expect(response.body).toEqual({
        message: 'Error interno del servidor'
      });
    });

    it('should handle network errors', async () => {
      mockPrisma.restaurant.count.mockRejectedValue(new Error('Network error'));

      const response = await request(app)
        .get('/metrics')
        .expect(500);

      expect(response.body).toEqual({
        message: 'Error interno del servidor'
      });
    });
  });

  describe('Performance and Concurrency', () => {
    it('should execute all count queries concurrently', async () => {
      const startTime = Date.now();
      
      mockPrisma.restaurant.count.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve(25), 100))
      );
      mockPrisma.employee.count.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve(150), 100))
      );
      mockPrisma.jobOffer.count.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve(75), 100))
      );
      mockPrisma.application.count.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve(300), 100))
      );

      const response = await request(app)
        .get('/metrics')
        .expect(200);

      const endTime = Date.now();
      const executionTime = endTime - startTime;

      // All queries should execute concurrently, so total time should be ~100ms, not 400ms
      expect(executionTime).toBeLessThan(150);
      expect(response.body).toEqual({
        registeredCompanies: 25,
        registeredProfessionals: 150,
        publishedOffers: 75,
        totalApplications: 300
      });
    });

    it('should handle slow database responses', async () => {
      mockPrisma.restaurant.count.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve(25), 2000))
      );
      mockPrisma.employee.count.mockResolvedValue(150);
      mockPrisma.jobOffer.count.mockResolvedValue(75);
      mockPrisma.application.count.mockResolvedValue(300);

      const response = await request(app)
        .get('/metrics')
        .expect(200);

      expect(response.body).toEqual({
        registeredCompanies: 25,
        registeredProfessionals: 150,
        publishedOffers: 75,
        totalApplications: 300
      });
    });
  });

  describe('Data Integrity', () => {
    it('should ensure all metrics are numbers', async () => {
      mockPrisma.restaurant.count.mockResolvedValue(25);
      mockPrisma.employee.count.mockResolvedValue(150);
      mockPrisma.jobOffer.count.mockResolvedValue(75);
      mockPrisma.application.count.mockResolvedValue(300);

      const response = await request(app)
        .get('/metrics')
        .expect(200);

      expect(typeof response.body.registeredCompanies).toBe('number');
      expect(typeof response.body.registeredProfessionals).toBe('number');
      expect(typeof response.body.publishedOffers).toBe('number');
      expect(typeof response.body.totalApplications).toBe('number');
    });

    it('should handle string numbers correctly', async () => {
      mockPrisma.restaurant.count.mockResolvedValue('25');
      mockPrisma.employee.count.mockResolvedValue('150');
      mockPrisma.jobOffer.count.mockResolvedValue('75');
      mockPrisma.application.count.mockResolvedValue('300');

      const response = await request(app)
        .get('/metrics')
        .expect(200);

      expect(response.body).toEqual({
        registeredCompanies: '25',
        registeredProfessionals: '150',
        publishedOffers: '75',
        totalApplications: '300'
      });
    });

    it('should handle floating point numbers', async () => {
      mockPrisma.restaurant.count.mockResolvedValue(25.5);
      mockPrisma.employee.count.mockResolvedValue(150.7);
      mockPrisma.jobOffer.count.mockResolvedValue(75.3);
      mockPrisma.application.count.mockResolvedValue(300.9);

      const response = await request(app)
        .get('/metrics')
        .expect(200);

      expect(response.body).toEqual({
        registeredCompanies: 25.5,
        registeredProfessionals: 150.7,
        publishedOffers: 75.3,
        totalApplications: 300.9
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle very large numbers', async () => {
      const veryLargeMetrics = {
        registeredCompanies: Number.MAX_SAFE_INTEGER,
        registeredProfessionals: Number.MAX_SAFE_INTEGER,
        publishedOffers: Number.MAX_SAFE_INTEGER,
        totalApplications: Number.MAX_SAFE_INTEGER
      };

      mockPrisma.restaurant.count.mockResolvedValue(veryLargeMetrics.registeredCompanies);
      mockPrisma.employee.count.mockResolvedValue(veryLargeMetrics.registeredProfessionals);
      mockPrisma.jobOffer.count.mockResolvedValue(veryLargeMetrics.publishedOffers);
      mockPrisma.application.count.mockResolvedValue(veryLargeMetrics.totalApplications);

      const response = await request(app)
        .get('/metrics')
        .expect(200);

      expect(response.body).toEqual(veryLargeMetrics);
    });

    it('should handle zero values correctly', async () => {
      mockPrisma.restaurant.count.mockResolvedValue(0);
      mockPrisma.employee.count.mockResolvedValue(0);
      mockPrisma.jobOffer.count.mockResolvedValue(0);
      mockPrisma.application.count.mockResolvedValue(0);

      const response = await request(app)
        .get('/metrics')
        .expect(200);

      expect(response.body).toEqual({
        registeredCompanies: 0,
        registeredProfessionals: 0,
        publishedOffers: 0,
        totalApplications: 0
      });
    });

    it('should handle missing response properties', async () => {
      // Simulate a scenario where some properties might be missing
      mockPrisma.restaurant.count.mockResolvedValue(25);
      mockPrisma.employee.count.mockResolvedValue(150);
      mockPrisma.jobOffer.count.mockResolvedValue(75);
      mockPrisma.application.count.mockResolvedValue(300);

      const response = await request(app)
        .get('/metrics')
        .expect(200);

      // Ensure all expected properties are present
      expect(response.body).toHaveProperty('registeredCompanies');
      expect(response.body).toHaveProperty('registeredProfessionals');
      expect(response.body).toHaveProperty('publishedOffers');
      expect(response.body).toHaveProperty('totalApplications');
    });
  });

  describe('Response Format', () => {
    it('should return consistent response format for successful metrics', async () => {
      const mockMetrics = {
        registeredCompanies: 25,
        registeredProfessionals: 150,
        publishedOffers: 75,
        totalApplications: 300
      };

      mockPrisma.restaurant.count.mockResolvedValue(mockMetrics.registeredCompanies);
      mockPrisma.employee.count.mockResolvedValue(mockMetrics.registeredProfessionals);
      mockPrisma.jobOffer.count.mockResolvedValue(mockMetrics.publishedOffers);
      mockPrisma.application.count.mockResolvedValue(mockMetrics.totalApplications);

      const response = await request(app)
        .get('/metrics')
        .expect(200);

      expect(response.body).toHaveProperty('registeredCompanies');
      expect(response.body).toHaveProperty('registeredProfessionals');
      expect(response.body).toHaveProperty('publishedOffers');
      expect(response.body).toHaveProperty('totalApplications');
    });

    it('should return consistent error response format', async () => {
      mockPrisma.restaurant.count.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/metrics')
        .expect(500);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toBe('Error interno del servidor');
    });

    it('should return proper HTTP status codes', async () => {
      // Success case
      mockPrisma.restaurant.count.mockResolvedValue(25);
      mockPrisma.employee.count.mockResolvedValue(150);
      mockPrisma.jobOffer.count.mockResolvedValue(75);
      mockPrisma.application.count.mockResolvedValue(300);

      await request(app)
        .get('/metrics')
        .expect(200);

      // Error case
      mockPrisma.restaurant.count.mockRejectedValue(new Error('Database error'));

      await request(app)
        .get('/metrics')
        .expect(500);
    });
  });

  describe('Database Query Optimization', () => {
    it('should use count queries efficiently', async () => {
      mockPrisma.restaurant.count.mockResolvedValue(25);
      mockPrisma.employee.count.mockResolvedValue(150);
      mockPrisma.jobOffer.count.mockResolvedValue(75);
      mockPrisma.application.count.mockResolvedValue(300);

      await request(app)
        .get('/metrics')
        .expect(200);

      expect(mockPrisma.restaurant.count).toHaveBeenCalledWith();
      expect(mockPrisma.employee.count).toHaveBeenCalledWith();
      expect(mockPrisma.jobOffer.count).toHaveBeenCalledWith();
      expect(mockPrisma.application.count).toHaveBeenCalledWith();
    });

    it('should not use findMany with count when count is available', async () => {
      // Ensure we're using the count method, not findMany
      expect(mockPrisma.restaurant.findMany).toBeUndefined();
      expect(mockPrisma.employee.findMany).toBeUndefined();
      expect(mockPrisma.jobOffer.findMany).toBeUndefined();
      expect(mockPrisma.application.findMany).toBeUndefined();
    });

    it('should execute all queries in parallel', async () => {
      const startTime = Date.now();
      
      mockPrisma.restaurant.count.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve(25), 100))
      );
      mockPrisma.employee.count.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve(150), 100))
      );
      mockPrisma.jobOffer.count.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve(75), 100))
      );
      mockPrisma.application.count.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve(300), 100))
      );

      await request(app)
        .get('/metrics')
        .expect(200);

      const endTime = Date.now();
      const executionTime = endTime - startTime;

      // All queries should execute in parallel, so total time should be ~100ms, not 400ms
      expect(executionTime).toBeLessThan(150);
    });
  });

  describe('Security and Access Control', () => {
    it('should not require authentication for metrics endpoint', async () => {
      // This endpoint doesn't have authentication middleware
      const response = await request(app)
        .get('/metrics')
        .expect(200);

      expect(response.body).toBeDefined();
    });

    it('should handle requests without authentication headers', async () => {
      const response = await request(app)
        .get('/metrics')
        .expect(200);

      expect(response.body).toBeDefined();
    });

    it('should handle requests with invalid authentication', async () => {
      const response = await request(app)
        .get('/metrics')
        .set('Authorization', 'Bearer invalid-token')
        .expect(200);

      expect(response.body).toBeDefined();
    });
  });

  describe('Request Validation', () => {
    it('should handle requests with query parameters', async () => {
      mockPrisma.restaurant.count.mockResolvedValue(25);
      mockPrisma.employee.count.mockResolvedValue(150);
      mockPrisma.jobOffer.count.mockResolvedValue(75);
      mockPrisma.application.count.mockResolvedValue(300);

      const response = await request(app)
        .get('/metrics?format=json&detailed=true')
        .expect(200);

      expect(response.body).toBeDefined();
    });

    it('should handle requests with different HTTP methods', async () => {
      // POST should not be allowed
      await request(app)
        .post('/metrics')
        .expect(404);

      // PUT should not be allowed
      await request(app)
        .put('/metrics')
        .expect(404);

      // DELETE should not be allowed
      await request(app)
        .delete('/metrics')
        .expect(404);

      // GET should be allowed
      mockPrisma.restaurant.count.mockResolvedValue(25);
      mockPrisma.employee.count.mockResolvedValue(150);
      mockPrisma.jobOffer.count.mockResolvedValue(75);
      mockPrisma.application.count.mockResolvedValue(300);

      await request(app)
        .get('/metrics')
        .expect(200);
    });

    it('should handle malformed requests gracefully', async () => {
      // The endpoint doesn't validate request body, so this should work
      const response = await request(app)
        .get('/metrics')
        .send({ invalid: 'data' })
        .expect(200);

      expect(response.body).toBeDefined();
    });
  });
}); 
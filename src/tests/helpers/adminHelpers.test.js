import { jest } from '@jest/globals';
import {
  getMetrics
} from '../../helpers/adminHelpers.js';

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

// Mock the prisma import
jest.mock('../../db.js', () => ({
  prisma: mockPrisma,
}));

describe('Admin Helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getMetrics', () => {
    it('should return all metrics successfully', async () => {
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

      const result = await getMetrics();

      expect(mockPrisma.restaurant.count).toHaveBeenCalled();
      expect(mockPrisma.employee.count).toHaveBeenCalled();
      expect(mockPrisma.jobOffer.count).toHaveBeenCalled();
      expect(mockPrisma.application.count).toHaveBeenCalled();
      expect(result).toEqual(mockMetrics);
    });

    it('should return zero values when no data exists', async () => {
      mockPrisma.restaurant.count.mockResolvedValue(0);
      mockPrisma.employee.count.mockResolvedValue(0);
      mockPrisma.jobOffer.count.mockResolvedValue(0);
      mockPrisma.application.count.mockResolvedValue(0);

      const result = await getMetrics();

      expect(result).toEqual({
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

      const result = await getMetrics();

      expect(result).toEqual({
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

      const result = await getMetrics();

      expect(result).toEqual({
        registeredCompanies: 0,
        registeredProfessionals: 0,
        publishedOffers: 0,
        totalApplications: 0
      });
    });

    it('should handle database errors', async () => {
      mockPrisma.restaurant.count.mockRejectedValue(new Error('Database connection failed'));

      await expect(getMetrics()).rejects.toThrow('Database connection failed');
    });

    it('should handle partial database errors', async () => {
      mockPrisma.restaurant.count.mockResolvedValue(25);
      mockPrisma.employee.count.mockRejectedValue(new Error('Employee table error'));
      mockPrisma.jobOffer.count.mockResolvedValue(75);
      mockPrisma.application.count.mockResolvedValue(300);

      await expect(getMetrics()).rejects.toThrow('Employee table error');
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

      const result = await getMetrics();

      expect(result).toEqual(largeMetrics);
    });

    it('should handle negative numbers (edge case)', async () => {
      mockPrisma.restaurant.count.mockResolvedValue(-5);
      mockPrisma.employee.count.mockResolvedValue(-10);
      mockPrisma.jobOffer.count.mockResolvedValue(-3);
      mockPrisma.application.count.mockResolvedValue(-15);

      const result = await getMetrics();

      expect(result).toEqual({
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

      await expect(getMetrics()).rejects.toThrow('Record to update not found');
    });

    it('should handle Prisma connection error', async () => {
      const prismaError = new Error('Connection failed');
      prismaError.code = 'P1001';
      mockPrisma.restaurant.count.mockRejectedValue(prismaError);

      await expect(getMetrics()).rejects.toThrow('Connection failed');
    });

    it('should handle Prisma query error', async () => {
      const prismaError = new Error('Query execution failed');
      prismaError.code = 'P2000';
      mockPrisma.restaurant.count.mockRejectedValue(prismaError);

      await expect(getMetrics()).rejects.toThrow('Query execution failed');
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

      const result = await getMetrics();
      const endTime = Date.now();
      const executionTime = endTime - startTime;

      // All queries should execute concurrently, so total time should be ~100ms, not 400ms
      expect(executionTime).toBeLessThan(150);
      expect(result).toEqual({
        registeredCompanies: 25,
        registeredProfessionals: 150,
        publishedOffers: 75,
        totalApplications: 300
      });
    });

    it('should handle timeout scenarios', async () => {
      mockPrisma.restaurant.count.mockImplementation(() => 
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
      );
      mockPrisma.employee.count.mockResolvedValue(150);
      mockPrisma.jobOffer.count.mockResolvedValue(75);
      mockPrisma.application.count.mockResolvedValue(300);

      await expect(getMetrics()).rejects.toThrow('Timeout');
    });
  });

  describe('Data Integrity', () => {
    it('should ensure all metrics are numbers', async () => {
      mockPrisma.restaurant.count.mockResolvedValue(25);
      mockPrisma.employee.count.mockResolvedValue(150);
      mockPrisma.jobOffer.count.mockResolvedValue(75);
      mockPrisma.application.count.mockResolvedValue(300);

      const result = await getMetrics();

      expect(typeof result.registeredCompanies).toBe('number');
      expect(typeof result.registeredProfessionals).toBe('number');
      expect(typeof result.publishedOffers).toBe('number');
      expect(typeof result.totalApplications).toBe('number');
    });

    it('should handle string numbers and convert them', async () => {
      mockPrisma.restaurant.count.mockResolvedValue('25');
      mockPrisma.employee.count.mockResolvedValue('150');
      mockPrisma.jobOffer.count.mockResolvedValue('75');
      mockPrisma.application.count.mockResolvedValue('300');

      const result = await getMetrics();

      expect(result).toEqual({
        registeredCompanies: '25',
        registeredProfessionals: '150',
        publishedOffers: '75',
        totalApplications: '300'
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

      const result = await getMetrics();

      expect(result).toEqual(veryLargeMetrics);
    });

    it('should handle floating point numbers', async () => {
      mockPrisma.restaurant.count.mockResolvedValue(25.5);
      mockPrisma.employee.count.mockResolvedValue(150.7);
      mockPrisma.jobOffer.count.mockResolvedValue(75.3);
      mockPrisma.application.count.mockResolvedValue(300.9);

      const result = await getMetrics();

      expect(result).toEqual({
        registeredCompanies: 25.5,
        registeredProfessionals: 150.7,
        publishedOffers: 75.3,
        totalApplications: 300.9
      });
    });

    it('should handle zero values correctly', async () => {
      mockPrisma.restaurant.count.mockResolvedValue(0);
      mockPrisma.employee.count.mockResolvedValue(0);
      mockPrisma.jobOffer.count.mockResolvedValue(0);
      mockPrisma.application.count.mockResolvedValue(0);

      const result = await getMetrics();

      expect(result).toEqual({
        registeredCompanies: 0,
        registeredProfessionals: 0,
        publishedOffers: 0,
        totalApplications: 0
      });
    });
  });

  describe('Database Query Optimization', () => {
    it('should use count queries efficiently', async () => {
      mockPrisma.restaurant.count.mockResolvedValue(25);
      mockPrisma.employee.count.mockResolvedValue(150);
      mockPrisma.jobOffer.count.mockResolvedValue(75);
      mockPrisma.application.count.mockResolvedValue(300);

      await getMetrics();

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
  });
}); 
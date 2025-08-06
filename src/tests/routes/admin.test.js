import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import adminRouter from '../../routes/admin.route.js';

// Mock all monitoring modules
jest.mock('../../middleware/ddosMonitoring.js');
jest.mock('../../middleware/performanceMonitoring.js');
jest.mock('../../middleware/errorTracking.js');
jest.mock('../../db.js');

// Import mocked modules
import { getMonitoringStats, resetMonitoring } from '../../middleware/ddosMonitoring.js';
import { getPerformanceStats, getHealthStatus } from '../../middleware/performanceMonitoring.js';
import { getErrorStats, searchErrors } from '../../middleware/errorTracking.js';
import { prisma } from '../../db.js';

describe('Admin Routes', () => {
  let app;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create Express app with admin routes
    app = express();
    app.use(express.json());
    app.use('/api/admin', adminRouter);

    // Mock Prisma queries
    prisma.restaurant.count.mockResolvedValue(45);
    prisma.employee.count.mockResolvedValue(234);
    prisma.jobOffer.count.mockResolvedValue(89);
    prisma.application.count.mockResolvedValue(156);

    // Mock monitoring functions
    getMonitoringStats.mockReturnValue({
      totalRequests: 1250,
      requestsPerSecond: 25,
      requestsPerMinute: 1500,
      uniqueIPs: 45,
      suspiciousIPs: 2,
      failedRequests: 12,
      topIPs: [
        { ip: '127.0.0.1', count: 50 },
        { ip: '192.168.1.1', count: 30 }
      ],
      recentActivity: []
    });

    getPerformanceStats.mockReturnValue({
      overview: {
        requestsLast5Min: 45,
        requestsLastHour: 520,
        avgResponseTime: 180,
        errorRate: 0.5,
        slowRequestsCount: 2,
        currentMemory: { heapUsed: 20000000 },
        uptime: 3600
      },
      slowestEndpoints: [
        { endpoint: 'POST /api/jobs', avgTime: 850, count: 12, errors: 0 }
      ],
      recentSlowQueries: [],
      memoryTrend: [],
      responseTimes: { fast: 38, medium: 6, slow: 1, verySlow: 0 }
    });

    getHealthStatus.mockReturnValue({
      status: 'healthy',
      issues: [],
      timestamp: new Date().toISOString(),
      uptime: 3600,
      memory: {
        used: 45,
        total: 128,
        percentage: 35
      }
    });

    getErrorStats.mockReturnValue({
      overview: {
        totalErrors: 156,
        errorsLastHour: 8,
        errorsLast24Hours: 45,
        criticalErrors: 2,
        errorRate: 8,
        topErrorType: { type: 'validation:invalid_input', count: 12 }
      },
      errorsByCategory: { validation: 15, database: 3, authentication: 8 },
      topErrorEndpoints: [
        { endpoint: 'POST /api/signin', count: 12, lastError: new Date().toISOString() }
      ],
      recentCriticalErrors: [],
      errorTrend: {},
      uniqueUsers: 5
    });

    searchErrors.mockReturnValue([
      {
        id: 'error1',
        category: 'database',
        severity: 'critical',
        message: 'Database connection failed',
        endpoint: 'GET /api/test'
      }
    ]);

    resetMonitoring.mockImplementation(() => {});
  });

  describe('Business Metrics Endpoints', () => {
    describe('GET /api/admin/total-counts', () => {
      test('should return business metrics successfully', async () => {
        const response = await request(app)
          .get('/api/admin/total-counts')
          .expect(200);

        expect(response.body).toEqual({
          success: true,
          data: {
            registeredCompanies: 45,
            registeredProfessionals: 234,
            publishedOffers: 89,
            totalApplications: 156
          }
        });

        expect(prisma.restaurant.count).toHaveBeenCalled();
        expect(prisma.employee.count).toHaveBeenCalled();
        expect(prisma.jobOffer.count).toHaveBeenCalled();
        expect(prisma.application.count).toHaveBeenCalled();
      });

      test('should handle database errors gracefully', async () => {
        prisma.restaurant.count.mockRejectedValue(new Error('Database error'));

        const response = await request(app)
          .get('/api/admin/total-counts')
          .expect(500);

        expect(response.body).toEqual({
          success: false,
          message: 'Internal Server Error'
        });
      });
    });

    describe('GET /api/admin/metrics', () => {
      test('should return legacy metrics format', async () => {
        const response = await request(app)
          .get('/api/admin/metrics')
          .expect(200);

        expect(response.body).toEqual({
          registeredCompanies: 45,
          registeredProfessionals: 234,
          publishedOffers: 89,
          totalApplications: 156
        });
      });
    });
  });

  describe('Security Monitoring Endpoints', () => {
    describe('GET /api/admin/security/ddos-stats', () => {
      test('should return DDoS monitoring statistics', async () => {
        const response = await request(app)
          .get('/api/admin/security/ddos-stats')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('totalRequests');
        expect(response.body.data).toHaveProperty('requestsPerSecond');
        expect(response.body.data).toHaveProperty('uniqueIPs');
        expect(response.body.data).toHaveProperty('status');
        expect(response.body.data.status).toBe('NORMAL'); // <50 req/sec

        expect(getMonitoringStats).toHaveBeenCalled();
      });

      test('should return WARNING status for high traffic', async () => {
        getMonitoringStats.mockReturnValue({
          ...getMonitoringStats(),
          requestsPerSecond: 75 // Above 50 threshold
        });

        const response = await request(app)
          .get('/api/admin/security/ddos-stats')
          .expect(200);

        expect(response.body.data.status).toBe('WARNING');
      });
    });

    describe('POST /api/admin/security/reset-monitoring', () => {
      test('should reset monitoring data successfully', async () => {
        const response = await request(app)
          .post('/api/admin/security/reset-monitoring')
          .expect(200);

        expect(response.body).toEqual({
          success: true,
          message: 'DDoS monitoring data reset successfully'
        });

        expect(resetMonitoring).toHaveBeenCalled();
      });
    });

    describe('GET /api/admin/security/alert-config', () => {
      test('should return alert configuration', async () => {
        const response = await request(app)
          .get('/api/admin/security/alert-config')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('thresholds');
        expect(response.body.data).toHaveProperty('settings');
        expect(response.body.data).toHaveProperty('features');

        expect(response.body.data.thresholds).toHaveProperty('requestsPerSecondWarning', 50);
        expect(response.body.data.thresholds).toHaveProperty('requestsPerSecondCritical', 100);
      });
    });
  });

  describe('Performance Monitoring Endpoints', () => {
    describe('GET /api/admin/performance/stats', () => {
      test('should return performance statistics', async () => {
        const response = await request(app)
          .get('/api/admin/performance/stats')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('overview');
        expect(response.body.data).toHaveProperty('slowestEndpoints');
        expect(response.body.data).toHaveProperty('responseTimes');

        expect(getPerformanceStats).toHaveBeenCalled();
      });
    });

    describe('GET /api/admin/performance/health', () => {
      test('should return health status', async () => {
        const response = await request(app)
          .get('/api/admin/performance/health')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('status', 'healthy');
        expect(response.body.data).toHaveProperty('issues');
        expect(response.body.data).toHaveProperty('memory');

        expect(getHealthStatus).toHaveBeenCalled();
      });

      test('should return critical status when unhealthy', async () => {
        getHealthStatus.mockReturnValue({
          status: 'critical',
          issues: ['Memory usage is critical'],
          memory: { used: 95, total: 100, percentage: 95 }
        });

        const response = await request(app)
          .get('/api/admin/performance/health')
          .expect(200);

        expect(response.body.data.status).toBe('critical');
        expect(response.body.data.issues).toContain('Memory usage is critical');
      });
    });
  });

  describe('Error Tracking Endpoints', () => {
    describe('GET /api/admin/errors/stats', () => {
      test('should return error statistics', async () => {
        const response = await request(app)
          .get('/api/admin/errors/stats')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('overview');
        expect(response.body.data).toHaveProperty('errorsByCategory');
        expect(response.body.data).toHaveProperty('topErrorEndpoints');

        expect(getErrorStats).toHaveBeenCalled();
      });
    });

    describe('GET /api/admin/errors/search', () => {
      test('should search errors with filters', async () => {
        const response = await request(app)
          .get('/api/admin/errors/search')
          .query({
            category: 'database',
            severity: 'critical',
            timeRange: '24'
          })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('errors');
        expect(response.body.data).toHaveProperty('total');
        expect(response.body.data).toHaveProperty('query');

        expect(searchErrors).toHaveBeenCalledWith({
          category: 'database',
          severity: 'critical',
          endpoint: undefined,
          userId: undefined,
          timeRange: 24
        });
      });

      test('should search errors without filters', async () => {
        const response = await request(app)
          .get('/api/admin/errors/search')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(searchErrors).toHaveBeenCalledWith({
          category: undefined,
          severity: undefined,
          endpoint: undefined,
          userId: undefined,
          timeRange: undefined
        });
      });

      test('should parse timeRange as integer', async () => {
        await request(app)
          .get('/api/admin/errors/search')
          .query({ timeRange: '48' })
          .expect(200);

        expect(searchErrors).toHaveBeenCalledWith(
          expect.objectContaining({ timeRange: 48 })
        );
      });
    });
  });

  describe('System Overview Endpoint', () => {
    describe('GET /api/admin/system/overview', () => {
      test('should return comprehensive system overview', async () => {
        const response = await request(app)
          .get('/api/admin/system/overview')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('timestamp');
        expect(response.body.data).toHaveProperty('status', 'healthy');
        expect(response.body.data).toHaveProperty('uptime');
        expect(response.body.data).toHaveProperty('business');
        expect(response.body.data).toHaveProperty('performance');
        expect(response.body.data).toHaveProperty('security');
        expect(response.body.data).toHaveProperty('errors');
        expect(response.body.data).toHaveProperty('health');

        // Verify business metrics
        expect(response.body.data.business).toEqual({
          companies: 45,
          professionals: 234,
          jobs: 89,
          applications: 156
        });

        // Verify all monitoring functions were called
        expect(getMonitoringStats).toHaveBeenCalled();
        expect(getPerformanceStats).toHaveBeenCalled();
        expect(getErrorStats).toHaveBeenCalled();
        expect(getHealthStatus).toHaveBeenCalled();
      });

      test('should handle errors in system overview', async () => {
        prisma.restaurant.count.mockRejectedValue(new Error('Database error'));

        const response = await request(app)
          .get('/api/admin/system/overview')
          .expect(500);

        expect(response.body).toEqual({
          success: false,
          message: 'Internal Server Error'
        });
      });
    });
  });

  describe('System Logs Endpoint', () => {
    describe('GET /api/admin/system/logs', () => {
      test('should return log information', async () => {
        const response = await request(app)
          .get('/api/admin/system/logs')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.message).toContain('Log viewing not implemented yet');
        expect(response.body.data).toHaveProperty('logFiles');
        expect(response.body.data).toHaveProperty('location');

        expect(response.body.data.logFiles).toEqual([
          'error.log',
          'warn.log', 
          'info.log',
          'combined.log'
        ]);
      });
    });
  });

  describe('Error Handling', () => {
    test('should handle monitoring function errors gracefully', async () => {
      getMonitoringStats.mockImplementation(() => {
        throw new Error('Monitoring error');
      });

      const response = await request(app)
        .get('/api/admin/security/ddos-stats')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        message: 'Internal Server Error'
      });
    });

    test('should handle performance monitoring errors gracefully', async () => {
      getPerformanceStats.mockImplementation(() => {
        throw new Error('Performance error');
      });

      const response = await request(app)
        .get('/api/admin/performance/stats')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        message: 'Internal Server Error'
      });
    });

    test('should handle error tracking errors gracefully', async () => {
      getErrorStats.mockImplementation(() => {
        throw new Error('Error tracking error');
      });

      const response = await request(app)
        .get('/api/admin/errors/stats')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        message: 'Internal Server Error'
      });
    });
  });

  describe('Environment Configuration', () => {
    test('should reflect email configuration in alert config', async () => {
      process.env.SMTP_USER = 'test@example.com';
      process.env.ADMIN_EMAIL = 'admin@example.com';

      const response = await request(app)
        .get('/api/admin/security/alert-config')
        .expect(200);

      expect(response.body.data.settings.emailAlertsEnabled).toBe(true);
      expect(response.body.data.settings.adminEmail).toBe('admin@example.com');
    });

    test('should handle missing email configuration', async () => {
      delete process.env.SMTP_USER;
      delete process.env.ADMIN_EMAIL;

      const response = await request(app)
        .get('/api/admin/security/alert-config')
        .expect(200);

      expect(response.body.data.settings.emailAlertsEnabled).toBe(false);
    });
  });

  describe('Response Format Consistency', () => {
    test('all endpoints should return consistent success response format', async () => {
      const endpoints = [
        '/api/admin/total-counts',
        '/api/admin/security/ddos-stats',
        '/api/admin/performance/stats',
        '/api/admin/performance/health',
        '/api/admin/errors/stats',
        '/api/admin/errors/search',
        '/api/admin/system/overview',
        '/api/admin/system/logs'
      ];

      for (const endpoint of endpoints) {
        const response = await request(app)
          .get(endpoint)
          .expect(200);

        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('data');
      }
    });
  });
}); 
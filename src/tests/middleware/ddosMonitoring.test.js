const nodemailer = require('nodemailer');
const { ddosMonitoring, getMonitoringStats, resetMonitoring } = require('../../middleware/ddosMonitoring.js');

// Mock nodemailer
const mockTransporter = {
  sendMail: jest.fn().mockResolvedValue({ messageId: 'test-message-id' })
};

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => mockTransporter)
}));

// Mock console methods
const originalConsole = { ...console };
const mockConsole = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn()
};

describe('DDoS Monitoring Middleware', () => {
  let req, res, next;
  let now;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock console
    console.log = mockConsole.log;
    console.error = mockConsole.error;
    console.warn = mockConsole.warn;

    // Mock Date.now for consistent testing
    now = 1000000000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);

    // Setup request/response mocks
    req = {
      ip: '127.0.0.1',
      connection: { remoteAddress: '127.0.0.1' },
      headers: { 'x-forwarded-for': '127.0.0.1' }
    };

    res = {
      send: jest.fn(),
      statusCode: 200
    };

    next = jest.fn();

    // Reset monitoring state
    resetMonitoring();

    // Mock environment variables
    process.env.SMTP_USER = 'test@example.com';
    process.env.SMTP_PASS = 'password';
    process.env.ADMIN_EMAIL = 'admin@example.com';
  });

  afterEach(() => {
    // Restore console
    console.log = originalConsole.log;
    console.error = originalConsole.error;
    console.warn = originalConsole.warn;

    // Clean up environment variables
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    delete process.env.ADMIN_EMAIL;

    jest.restoreAllMocks();
  });

  describe('ddosMonitoring middleware', () => {
    test('should track incoming requests', () => {
      ddosMonitoring(req, res, next);

      expect(next).toHaveBeenCalled();
      
      const stats = getMonitoringStats();
      expect(stats.totalRequests).toBe(1);
      expect(stats.uniqueIPs).toBe(1);
    });

    test('should track requests per IP address', () => {
      // Simulate multiple requests from same IP
      ddosMonitoring(req, res, next);
      ddosMonitoring(req, res, next);
      ddosMonitoring(req, res, next);

      const stats = getMonitoringStats();
      expect(stats.totalRequests).toBe(3);
      expect(stats.uniqueIPs).toBe(1);
      expect(stats.topIPs[0].ip).toBe('127.0.0.1');
      expect(stats.topIPs[0].count).toBe(3);
    });

    test('should track requests from different IPs', () => {
      ddosMonitoring(req, res, next);

      // Different IP
      req.ip = '192.168.1.1';
      ddosMonitoring(req, res, next);

      const stats = getMonitoringStats();
      expect(stats.totalRequests).toBe(2);
      expect(stats.uniqueIPs).toBe(2);
    });

    test('should override response send method to track failed requests', () => {
      const originalSend = res.send;
      
      ddosMonitoring(req, res, next);
      
      expect(res.send).not.toBe(originalSend);
    });

    test('should track failed requests (4xx/5xx status codes)', () => {
      ddosMonitoring(req, res, next);
      
      res.statusCode = 404;
      res.send('Not found');

      const stats = getMonitoringStats();
      expect(stats.failedRequests).toBeGreaterThan(0);
    });

    test('should not track successful requests as failed', () => {
      ddosMonitoring(req, res, next);
      
      res.statusCode = 200;
      res.send('OK');

      const stats = getMonitoringStats();
      expect(stats.failedRequests).toBe(0);
    });

    test('should calculate requests per second', () => {
      // Mock time progression
      now = 1000;
      ddosMonitoring(req, res, next);

      now = 2000; // 1 second later
      ddosMonitoring(req, res, next);

      const stats = getMonitoringStats();
      expect(stats.requestsPerSecond).toBeGreaterThan(0);
    });

    test('should calculate requests per minute', () => {
      // Simulate multiple requests
      for (let i = 0; i < 5; i++) {
        ddosMonitoring(req, res, next);
      }

      const stats = getMonitoringStats();
      expect(stats.requestsPerMinute).toBe(5);
    });

    test('should identify suspicious IPs based on request frequency', () => {
      // Simulate high frequency requests from one IP
      for (let i = 0; i < 250; i++) { // Above 200 threshold
        now = 1000 + i * 100; // Spread over time
        ddosMonitoring(req, res, next);
      }

      const stats = getMonitoringStats();
      expect(stats.suspiciousIPs).toBeGreaterThan(0);
    });
  });

  describe('getMonitoringStats', () => {
    beforeEach(() => {
      // Generate some test data
      ddosMonitoring(req, res, next);
      
      req.ip = '192.168.1.1';
      ddosMonitoring(req, res, next);
    });

    test('should return comprehensive monitoring statistics', () => {
      const stats = getMonitoringStats();

      expect(stats).toHaveProperty('totalRequests');
      expect(stats).toHaveProperty('requestsPerSecond');
      expect(stats).toHaveProperty('requestsPerMinute');
      expect(stats).toHaveProperty('uniqueIPs');
      expect(stats).toHaveProperty('suspiciousIPs');
      expect(stats).toHaveProperty('failedRequests');
      expect(stats).toHaveProperty('topIPs');
      expect(stats).toHaveProperty('recentActivity');
    });

    test('should return top IPs sorted by request count', () => {
      const stats = getMonitoringStats();

      expect(Array.isArray(stats.topIPs)).toBe(true);
      expect(stats.topIPs.length).toBeGreaterThan(0);
      
      // Should be sorted by count (descending)
      for (let i = 1; i < stats.topIPs.length; i++) {
        expect(stats.topIPs[i-1].count).toBeGreaterThanOrEqual(stats.topIPs[i].count);
      }
    });

    test('should limit top IPs to 10 entries', () => {
      // Generate requests from many different IPs
      for (let i = 0; i < 15; i++) {
        req.ip = `192.168.1.${i}`;
        ddosMonitoring(req, res, next);
      }

      const stats = getMonitoringStats();
      expect(stats.topIPs.length).toBeLessThanOrEqual(10);
    });

    test('should return recent activity within time window', () => {
      const stats = getMonitoringStats();

      expect(Array.isArray(stats.recentActivity)).toBe(true);
      
      // All activity should be recent (within last minute)
      const oneMinuteAgo = Date.now() - 60 * 1000;
      stats.recentActivity.forEach(activity => {
        expect(activity.timestamp).toBeGreaterThan(oneMinuteAgo);
      });
    });
  });

  describe('resetMonitoring', () => {
    test('should clear all monitoring data', () => {
      // Generate some test data
      ddosMonitoring(req, res, next);
      ddosMonitoring(req, res, next);

      let stats = getMonitoringStats();
      expect(stats.totalRequests).toBeGreaterThan(0);

      // Reset monitoring
      resetMonitoring();

      stats = getMonitoringStats();
      expect(stats.totalRequests).toBe(0);
      expect(stats.uniqueIPs).toBe(0);
      expect(stats.suspiciousIPs).toBe(0);
      expect(stats.failedRequests).toBe(0);
      expect(stats.topIPs).toHaveLength(0);
    });
  });

  describe('Alert system', () => {
    beforeEach(() => {
      // Mock environment variables for email
      process.env.SMTP_USER = 'test@example.com';
      process.env.SMTP_PASS = 'password';
      process.env.ADMIN_EMAIL = 'admin@example.com';
    });

    test('should trigger alert for high request rate', () => {
      // Mock console.log to capture alert messages
      const logSpy = jest.spyOn(console, 'log');

      // Simulate high request rate (100 requests per second to trigger CRITICAL alert)
      for (let i = 0; i < 100; i++) {
        now = 1000 + i * 10; // 100 req/sec (10ms between requests)
        ddosMonitoring(req, res, next);
      }

      // Should trigger alert due to high request rate
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('🚨 DDoS Alert'),
        expect.any(Object)
      );
    });

    test('should not trigger alert for normal traffic', () => {
      const logSpy = jest.spyOn(console, 'log');

      // Simulate normal request rate
      for (let i = 0; i < 10; i++) {
        now = 1000 + i * 1000; // 1 req/sec
        ddosMonitoring(req, res, next);
      }

      // Should not trigger alert
      expect(logSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('🚨 DDoS Alert'),
        expect.any(Object)
      );
    });

    test('should respect alert cooldown period', () => {
      const logSpy = jest.spyOn(console, 'log');

      // Trigger first alert
      for (let i = 0; i < 10; i++) {
        now = 1000 + i * 10;
        ddosMonitoring(req, res, next);
      }

      const firstAlertCount = logSpy.mock.calls.filter(call => 
        call[0] && call[0].includes('🚨 DDoS Alert')
      ).length;

      // Immediately trigger another high load (should be in cooldown)
      for (let i = 0; i < 10; i++) {
        now = 2000 + i * 10;
        ddosMonitoring(req, res, next);
      }

      const secondAlertCount = logSpy.mock.calls.filter(call => 
        call[0] && call[0].includes('🚨 DDoS Alert')
      ).length;

      // Should not increase alert count due to cooldown
      expect(secondAlertCount).toBe(firstAlertCount);
    });

    test.skip('should send email alerts when configured', async () => {
      // Mock successful email sending
      mockTransporter.sendMail.mockResolvedValue({ messageId: 'test-id' });

      // Trigger alert with high request rate
      for (let i = 0; i < 100; i++) {
        now = 1000 + i * 10;
        ddosMonitoring(req, res, next);
      }

      // Wait for async email sending to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should attempt to send email (check that sendMail was called)
      expect(mockTransporter.sendMail).toHaveBeenCalled();
    });
  });

  describe('IP address extraction', () => {
    test('should use req.ip when available', () => {
      req.ip = '10.0.0.1';
      ddosMonitoring(req, res, next);

      const stats = getMonitoringStats();
      expect(stats.topIPs[0].ip).toBe('10.0.0.1');
    });

    test('should fallback to connection.remoteAddress', () => {
      req.ip = undefined;
      req.connection.remoteAddress = '10.0.0.2';
      ddosMonitoring(req, res, next);

      const stats = getMonitoringStats();
      expect(stats.topIPs[0].ip).toBe('10.0.0.2');
    });

    test('should fallback to x-forwarded-for header', () => {
      req.ip = undefined;
      req.connection.remoteAddress = undefined;
      req.headers['x-forwarded-for'] = '10.0.0.3';
      ddosMonitoring(req, res, next);

      const stats = getMonitoringStats();
      expect(stats.topIPs[0].ip).toBe('10.0.0.3');
    });
  });

  describe('Traffic pattern analysis', () => {
    test('should detect burst traffic patterns', () => {
      // Simulate burst of requests in short time
      const burstTime = 1000;
      for (let i = 0; i < 50; i++) {
        now = burstTime + i;
        ddosMonitoring(req, res, next);
      }

      const stats = getMonitoringStats();
      expect(stats.requestsPerSecond).toBeGreaterThan(40); // High burst rate
    });

    test('should track failed request patterns', () => {
      // Reset monitoring to ensure clean state
      resetMonitoring();
      
      // Simulate failed requests
      for (let i = 0; i < 5; i++) {
        res.statusCode = 404;
        ddosMonitoring(req, res, next);
        // Call res.send to trigger the failed request tracking
        res.send('Not found');
      }

      const stats = getMonitoringStats();
      // Check that failed requests are being tracked (should be at least 5)
      expect(stats.failedRequests).toBeGreaterThanOrEqual(5);
    });

    test('should identify distributed attacks from multiple IPs', () => {
      // Simulate requests from multiple IPs
      for (let i = 0; i < 20; i++) {
        req.ip = `192.168.1.${i % 5}`; // 5 different IPs
        ddosMonitoring(req, res, next);
      }

      const stats = getMonitoringStats();
      expect(stats.uniqueIPs).toBe(5);
      expect(stats.totalRequests).toBe(20);
    });
  });
}); 
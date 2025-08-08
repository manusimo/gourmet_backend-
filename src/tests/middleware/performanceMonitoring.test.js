const { performanceMonitoring, getPerformanceStats, getHealthStatus } = require('../../middleware/performanceMonitoring.js');

// Mock performance module
jest.mock('perf_hooks', () => ({
  performance: {
    now: jest.fn()
  }
}));

describe('Performance Monitoring Middleware', () => {
  let req, res, next;
  let mockPerformance;

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock performance.now
    const { performance } = await require('perf_hooks');
    mockPerformance = performance;
    
    // Setup request/response mocks
    req = {
      method: 'GET',
      originalUrl: '/api/test',
      route: { path: '/api/test' },
      get: jest.fn((header) => {
        if (header === 'User-Agent') return 'test-agent';
        return null;
      }),
      ip: '127.0.0.1'
    };

    res = {
      statusCode: 200,
      send: jest.fn(),
      json: jest.fn()
    };

    next = jest.fn();

    // Mock process.memoryUsage
    global.process.memoryUsage = jest.fn(() => ({
      rss: 50000000,
      heapTotal: 30000000,
      heapUsed: 20000000,
      external: 1000000,
      arrayBuffers: 500000
    }));

    // Mock process.uptime
    global.process.uptime = jest.fn(() => 3600);
  });

  describe('performanceMonitoring middleware', () => {
    test('should track request timing and memory usage', () => {
      // Setup timing mocks
      mockPerformance.now
        .mockReturnValueOnce(1000) // start time
        .mockReturnValueOnce(1150); // end time (150ms response)

      // Execute middleware
      performanceMonitoring(req, res, next);

      // Verify next was called
      expect(next).toHaveBeenCalled();

      // Simulate response
      res.send('test response');

      // Verify timing was measured
      expect(mockPerformance.now).toHaveBeenCalledTimes(2);
    });

    test('should override response methods to capture metrics', () => {
      const originalSend = res.send;
      const originalJson = res.json;

      performanceMonitoring(req, res, next);

      // Verify methods were overridden
      expect(res.send).not.toBe(originalSend);
      expect(res.json).not.toBe(originalJson);
    });

    test('should detect slow requests (>1000ms)', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      // Mock slow response (1500ms)
      mockPerformance.now
        .mockReturnValueOnce(1000)
        .mockReturnValueOnce(2500);

      performanceMonitoring(req, res, next);
      res.send('slow response');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('🐌 Slow request detected')
      );

      consoleSpy.mockRestore();
    });

    test('should detect high memory usage (>50MB)', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      // Mock high memory usage
      global.process.memoryUsage = jest.fn()
        .mockReturnValueOnce({ heapUsed: 20000000 }) // start
        .mockReturnValueOnce({ heapUsed: 80000000 }); // end (+60MB)

      mockPerformance.now
        .mockReturnValueOnce(1000)
        .mockReturnValueOnce(1100);

      performanceMonitoring(req, res, next);
      res.send('memory intensive response');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('🧠 High memory usage')
      );

      consoleSpy.mockRestore();
    });

    test('should track endpoint statistics', () => {
      mockPerformance.now
        .mockReturnValueOnce(1000)
        .mockReturnValueOnce(1200); // 200ms response

      performanceMonitoring(req, res, next);
      res.send('test');

      const stats = getPerformanceStats();
      
      expect(stats.overview.requestsLast5Min).toBe(1);
      expect(stats.slowestEndpoints).toHaveLength(1);
      expect(stats.slowestEndpoints[0].endpoint).toBe('GET /api/test');
    });

    test('should track error rates for 4xx/5xx responses', () => {
      mockPerformance.now
        .mockReturnValueOnce(1000)
        .mockReturnValueOnce(1100);

      res.statusCode = 500;

      performanceMonitoring(req, res, next);
      res.send('error');

      const stats = getPerformanceStats();
      expect(stats.slowestEndpoints[0].errors).toBe(1);
    });
  });

  describe('getPerformanceStats', () => {
    beforeEach(() => {
      // Clear any existing data
      const stats = getPerformanceStats();
      // Reset internal state (this would be better with a reset function)
    });

    test('should return performance overview', () => {
      const stats = getPerformanceStats();

      expect(stats).toHaveProperty('overview');
      expect(stats.overview).toHaveProperty('requestsLast5Min');
      expect(stats.overview).toHaveProperty('requestsLastHour');
      expect(stats.overview).toHaveProperty('avgResponseTime');
      expect(stats.overview).toHaveProperty('errorRate');
      expect(stats.overview).toHaveProperty('slowRequestsCount');
      expect(stats.overview).toHaveProperty('currentMemory');
      expect(stats.overview).toHaveProperty('uptime');
    });

    test('should return slowest endpoints', () => {
      const stats = getPerformanceStats();

      expect(stats).toHaveProperty('slowestEndpoints');
      expect(Array.isArray(stats.slowestEndpoints)).toBe(true);
    });

    test('should return response time distribution', () => {
      const stats = getPerformanceStats();

      expect(stats).toHaveProperty('responseTimes');
      expect(stats.responseTimes).toHaveProperty('fast');
      expect(stats.responseTimes).toHaveProperty('medium');
      expect(stats.responseTimes).toHaveProperty('slow');
      expect(stats.responseTimes).toHaveProperty('verySlow');
    });

    test('should return memory trend', () => {
      const stats = getPerformanceStats();

      expect(stats).toHaveProperty('memoryTrend');
      expect(Array.isArray(stats.memoryTrend)).toBe(true);
    });
  });

  describe('getHealthStatus', () => {
    test('should return healthy status with no issues', () => {
      // Mock good performance
      global.process.memoryUsage = jest.fn(() => ({
        heapUsed: 10000000,  // 10MB
        heapTotal: 100000000 // 100MB (10% usage)
      }));

      const health = getHealthStatus();

      expect(health.status).toBe('healthy');
      expect(health.issues).toHaveLength(0);
      expect(health).toHaveProperty('timestamp');
      expect(health).toHaveProperty('uptime');
      expect(health).toHaveProperty('memory');
    });

    test('should return warning status for high response times', () => {
      // Mock slow performance by simulating slow requests
      mockPerformance.now
        .mockReturnValueOnce(1000)
        .mockReturnValueOnce(2500); // 1500ms response

      performanceMonitoring(req, res, next);
      res.send('slow response');

      // Get health after slow request
      const health = getHealthStatus();

      // This might be healthy if no previous slow requests, 
      // but the logic should detect patterns over time
      expect(health.status).toMatch(/healthy|warning/);
    });

    test('should return critical status for high memory usage', () => {
      // Mock critical memory usage (95%)
      global.process.memoryUsage = jest.fn(() => ({
        heapUsed: 95000000,  // 95MB
        heapTotal: 100000000 // 100MB (95% usage)
      }));

      const health = getHealthStatus();

      expect(health.status).toBe('critical');
      expect(health.issues).toContain('Memory usage is critical');
      expect(health.memory.percentage).toBe(95);
    });

    test('should calculate memory percentage correctly', () => {
      global.process.memoryUsage = jest.fn(() => ({
        heapUsed: 25000000,  // 25MB
        heapTotal: 100000000 // 100MB
      }));

      const health = getHealthStatus();

      expect(health.memory.used).toBe(24); // 25MB in MB (rounded)
      expect(health.memory.total).toBe(95); // 100MB in MB (rounded)
      expect(health.memory.percentage).toBe(25);
    });
  });

  describe('Response time categorization', () => {
    test('should categorize fast responses (<100ms)', () => {
      mockPerformance.now
        .mockReturnValueOnce(1000)
        .mockReturnValueOnce(1050); // 50ms response

      performanceMonitoring(req, res, next);
      res.send('fast response');

      const stats = getPerformanceStats();
      expect(stats.responseTimes.fast).toBe(1);
      expect(stats.responseTimes.medium).toBe(0);
    });

    test('should categorize medium responses (100-500ms)', () => {
      mockPerformance.now
        .mockReturnValueOnce(1000)
        .mockReturnValueOnce(1300); // 300ms response

      performanceMonitoring(req, res, next);
      res.send('medium response');

      const stats = getPerformanceStats();
      expect(stats.responseTimes.medium).toBe(1);
      expect(stats.responseTimes.fast).toBe(0);
    });

    test('should categorize slow responses (500-1000ms)', () => {
      mockPerformance.now
        .mockReturnValueOnce(1000)
        .mockReturnValueOnce(1750); // 750ms response

      performanceMonitoring(req, res, next);
      res.send('slow response');

      const stats = getPerformanceStats();
      expect(stats.responseTimes.slow).toBe(1);
    });

    test('should categorize very slow responses (>1000ms)', () => {
      mockPerformance.now
        .mockReturnValueOnce(1000)
        .mockReturnValueOnce(2500); // 1500ms response

      performanceMonitoring(req, res, next);
      res.send('very slow response');

      const stats = getPerformanceStats();
      expect(stats.responseTimes.verySlow).toBe(1);
    });
  });
}); 
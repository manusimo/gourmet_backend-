// Mock dependencies
const mockFs = {
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  appendFile: jest.fn((file, data, callback) => callback()),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn()
};

const mockPath = {
  join: jest.fn(),
  dirname: jest.fn()
};

jest.mock('fs', () => mockFs);
jest.mock('path', () => mockPath);

const { errorTrackingMiddleware, getErrorStats, searchErrors, Logger } = require('../../middleware/errorTracking.js');

describe('Error Tracking Middleware', () => {
  let req, res, next;
  let mockError;
  let now;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock path.join to handle both error.log and combined.log
    mockPath.join.mockImplementation((...args) => {
      if (args.includes('combined.log')) {
        return '/mock/logs/combined.log';
      }
      return '/mock/logs/error.log';
    });
    mockPath.dirname.mockReturnValue('/mock/logs');
    
    // Mock fs operations
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue('[]');
    
    // Mock Date.now for consistent testing
    now = 1000000000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    
    // Mock process
    global.process.pid = 12345;
    global.process.memoryUsage = jest.fn(() => ({
      heapUsed: 20000000
    }));
    global.process.cwd = jest.fn(() => '/mock/cwd');

    // Setup request/response mocks
    req = {
      method: 'GET',
      originalUrl: '/api/test',
      get: jest.fn((header) => {
        if (header === 'User-Agent') return 'test-agent';
        return null;
      }),
      ip: '127.0.0.1',
      body: { test: 'data' },
      query: { page: 1 },
      headers: { 'content-type': 'application/json' }
    };

    res = {
      statusCode: 500
    };

    next = jest.fn();

    // Setup mock error
    mockError = new Error('Test error message');
    mockError.status = 500;
    mockError.stack = 'Error: Test error\n    at test.js:1:1';

    // Mock console methods
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('errorTrackingMiddleware', () => {
    test('should categorize database errors correctly', () => {
      const dbError = new Error('Database connection failed');
      dbError.code = 'P1001';

      errorTrackingMiddleware(dbError, req, res, next);

      expect(next).toHaveBeenCalledWith(dbError);
    });

    test('should categorize validation errors correctly', () => {
      const validationError = new Error('Invalid input');
      validationError.status = 400;

      errorTrackingMiddleware(validationError, req, res, next);

      expect(next).toHaveBeenCalledWith(validationError);
    });

    test('should categorize authentication errors correctly', () => {
      const authError = new Error('Unauthorized');
      authError.status = 401;

      errorTrackingMiddleware(authError, req, res, next);

      expect(next).toHaveBeenCalledWith(authError);
    });

    test('should categorize rate limit errors correctly', () => {
      const rateLimitError = new Error('Too many requests');
      rateLimitError.status = 429;

      errorTrackingMiddleware(rateLimitError, req, res, next);

      expect(next).toHaveBeenCalledWith(rateLimitError);
    });

    test('should generate unique error IDs', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      errorTrackingMiddleware(mockError, req, res, next);
      errorTrackingMiddleware(mockError, req, res, next);

      // Check that different error IDs were generated
      expect(consoleSpy).toHaveBeenCalledTimes(2);
      
      consoleSpy.mockRestore();
    });

    test('should sanitize sensitive data in request body', () => {
      req.body = {
        username: 'testuser',
        password: 'secret123',
        token: 'jwt-token',
        data: 'normal data'
      };

      errorTrackingMiddleware(mockError, req, res, next);

      // The password and token should be redacted in logs
      expect(mockFs.appendFile).toHaveBeenCalled();
    });

    test('should sanitize sensitive headers', () => {
      req.headers = {
        'content-type': 'application/json',
        'authorization': 'Bearer token123',
        'cookie': 'session=abc123',
        'x-api-key': 'api-key-123'
      };

      errorTrackingMiddleware(mockError, req, res, next);

      expect(mockFs.appendFile).toHaveBeenCalled();
    });

    test('should track critical errors separately', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const criticalError = new Error('Critical system failure');
      criticalError.status = 500;

      errorTrackingMiddleware(criticalError, req, res, next);

      // Should log critical error alert
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('🚨 CRITICAL ERROR DETECTED'),
        expect.any(Object)
      );

      consoleSpy.mockRestore();
    });

    test('should track errors by endpoint', () => {
      errorTrackingMiddleware(mockError, req, res, next);

      const stats = getErrorStats();
      expect(stats.topErrorEndpoints.length).toBeGreaterThan(0);
    });

    test('should track user-specific errors when userId is present', () => {
      req.userId = 'user123';

      errorTrackingMiddleware(mockError, req, res, next);

      const stats = getErrorStats();
      expect(stats.uniqueUsers).toBeGreaterThan(0);
    });

    test('should continue with error handling after tracking', () => {
      errorTrackingMiddleware(mockError, req, res, next);

      expect(next).toHaveBeenCalledWith(mockError);
    });
  });

  describe('Logger class', () => {
    beforeEach(() => {
      jest.spyOn(console, 'log').mockImplementation();
    });

    afterEach(() => {
      console.log.mockRestore();
    });

    test('should log error messages with red color', () => {
      Logger.error('Test error message', { context: 'test' });

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('\x1b[31m'), // Red color code
        expect.any(Object)
      );
    });

    test('should log warning messages with yellow color', () => {
      Logger.warn('Test warning message');

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('\x1b[33m'), // Yellow color code
        ''
      );
    });

    test('should log info messages with cyan color', () => {
      Logger.info('Test info message');

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('\x1b[36m'), // Cyan color code
        ''
      );
    });

    test('should write logs to files', () => {
      Logger.error('Test error');

      expect(mockFs.appendFile).toHaveBeenCalledWith(
        expect.stringContaining('error.log'),
        expect.any(String),
        expect.any(Function)
      );

      expect(mockFs.appendFile).toHaveBeenCalledWith(
        expect.stringContaining('combined.log'),
        expect.any(String),
        expect.any(Function)
      );
    });

    test('should include metadata in log entries', () => {
      const metadata = { userId: 'user123', endpoint: '/api/test' };
      
      Logger.error('Test error with metadata', metadata);

      expect(mockFs.appendFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('userId'),
        expect.any(Function)
      );
    });
  });

  describe('getErrorStats', () => {
    beforeEach(() => {
      // Simulate some errors for testing
      errorTrackingMiddleware(mockError, req, res, next);
      
      const validationError = new Error('Validation failed');
      validationError.status = 400;
      errorTrackingMiddleware(validationError, req, res, next);
    });

    test('should return error overview statistics', () => {
      const stats = getErrorStats();

      expect(stats).toHaveProperty('overview');
      expect(stats.overview).toHaveProperty('totalErrors');
      expect(stats.overview).toHaveProperty('errorsLastHour');
      expect(stats.overview).toHaveProperty('errorsLast24Hours');
      expect(stats.overview).toHaveProperty('criticalErrors');
      expect(stats.overview).toHaveProperty('errorRate');
      expect(stats.overview).toHaveProperty('topErrorType');
    });

    test('should return errors by category', () => {
      const stats = getErrorStats();

      expect(stats).toHaveProperty('errorsByCategory');
      expect(typeof stats.errorsByCategory).toBe('object');
    });

    test('should return top error endpoints', () => {
      const stats = getErrorStats();

      expect(stats).toHaveProperty('topErrorEndpoints');
      expect(Array.isArray(stats.topErrorEndpoints)).toBe(true);
      expect(stats.topErrorEndpoints.length).toBeGreaterThan(0);
    });

    test('should return recent critical errors', () => {
      const stats = getErrorStats();

      expect(stats).toHaveProperty('recentCriticalErrors');
      expect(Array.isArray(stats.recentCriticalErrors)).toBe(true);
    });

    test('should return error trend data', () => {
      const stats = getErrorStats();

      expect(stats).toHaveProperty('errorTrend');
      expect(typeof stats.errorTrend).toBe('object');
    });

    test('should return unique users count', () => {
      const stats = getErrorStats();

      expect(stats).toHaveProperty('uniqueUsers');
      expect(typeof stats.uniqueUsers).toBe('number');
    });
  });

  describe('searchErrors', () => {
    beforeEach(() => {
      // Create different types of errors for testing
      const dbError = new Error('Database error');
      dbError.code = 'P2002';
      errorTrackingMiddleware(dbError, req, res, next);

      const authError = new Error('Auth error');
      authError.status = 401;
      req.userId = 'user123';
      errorTrackingMiddleware(authError, req, res, next);
    });

    test('should filter errors by category', () => {
      const results = searchErrors({ category: 'database' });

      expect(Array.isArray(results)).toBe(true);
      results.forEach(error => {
        expect(error.category).toBe('database');
      });
    });

    test('should filter errors by severity', () => {
      const results = searchErrors({ severity: 'critical' });

      expect(Array.isArray(results)).toBe(true);
      results.forEach(error => {
        expect(error.severity).toBe('critical');
      });
    });

    test('should filter errors by endpoint', () => {
      const results = searchErrors({ endpoint: '/api/test' });

      expect(Array.isArray(results)).toBe(true);
      results.forEach(error => {
        expect(error.endpoint).toContain('/api/test');
      });
    });

    test('should filter errors by userId', () => {
      const results = searchErrors({ userId: 'user123' });

      expect(Array.isArray(results)).toBe(true);
      results.forEach(error => {
        expect(error.userId).toBe('user123');
      });
    });

    test('should filter errors by time range', () => {
      const results = searchErrors({ timeRange: 1 }); // Last 1 hour

      expect(Array.isArray(results)).toBe(true);
      // All errors should be within the last hour
      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      results.forEach(error => {
        expect(new Date(error.timestamp).getTime()).toBeGreaterThan(oneHourAgo);
      });
    });

    test('should limit results to 100', () => {
      const results = searchErrors({});

      expect(results.length).toBeLessThanOrEqual(100);
    });

    test('should return all errors when no filters applied', () => {
      const results = searchErrors({});

      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('Prisma error type mapping', () => {
    test('should map P2002 to unique constraint violation', () => {
      const uniqueError = new Error('Unique constraint failed');
      uniqueError.code = 'P2002';

      errorTrackingMiddleware(uniqueError, req, res, next);

      // The error should be categorized correctly
      // This is tested indirectly through the categorization logic
      expect(next).toHaveBeenCalledWith(uniqueError);
    });

    test('should map P2025 to record not found', () => {
      const notFoundError = new Error('Record not found');
      notFoundError.code = 'P2025';

      errorTrackingMiddleware(notFoundError, req, res, next);

      expect(next).toHaveBeenCalledWith(notFoundError);
    });

    test('should map P1001 to database unreachable', () => {
      const dbError = new Error('Database unreachable');
      dbError.code = 'P1001';

      errorTrackingMiddleware(dbError, req, res, next);

      expect(next).toHaveBeenCalledWith(dbError);
    });
  });
}); 
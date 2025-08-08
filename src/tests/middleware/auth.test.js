// Mock JWT first
jest.mock('jsonwebtoken', () => ({
  verify: jest.fn(),
  sign: jest.fn()
}));

// Mock Prisma before any imports
const mockPrisma = {
  user: {
    findUnique: jest.fn(),
  },
  employee: {
    findUnique: jest.fn(),
  },
  restaurant: {
    findUnique: jest.fn(),
  },
  $use: jest.fn(),
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrisma)
}));

jest.mock('../../db.js', () => ({
  prisma: mockPrisma
}));

jest.mock('../../middleware/security.js', () => ({
  isTokenBlacklisted: jest.fn()
}));

const jwt = require('jsonwebtoken');
const {
  validateTokenAndIdentifyUser,
  optionalAuth,
  checkEmployee,
  checkCompany,
  setUserRole,
  setUserType,
  requirePlan,
  checkLocationLimit,
  checkJobOfferLimit,
  requireAdmin,
  requireUserType,
  logAuthEvent
} = require('../../middleware/auth.js');

const { isTokenBlacklisted } = require('../../middleware/security.js');

describe('Enhanced Auth Middleware', () => {
  let req, res, next;
  let mockUser, mockEmployee, mockRestaurant;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = 'test-secret';
    
    req = {
      headers: {},
      userId: null,
      userEmail: null,
      userType: null,
      user: null,
      token: null,
      role: null,
      type: null,
      employeeId: null,
      restaurantId: null,
      get: jest.fn(),
      ip: '127.0.0.1'
    };
    
    res = {
      status: jest.fn(() => res),
      json: jest.fn(() => res)
    };
    
    next = jest.fn();

    mockUser = {
      id: 123,
      email: 'test@example.com',
      userType: 'empresas'
    };

    mockEmployee = {
      id: 456,
      userId: 123
    };

    mockRestaurant = {
      id: 789,
      userId: 123,
      currentPlan: 'professional',
      locations: [],
      jobOffers: []
    };

    // Default mocks
    isTokenBlacklisted.mockReturnValue(false);
    jwt.verify.mockReturnValue({
      userId: 123,
      email: 'test@example.com',
      userType: 'empresas'
    });
    mockPrisma.user.findUnique.mockResolvedValue(mockUser);
    mockPrisma.employee.findUnique.mockResolvedValue(null);
    mockPrisma.restaurant.findUnique.mockResolvedValue(mockRestaurant);
  });

  afterAll(() => {
    delete process.env.JWT_SECRET;
  });

  describe('validateTokenAndIdentifyUser', () => {
    test('should validate valid token successfully', async () => {
      req.headers.authorization = 'Bearer valid-token-123';
      
      await validateTokenAndIdentifyUser(req, res, next);
      
      expect(jwt.verify).toHaveBeenCalledWith('valid-token-123', process.env.JWT_SECRET);
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 123 },
        select: {
          id: true,
          email: true,
          userType: true
        }
      });
      expect(req.userId).toBe(123);
      expect(req.userEmail).toBe('test@example.com');
      expect(req.userType).toBe('empresas');
      expect(req.user).toEqual(mockUser);
      expect(req.token).toBe('valid-token-123');
      expect(next).toHaveBeenCalled();
    });

    test('should reject request without authorization header', async () => {
      await validateTokenAndIdentifyUser(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'No token provided or invalid format'
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('should reject request with invalid authorization format', async () => {
      req.headers.authorization = 'InvalidFormat token-123';
      
      await validateTokenAndIdentifyUser(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'No token provided or invalid format'
      });
    });

    test('should reject blacklisted token', async () => {
      req.headers.authorization = 'Bearer blacklisted-token';
      isTokenBlacklisted.mockReturnValue(true);
      
      await validateTokenAndIdentifyUser(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Token has been invalidated',
        error: 'TOKEN_BLACKLISTED'
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('should handle expired token', async () => {
      req.headers.authorization = 'Bearer expired-token';
      jwt.verify.mockImplementation(() => {
        const error = new Error('Token expired');
        error.name = 'TokenExpiredError';
        throw error;
      });
      
      await validateTokenAndIdentifyUser(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Token has expired',
        error: 'TOKEN_EXPIRED'
      });
    });

    test('should handle invalid token', async () => {
      req.headers.authorization = 'Bearer invalid-token';
      jwt.verify.mockImplementation(() => {
        const error = new Error('Invalid token');
        error.name = 'JsonWebTokenError';
        throw error;
      });
      
      await validateTokenAndIdentifyUser(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid token',
        error: 'INVALID_TOKEN'
      });
    });

    test('should handle user not found', async () => {
      req.headers.authorization = 'Bearer valid-token';
      mockPrisma.user.findUnique.mockResolvedValue(null);
      
      await validateTokenAndIdentifyUser(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'User no longer exists',
        error: 'USER_NOT_FOUND'
      });
    });

    test('should handle database errors gracefully', async () => {
      req.headers.authorization = 'Bearer valid-token';
      mockPrisma.user.findUnique.mockRejectedValue(new Error('Database error'));
      
      await validateTokenAndIdentifyUser(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Authentication failed'
      });
    });
  });

  describe('optionalAuth', () => {
    test('should proceed without token', async () => {
      await optionalAuth(req, res, next);
      
      expect(next).toHaveBeenCalled();
      expect(req.userId).toBeNull();
    });

    test('should authenticate valid token', async () => {
      req.headers.authorization = 'Bearer valid-token';
      
      await optionalAuth(req, res, next);
      
      expect(jwt.verify).toHaveBeenCalledWith('valid-token', process.env.JWT_SECRET);
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 123 },
        select: {
          id: true,
          email: true,
          userType: true
        }
      });
      expect(req.userId).toBe(123);
      expect(req.userEmail).toBe('test@example.com');
      expect(next).toHaveBeenCalled();
    });

    test('should proceed without authentication for blacklisted token', async () => {
      req.headers.authorization = 'Bearer blacklisted-token';
      isTokenBlacklisted.mockReturnValue(true);
      
      await optionalAuth(req, res, next);
      
      expect(next).toHaveBeenCalled();
      expect(req.userId).toBeNull();
    });

    test('should proceed without authentication for expired token', async () => {
      req.headers.authorization = 'Bearer expired-token';
      jwt.verify.mockImplementation(() => {
        const error = new Error('Token expired');
        error.name = 'TokenExpiredError';
        throw error;
      });
      
      await optionalAuth(req, res, next);
      
      expect(next).toHaveBeenCalled();
      expect(req.userId).toBeNull();
    });
  });

  describe('checkEmployee', () => {
    test('should allow authenticated employee', async () => {
      req.userId = 123;
      mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee);
      
      await checkEmployee(req, res, next);
      
      expect(req.employeeId).toBe(456);
      expect(next).toHaveBeenCalled();
    });

    test('should reject unauthenticated request', async () => {
      await checkEmployee(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Authentication required'
      });
    });

    test('should reject non-employee user', async () => {
      req.userId = 123;
      mockPrisma.employee.findUnique.mockResolvedValue(null);
      
      await checkEmployee(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Employee access required'
      });
    });

    test('should handle database errors', async () => {
      req.userId = 123;
      mockPrisma.employee.findUnique.mockRejectedValue(new Error('Database error'));
      
      await checkEmployee(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Internal Server Error'
      });
    });
  });

  describe('checkCompany', () => {
    test('should allow authenticated restaurant owner', async () => {
      req.userId = 123;
      
      await checkCompany(req, res, next);
      
      expect(req.restaurantId).toBe(789);
      expect(next).toHaveBeenCalled();
    });

    test('should reject unauthenticated request', async () => {
      await checkCompany(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Authentication required'
      });
    });

    test('should reject non-restaurant user', async () => {
      req.userId = 123;
      mockPrisma.restaurant.findUnique.mockResolvedValue(null);
      
      await checkCompany(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Company access required'
      });
    });
  });

  describe('setUserRole', () => {
    test('should set employee role', async () => {
      req.userId = 123;
      mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee);
      
      await setUserRole(req, res, next);
      
      expect(req.role).toBe('employee');
      expect(req.employeeId).toBe(456);
      expect(next).toHaveBeenCalled();
    });

    test('should set restaurant role', async () => {
      req.userId = 123;
      mockPrisma.employee.findUnique.mockResolvedValue(null);
      
      await setUserRole(req, res, next);
      
      expect(req.role).toBe('restaurant');
      expect(req.restaurantId).toBe(789);
      expect(next).toHaveBeenCalled();
    });

    test('should set user role when neither employee nor restaurant', async () => {
      req.userId = 123;
      mockPrisma.employee.findUnique.mockResolvedValue(null);
      mockPrisma.restaurant.findUnique.mockResolvedValue(null);
      
      await setUserRole(req, res, next);
      
      expect(req.role).toBe('user');
      expect(next).toHaveBeenCalled();
    });

    test('should proceed without userId', async () => {
      await setUserRole(req, res, next);
      
      expect(next).toHaveBeenCalled();
      expect(req.role).toBeNull();
    });

    test('should continue on database error', async () => {
      req.userId = 123;
      mockPrisma.employee.findUnique.mockRejectedValue(new Error('Database error'));
      
      await setUserRole(req, res, next);
      
      expect(next).toHaveBeenCalled();
    });
  });

  describe('setUserType', () => {
    test('should set type from userType', () => {
      req.userType = 'empresas';
      
      setUserType(req, res, next);
      
      expect(req.type).toBe('empresas');
      expect(next).toHaveBeenCalled();
    });

    test('should set type from role if no userType', () => {
      req.role = 'employee';
      
      setUserType(req, res, next);
      
      expect(req.type).toBe('employee');
      expect(next).toHaveBeenCalled();
    });

    test('should set guest type if neither userType nor role', () => {
      setUserType(req, res, next);
      
      expect(req.type).toBe('guest');
      expect(next).toHaveBeenCalled();
    });

    test('should handle errors gracefully', () => {
      // Mock error in middleware
      const originalUserType = req.userType;
      Object.defineProperty(req, 'userType', {
        get: () => { throw new Error('Test error'); }
      });
      
      expect(() => setUserType(req, res, next)).not.toThrow();
      expect(next).toHaveBeenCalled();
    });
  });

  describe('requirePlan', () => {
    const requireProfessionalPlan = requirePlan('professional');

    test('should allow user with sufficient plan', async () => {
      req.userId = 123;
      req.restaurantId = 789;
      
      await requireProfessionalPlan(req, res, next);
      
      expect(next).toHaveBeenCalled();
    });

    test('should reject user with insufficient plan', async () => {
      req.userId = 123;
      req.restaurantId = 789;
      mockRestaurant.currentPlan = 'starter';
      mockPrisma.restaurant.findUnique.mockResolvedValue(mockRestaurant);
      
      await requireProfessionalPlan(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'professional plan required for this feature',
        currentPlan: 'starter',
        requiredPlan: 'professional'
      });
    });

    test('should reject request without restaurant access', async () => {
      req.userId = 123;
      
      await requireProfessionalPlan(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Restaurant access required'
      });
    });

    test('should handle restaurant not found', async () => {
      req.userId = 123;
      req.restaurantId = 789;
      mockPrisma.restaurant.findUnique.mockResolvedValue(null);
      
      await requireProfessionalPlan(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Restaurant not found'
      });
    });

    test('should allow enterprise plan for any required plan', async () => {
      req.userId = 123;
      req.restaurantId = 789;
      mockRestaurant.currentPlan = 'enterprise';
      mockPrisma.restaurant.findUnique.mockResolvedValue(mockRestaurant);
      
      await requireProfessionalPlan(req, res, next);
      
      expect(next).toHaveBeenCalled();
    });
  });

  describe('checkLocationLimit', () => {
    test('should allow within location limit', async () => {
      req.restaurantId = 789;
      mockRestaurant.locations = new Array(5); // 5 locations, professional allows 10
      mockPrisma.restaurant.findUnique.mockResolvedValue(mockRestaurant);
      
      await checkLocationLimit(req, res, next);
      
      expect(next).toHaveBeenCalled();
    });

    test('should reject when at location limit', async () => {
      req.restaurantId = 789;
      mockRestaurant.currentPlan = 'starter';
      mockRestaurant.locations = new Array(3); // 3 locations, starter allows 3
      mockPrisma.restaurant.findUnique.mockResolvedValue(mockRestaurant);
      
      await checkLocationLimit(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Location limit reached for starter plan',
        currentLocations: 3,
        limit: 3
      });
    });

    test('should allow unlimited locations for enterprise plan', async () => {
      req.restaurantId = 789;
      mockRestaurant.currentPlan = 'enterprise';
      mockRestaurant.locations = new Array(100); // Many locations
      mockPrisma.restaurant.findUnique.mockResolvedValue(mockRestaurant);
      
      await checkLocationLimit(req, res, next);
      
      expect(next).toHaveBeenCalled();
    });

    test('should proceed without restaurantId', async () => {
      await checkLocationLimit(req, res, next);
      
      expect(next).toHaveBeenCalled();
    });
  });

  describe('checkJobOfferLimit', () => {
    test('should allow within job offer limit', async () => {
      req.restaurantId = 789;
      mockRestaurant.jobOffers = new Array(25); // 25 active jobs, professional allows 50
      mockPrisma.restaurant.findUnique.mockResolvedValue(mockRestaurant);
      
      await checkJobOfferLimit(req, res, next);
      
      expect(next).toHaveBeenCalled();
    });

    test('should reject when at job offer limit', async () => {
      req.restaurantId = 789;
      mockRestaurant.currentPlan = 'free';
      mockRestaurant.jobOffers = new Array(2); // 2 jobs, free allows 2
      mockPrisma.restaurant.findUnique.mockResolvedValue(mockRestaurant);
      
      await checkJobOfferLimit(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Job offer limit reached for free plan',
        activeJobOffers: 2,
        limit: 2
      });
    });

    test('should allow unlimited job offers for enterprise plan', async () => {
      req.restaurantId = 789;
      mockRestaurant.currentPlan = 'enterprise';
      mockRestaurant.jobOffers = new Array(1000); // Many jobs
      mockPrisma.restaurant.findUnique.mockResolvedValue(mockRestaurant);
      
      await checkJobOfferLimit(req, res, next);
      
      expect(next).toHaveBeenCalled();
    });
  });

  describe('requireAdmin', () => {
    test('should allow admin user', () => {
      req.userType = 'admin';
      
      requireAdmin(req, res, next);
      
      expect(next).toHaveBeenCalled();
    });

    test('should reject non-admin user', () => {
      req.userType = 'empresas';
      
      requireAdmin(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Admin access required'
      });
    });
  });

  describe('requireUserType', () => {
    const requireCompanyType = requireUserType('empresas');

    test('should allow matching user type', () => {
      req.userType = 'empresas';
      
      requireCompanyType(req, res, next);
      
      expect(next).toHaveBeenCalled();
    });

    test('should reject non-matching user type', () => {
      req.userType = 'trabajadores';
      
      requireCompanyType(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'empresas access required'
      });
    });
  });

  describe('logAuthEvent', () => {
    let consoleSpy;

    beforeEach(() => {
      consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    test('should log authentication event', () => {
      const logLogin = logAuthEvent('login');
      req.userId = 123;
      req.userType = 'empresas';
      req.ip = '192.168.1.100';
      req.get = jest.fn().mockReturnValue('Test User Agent');
      
      logLogin(req, res, next);
      
      expect(consoleSpy).toHaveBeenCalledWith('🔐 Auth Event: login', {
        userId: 123,
        userType: 'empresas',
        ip: '192.168.1.100',
        userAgent: 'Test User Agent',
        timestamp: expect.any(String)
      });
      expect(next).toHaveBeenCalled();
    });

    test('should log event with missing data gracefully', () => {
      const logEvent = logAuthEvent('test-event');
      
      logEvent(req, res, next);
      
      expect(consoleSpy).toHaveBeenCalledWith('🔐 Auth Event: test-event', {
        userId: null,
        userType: null,
        ip: '127.0.0.1',
        userAgent: undefined,
        timestamp: expect.any(String)
      });
      expect(next).toHaveBeenCalled();
    });
  });

  describe('Integration Tests', () => {
    test('should handle complete authentication flow', async () => {
      req.headers.authorization = 'Bearer valid-token';
      req.userId = 123;
      
      // Test full flow: validate -> set role -> set type
      await validateTokenAndIdentifyUser(req, res, next);
      expect(next).toHaveBeenCalled();
      
      await setUserRole(req, res, next);
      expect(req.role).toBe('restaurant');
      
      setUserType(req, res, next);
      expect(req.type).toBe('empresas');
    });

    test('should handle employee authentication flow', async () => {
      req.headers.authorization = 'Bearer valid-token';
      req.userId = 123;
      mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee);
      mockPrisma.restaurant.findUnique.mockResolvedValue(null);
      
      await validateTokenAndIdentifyUser(req, res, next);
      await setUserRole(req, res, next);
      await checkEmployee(req, res, next);
      
      expect(req.role).toBe('employee');
      expect(req.employeeId).toBe(456);
      expect(next).toHaveBeenCalledTimes(3);
    });

    test('should handle plan-based access control', async () => {
      req.userId = 123;
      req.restaurantId = 789;
      mockRestaurant.currentPlan = 'professional';
      
      const requireEnterprise = requirePlan('enterprise');
      await requireEnterprise(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'enterprise plan required for this feature',
        currentPlan: 'professional',
        requiredPlan: 'enterprise'
      });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle malformed JWT gracefully', async () => {
      req.headers.authorization = 'Bearer malformed.jwt.token';
      jwt.verify.mockImplementation(() => {
        throw new Error('Unexpected error');
      });
      
      await validateTokenAndIdentifyUser(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Authentication failed'
      });
    });

    test('should handle missing environment variables', async () => {
      req.headers.authorization = 'Bearer valid-token';
      const originalSecret = process.env.JWT_SECRET;
      delete process.env.JWT_SECRET;
      
      jwt.verify.mockImplementation(() => {
        throw new Error('No secret provided');
      });
      
      await validateTokenAndIdentifyUser(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      
      process.env.JWT_SECRET = originalSecret;
    });

    test('should handle concurrent requests safely', async () => {
      req.headers.authorization = 'Bearer valid-token';
      
      // Simulate concurrent requests
      const promises = Array(10).fill().map(() => 
        validateTokenAndIdentifyUser(req, res, next)
      );
      
      await Promise.all(promises);
      
      // Should not cause any crashes or inconsistent state
      expect(next).toHaveBeenCalledTimes(10);
    });
  });
}); 
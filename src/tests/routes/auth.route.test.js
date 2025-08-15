const request = require('supertest');
const express = require('express');

// Set up environment variables for testing
process.env.JWT_SECRET = 'test-secret-key';
process.env.NODE_ENV = 'test';

// Mock the middleware and dependencies that the route actually uses
const mockValidation = {
  validateSignup: jest.fn((req, res, next) => next()),
  validateSignin: jest.fn((req, res, next) => next()),
  validateUserId: jest.fn((req, res, next) => next()),
  validatePasswordReset: jest.fn((req, res, next) => next()),
  validatePasswordResetConfirm: jest.fn((req, res, next) => next()),
};

const mockAuth = {
  checkEmployee: jest.fn((req, res, next) => next()),
  checkCompany: jest.fn((req, res, next) => next()),
  setUserRole: jest.fn((req, res, next) => {
    req.userRole = 'admin';
    next();
  }),
  setUserType: jest.fn((req, res, next) => {
    req.userType = 'empresas';
    next();
  }),
  validateTokenAndIdentifyUser: jest.fn((req, res, next) => next()),
  optionalAuth: jest.fn((req, res, next) => next()),
};

const mockSecurity = {
  recordFailedAttempt: jest.fn(),
  isAccountLocked: jest.fn(),
  resetAccountLockout: jest.fn(),
  isTokenBlacklisted: jest.fn(),
  invalidateToken: jest.fn(),
  generateMFASecret: jest.fn(),
  generateMFAQRCode: jest.fn(),
  verifyMFAToken: jest.fn(),
  enhancedSecurityMiddleware: jest.fn((req, res, next) => next()),
};

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  employee: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  restaurant: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  passwordReset: {
    create: jest.fn(),
    findFirst: jest.fn(),
  },
};

// Mock all the imports
jest.mock('../../middleware/validation.js', () => mockValidation);
jest.mock('../../middleware/auth.js', () => mockAuth);
jest.mock('../../middleware/security.js', () => mockSecurity);
jest.mock('../../db.js', () => ({ prisma: mockPrisma }));
jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashedPassword'),
  compare: jest.fn().mockResolvedValue(true),
}));
jest.mock('jsonwebtoken', () => ({
  sign: jest.fn().mockReturnValue('mock.jwt.token'),
  verify: jest.fn().mockReturnValue({ userId: 1, email: 'test@example.com' }),
}));
jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({
    sendMail: jest.fn().mockResolvedValue({ messageId: 'test-id' })
  }))
}));

// Import the router after mocking
const authRouter = require('../../routes/auth.route.js');

describe('Auth Routes', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api', authRouter); // Mount with /api prefix
  });

  describe('POST /api/signup', () => {
    it('should register user successfully', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        userType: 'empresas',
        createdAt: '2025-08-08T13:56:41.798Z',
        mfaEnabled: false
      };
      const mockToken = 'mock.jwt.token';

      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue(mockUser);

      const userData = {
        email: 'test@example.com',
        password: 'password123',
        passwordConfirmation: 'password123',
        userType: 'empresas',
        name: 'John Doe',
        phoneNumber: '+56912345678'
      };

      const response = await request(app)
        .post('/api/signup')
        .send(userData)
        .expect(201);

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({ 
        where: { email: 'test@example.com' } 
      });
      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: {
          email: 'test@example.com',
          password: 'hashedPassword',
          userType: 'empresas',
          mfaEnabled: false,
          mfaSecret: null,
          accountLocked: false,
          lastLoginAt: null,
          loginAttempts: 0,
          securityNotifications: true
        },
        select: {
          id: true,
          email: true,
          userType: true,
          createdAt: true,
          mfaEnabled: true
        }
      });
      expect(response.body).toEqual({
        success: true,
        message: 'User registered successfully',
        data: {
          user: mockUser,
          token: mockToken,
          securityRecommendation: 'Consider enabling multi-factor authentication for enhanced security'
        }
      });
    });

    it('should return 400 for validation errors', async () => {
      // Mock the validation middleware to return an error
      mockValidation.validateSignup.mockImplementation((req, res, next) => {
        res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: ['Invalid email format', 'Password too short']
        });
      });

      const response = await request(app)
        .post('/api/signup')
        .send({
          email: 'invalid-email',
          password: '123',
          passwordConfirmation: '123',
          userType: 'empresas',
          name: 'John Doe',
          phoneNumber: '+56912345678'
        })
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        message: 'Validation failed',
        errors: ['Invalid email format', 'Password too short']
      });
    });

    it('should return 409 when user already exists', async () => {
      const existingUser = { id: 1, email: 'test@example.com' };
      // Reset validation middleware to pass through
      mockValidation.validateSignup.mockImplementation((req, res, next) => next());
      mockPrisma.user.findUnique.mockResolvedValue(existingUser);

      const response = await request(app)
        .post('/api/signup')
        .send({
          email: 'test@example.com',
          password: 'password123',
          passwordConfirmation: 'password123',
          userType: 'empresas',
          name: 'John Doe',
          phoneNumber: '+56912345678'
        })
        .expect(409);

      expect(response.body).toEqual({
        success: false,
        message: 'User already exists with this email',
        error: 'EMAIL_ALREADY_EXISTS'
      });
    });
  });

  describe('POST /api/signin', () => {
    it('should sign in user successfully', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        name: 'John Doe',
        userType: 'empresas',
        password: 'hashedPassword'
      };
      const mockToken = 'mock.jwt.token';

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const response = await request(app)
        .post('/api/signin')
        .send({
          email: 'test@example.com',
          password: 'password123'
        })
        .expect(200);

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({ 
        where: { email: 'test@example.com' },
        select: {
          id: true,
          email: true,
          password: true,
          userType: true,
          accountLocked: true,
          mfaEnabled: true,
          mfaSecret: true,
          lastLoginAt: true
        }
      });
      expect(response.body).toEqual({
        success: true,
        message: 'Login successful',
        data: {
          user: {
            id: 1,
            email: 'test@example.com',
            userType: 'empresas'
          },
          token: mockToken,
          securityStatus: {
            recommendMFA: true
          }
        }
      });
    });

    it('should return 400 for validation errors', async () => {
      // Mock the validation middleware to return an error
      mockValidation.validateSignin.mockImplementation((req, res, next) => {
        res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: ['Email is required']
        });
      });

      const response = await request(app)
        .post('/api/signin')
        .send({
          email: '',
          password: 'password123'
        })
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        message: 'Validation failed',
        errors: ['Email is required']
      });
    });
  });

  describe('POST /api/logout', () => {
    it('should logout user successfully', async () => {
      // Mock the validateTokenAndIdentifyUser middleware to set req.userId
      mockAuth.validateTokenAndIdentifyUser.mockImplementation((req, res, next) => {
        req.userId = 1;
        next();
      });

      const response = await request(app)
        .post('/api/logout')
        .set('Authorization', 'Bearer mock.token')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'Logged out successfully'
      });
    });
  });

  describe('POST /api/logout-all', () => {
    it('should logout user from all devices successfully', async () => {
      // Mock the validateTokenAndIdentifyUser middleware to set req.userId
      mockAuth.validateTokenAndIdentifyUser.mockImplementation((req, res, next) => {
        req.userId = 1;
        next();
      });

      const response = await request(app)
        .post('/api/logout-all')
        .set('Authorization', 'Bearer mock.token')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'Logged out from all devices successfully'
      });
    });
  });

  describe('POST /api/mfa/setup', () => {
    it('should setup MFA successfully', async () => {
      // Mock the validateTokenAndIdentifyUser middleware to set req.userId
      mockAuth.validateTokenAndIdentifyUser.mockImplementation((req, res, next) => {
        req.userId = 1;
        next();
      });

      mockPrisma.user.findUnique.mockResolvedValue({
        email: 'test@example.com',
        mfaEnabled: false
      });

      mockSecurity.generateMFASecret.mockReturnValue({
        secret: 'test-secret',
        qrCodeUrl: 'test-qr-url',
        backupCodes: ['code1', 'code2']
      });

      const response = await request(app)
        .post('/api/mfa/setup')
        .set('Authorization', 'Bearer mock.token')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'MFA setup initiated',
        data: {
          instructions: 'Scan the QR code with your authenticator app and verify with a token to complete setup',
          backupCodes: ['code1', 'code2']
        }
      });
    });
  });

  describe('POST /api/password-reset-request', () => {
    it('should send password reset email successfully', async () => {
      const existingUser = { id: 1, email: 'test@example.com' };

      mockPrisma.user.findUnique.mockResolvedValue(existingUser);

      const response = await request(app)
        .post('/api/password-reset-request')
        .send({ email: 'test@example.com' })
        .expect(200);

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'test@example.com' } });
      expect(response.body).toEqual({
        success: true,
        message: 'If the email exists, a reset link has been sent',
        data: {}
      });
    });
  });

  describe('GET /api/user/:id', () => {
    it('should return user by ID successfully', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        name: 'John Doe',
        userType: 'empresas'
      };

      // Mock the authentication middleware to pass through
      mockAuth.validateTokenAndIdentifyUser.mockImplementation((req, res, next) => {
        req.userId = 1;
        req.userType = 'admin'; // Set as admin to bypass authorization check
        next();
      });

      // Mock the validateUserId middleware
      mockValidation.validateUserId.mockImplementation((req, res, next) => {
        next();
      });

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const response = await request(app)
        .get('/api/user/1')
        .set('Authorization', 'Bearer mock.token')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'User information retrieved successfully',
        data: { user: mockUser }
      });
    });
  });
}); 
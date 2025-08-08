const request = require('supertest');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const authRouter = require('../../routes/auth.route.js');

// Mock dependencies
jest.mock('bcryptjs');
jest.mock('jsonwebtoken');
jest.mock('../../db.js');
jest.mock('../../middleware/security.js');
jest.mock('../../middleware/validation.js');

const { prisma } = require('../../db.js');
const {
  recordFailedAttempt,
  isAccountLocked,
  resetAccountLockout,
  isTokenBlacklisted,
  invalidateToken,
  generateMFASecret,
  generateMFAQRCode,
  verifyMFAToken
} = require('../../middleware/security.js');

describe('Enhanced Auth Routes', () => {
  let app;
  let mockUser;

  beforeEach(() => {
    jest.clearAllMocks();
    
    app = express();
    app.use(express.json());
    app.use('/', authRouter);

    mockUser = {
      id: 'user-123',
      email: 'test@example.com',
      password: 'hashedPassword123',
      userType: 'empresas',
      mfaEnabled: false,
      mfaSecret: null,
      accountLocked: false,
      lastLoginAt: null,
      createdAt: new Date(),
      mfaBackupCodes: null
    };

    // Default mocks
    bcrypt.hash.mockResolvedValue('hashedPassword123');
    bcrypt.compare.mockResolvedValue(true);
    jwt.sign.mockReturnValue('mock-jwt-token');
    jwt.verify.mockReturnValue({ userId: 'user-123', email: 'test@example.com', userType: 'empresas' });
    
    prisma.user.findUnique.mockResolvedValue(mockUser);
    prisma.user.create.mockResolvedValue(mockUser);
    prisma.user.update.mockResolvedValue(mockUser);
    prisma.passwordReset.create.mockResolvedValue({ id: 'reset-123' });
    prisma.passwordReset.findFirst.mockResolvedValue({ 
      id: 'reset-123', 
      token: 'reset-token', 
      used: false 
    });
    prisma.passwordReset.update.mockResolvedValue({});
    prisma.$transaction.mockImplementation((operations) => Promise.all(operations));

    // Security middleware mocks
    isAccountLocked.mockReturnValue(false);
    recordFailedAttempt.mockReturnValue({ attempts: 1, lockUntil: 0 });
    resetAccountLockout.mockReturnValue(undefined);
    isTokenBlacklisted.mockReturnValue(false);
    invalidateToken.mockReturnValue(undefined);
    
    // MFA mocks
    generateMFASecret.mockReturnValue({
      secret: 'MOCK_SECRET',
      qrCodeUrl: 'otpauth://totp/test@example.com?secret=MOCK_SECRET',
      backupCodes: ['CODE1', 'CODE2', 'CODE3', 'CODE4', 'CODE5', 'CODE6', 'CODE7', 'CODE8']
    });
    generateMFAQRCode.mockResolvedValue('data:image/png;base64,mockqrcode');
    verifyMFAToken.mockReturnValue(true);
  });

  describe('POST /signup', () => {
    test('should register user successfully with security defaults', async () => {
      prisma.user.findUnique.mockResolvedValue(null); // No existing user

      const response = await request(app)
        .post('/signup')
        .send({
          email: 'newuser@example.com',
          password: 'securePassword123',
          userType: 'empresas'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user.email).toBe('test@example.com');
      expect(response.body.data.token).toBeDefined();
      expect(response.body.data.securityRecommendation).toContain('multi-factor authentication');
      
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: 'newuser@example.com',
          password: 'hashedPassword123',
          userType: 'empresas',
          mfaEnabled: false,
          mfaSecret: null,
          accountLocked: false,
          lastLoginAt: null,
          loginAttempts: 0,
          securityNotifications: true
        }),
        select: expect.any(Object)
      });
    });

    test('should reject duplicate email', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser); // Existing user

      const response = await request(app)
        .post('/signup')
        .send({
          email: 'test@example.com',
          password: 'password123',
          userType: 'empresas'
        });

      expect(response.status).toBe(409);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('EMAIL_ALREADY_EXISTS');
    });

    test('should handle Prisma unique constraint error', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const prismaError = new Error('Unique constraint failed');
      prismaError.code = 'P2002';
      prisma.user.create.mockRejectedValue(prismaError);

      const response = await request(app)
        .post('/signup')
        .send({
          email: 'test@example.com',
          password: 'password123',
          userType: 'empresas'
        });

      expect(response.status).toBe(409);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('already exists');
    });
  });

  describe('POST /signin', () => {
    test('should login successfully with standard credentials', async () => {
      const response = await request(app)
        .post('/signin')
        .send({
          email: 'test@example.com',
          password: 'password123'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user.id).toBe('user-123');
      expect(response.body.data.token).toBeDefined();
      expect(response.body.data.securityStatus.mfaEnabled).toBe(false);
      expect(response.body.data.securityStatus.recommendMFA).toBe(true);
      
      expect(resetAccountLockout).toHaveBeenCalledWith('user-123');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: { lastLoginAt: expect.any(Date) }
      });
    });

    test('should require MFA token when MFA is enabled', async () => {
      mockUser.mfaEnabled = true;
      mockUser.mfaSecret = 'SECRET123';
      prisma.user.findUnique.mockResolvedValue(mockUser);

      const response = await request(app)
        .post('/signin')
        .send({
          email: 'test@example.com',
          password: 'password123'
        });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Multi-factor authentication required');
      expect(response.body.requiresMFA).toBe(true);
    });

    test('should login successfully with valid MFA token', async () => {
      mockUser.mfaEnabled = true;
      mockUser.mfaSecret = 'SECRET123';
      prisma.user.findUnique.mockResolvedValue(mockUser);

      const response = await request(app)
        .post('/signin')
        .send({
          email: 'test@example.com',
          password: 'password123',
          mfaToken: '123456'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.securityStatus.mfaEnabled).toBe(true);
      expect(verifyMFAToken).toHaveBeenCalledWith('SECRET123', '123456');
    });

    test('should reject invalid MFA token', async () => {
      mockUser.mfaEnabled = true;
      mockUser.mfaSecret = 'SECRET123';
      prisma.user.findUnique.mockResolvedValue(mockUser);
      verifyMFAToken.mockReturnValue(false);

      const response = await request(app)
        .post('/signin')
        .send({
          email: 'test@example.com',
          password: 'password123',
          mfaToken: 'invalid'
        });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Invalid MFA token');
      expect(recordFailedAttempt).toHaveBeenCalledWith('user-123');
    });

    test('should handle account lockout', async () => {
      isAccountLocked.mockReturnValue({
        locked: true,
        attempts: 5,
        remainingTime: 15
      });

      const response = await request(app)
        .post('/signin')
        .send({
          email: 'test@example.com',
          password: 'password123'
        });

      expect(response.status).toBe(423);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('temporarily locked');
      expect(response.body.data.remainingTime).toBe(15);
      expect(response.body.data.attempts).toBe(5);
    });

    test('should record failed attempt on wrong password', async () => {
      bcrypt.compare.mockResolvedValue(false);
      recordFailedAttempt.mockReturnValue({ attempts: 2, lockUntil: 0 });

      const response = await request(app)
        .post('/signin')
        .send({
          email: 'test@example.com',
          password: 'wrongpassword'
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Invalid credentials');
      expect(response.body.data.attemptsRemaining).toBe(3);
      expect(recordFailedAttempt).toHaveBeenCalledWith('user-123');
    });

    test('should handle user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const response = await request(app)
        .post('/signin')
        .send({
          email: 'nonexistent@example.com',
          password: 'password123'
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Invalid credentials');
    });
  });

  describe('MFA Management Routes', () => {
    beforeEach(() => {
      // Mock authentication middleware
      app.use((req, res, next) => {
        req.userId = 'user-123';
        next();
      });
    });

    describe('POST /mfa/setup', () => {
      test('should setup MFA successfully', async () => {
        const response = await request(app)
          .post('/mfa/setup')
          .set('Authorization', 'Bearer valid-token');

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.qrCode).toBe('data:image/png;base64,mockqrcode');
        expect(response.body.data.backupCodes).toHaveLength(8);
        expect(response.body.data.instructions).toContain('authenticator app');

        expect(generateMFASecret).toHaveBeenCalledWith('test@example.com');
        expect(generateMFAQRCode).toHaveBeenCalled();
        expect(prisma.user.update).toHaveBeenCalledWith({
          where: { id: 'user-123' },
          data: {
            mfaSecret: 'MOCK_SECRET',
            mfaBackupCodes: expect.any(String)
          }
        });
      });

      test('should reject if MFA already enabled', async () => {
        mockUser.mfaEnabled = true;
        prisma.user.findUnique.mockResolvedValue(mockUser);

        const response = await request(app)
          .post('/mfa/setup')
          .set('Authorization', 'Bearer valid-token');

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe('MFA is already enabled for this account');
      });

      test('should handle user not found', async () => {
        prisma.user.findUnique.mockResolvedValue(null);

        const response = await request(app)
          .post('/mfa/setup')
          .set('Authorization', 'Bearer valid-token');

        expect(response.status).toBe(404);
        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe('User not found');
      });
    });

    describe('POST /mfa/verify', () => {
      beforeEach(() => {
        mockUser.mfaSecret = 'SECRET123';
        mockUser.mfaEnabled = false;
        prisma.user.findUnique.mockResolvedValue(mockUser);
      });

      test('should verify and enable MFA successfully', async () => {
        const response = await request(app)
          .post('/mfa/verify')
          .set('Authorization', 'Bearer valid-token')
          .send({ token: '123456' });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.mfaEnabled).toBe(true);
        expect(response.body.data.securityLevel).toBe('Enhanced');

        expect(verifyMFAToken).toHaveBeenCalledWith('SECRET123', '123456');
        expect(prisma.user.update).toHaveBeenCalledWith({
          where: { id: 'user-123' },
          data: { mfaEnabled: true }
        });
      });

      test('should reject invalid MFA token', async () => {
        verifyMFAToken.mockReturnValue(false);

        const response = await request(app)
          .post('/mfa/verify')
          .set('Authorization', 'Bearer valid-token')
          .send({ token: 'invalid' });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe('Invalid MFA token');
      });

      test('should require MFA token', async () => {
        const response = await request(app)
          .post('/mfa/verify')
          .set('Authorization', 'Bearer valid-token')
          .send({});

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe('MFA token is required');
      });

      test('should reject if MFA setup not initiated', async () => {
        mockUser.mfaSecret = null;
        prisma.user.findUnique.mockResolvedValue(mockUser);

        const response = await request(app)
          .post('/mfa/verify')
          .set('Authorization', 'Bearer valid-token')
          .send({ token: '123456' });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe('MFA setup not initiated');
      });
    });

    describe('POST /mfa/disable', () => {
      beforeEach(() => {
        mockUser.mfaEnabled = true;
        mockUser.mfaSecret = 'SECRET123';
        prisma.user.findUnique.mockResolvedValue(mockUser);
      });

      test('should disable MFA successfully', async () => {
        const response = await request(app)
          .post('/mfa/disable')
          .set('Authorization', 'Bearer valid-token')
          .send({
            password: 'password123',
            token: '123456'
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.mfaEnabled).toBe(false);
        expect(response.body.data.securityLevel).toBe('Standard');

        expect(bcrypt.compare).toHaveBeenCalledWith('password123', 'hashedPassword123');
        expect(verifyMFAToken).toHaveBeenCalledWith('SECRET123', '123456');
        expect(prisma.user.update).toHaveBeenCalledWith({
          where: { id: 'user-123' },
          data: {
            mfaEnabled: false,
            mfaSecret: null,
            mfaBackupCodes: null
          }
        });
      });

      test('should require password and MFA token', async () => {
        const response = await request(app)
          .post('/mfa/disable')
          .set('Authorization', 'Bearer valid-token')
          .send({});

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe('Password and MFA token are required');
      });

      test('should reject invalid password', async () => {
        bcrypt.compare.mockResolvedValue(false);

        const response = await request(app)
          .post('/mfa/disable')
          .set('Authorization', 'Bearer valid-token')
          .send({
            password: 'wrongpassword',
            token: '123456'
          });

        expect(response.status).toBe(401);
        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe('Invalid password');
      });

      test('should reject invalid MFA token', async () => {
        verifyMFAToken.mockReturnValue(false);

        const response = await request(app)
          .post('/mfa/disable')
          .set('Authorization', 'Bearer valid-token')
          .send({
            password: 'password123',
            token: 'invalid'
          });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe('Invalid MFA token');
      });

      test('should reject if MFA not enabled', async () => {
        mockUser.mfaEnabled = false;
        prisma.user.findUnique.mockResolvedValue(mockUser);

        const response = await request(app)
          .post('/mfa/disable')
          .set('Authorization', 'Bearer valid-token')
          .send({
            password: 'password123',
            token: '123456'
          });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe('MFA is not enabled');
      });
    });
  });

  describe('Session Management Routes', () => {
    beforeEach(() => {
      // Mock authentication middleware
      app.use((req, res, next) => {
        req.userId = 'user-123';
        req.headers.authorization = 'Bearer test-token';
        next();
      });
    });

    describe('POST /logout', () => {
      test('should logout successfully and blacklist token', async () => {
        const response = await request(app)
          .post('/logout')
          .set('Authorization', 'Bearer test-token');

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.message).toBe('Logged out successfully');
        expect(invalidateToken).toHaveBeenCalledWith('test-token');
      });

      test('should handle logout without token gracefully', async () => {
        const response = await request(app)
          .post('/logout');

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });
    });

    describe('POST /logout-all', () => {
      test('should logout from all devices', async () => {
        const response = await request(app)
          .post('/logout-all')
          .set('Authorization', 'Bearer test-token');

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.message).toBe('Logged out from all devices successfully');
        expect(invalidateToken).toHaveBeenCalledWith('test-token');
      });
    });
  });

  describe('Password Reset Routes', () => {
    describe('POST /password-reset-request', () => {
      test('should handle password reset request successfully', async () => {
        const response = await request(app)
          .post('/password-reset-request')
          .send({ email: 'test@example.com' });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.message).toContain('reset link has been sent');
        
        expect(prisma.passwordReset.create).toHaveBeenCalledWith({
          data: {
            userId: 'user-123',
            token: 'mock-jwt-token',
            expiresAt: expect.any(Date)
          }
        });
      });

      test('should handle password reset for locked account', async () => {
        isAccountLocked.mockReturnValue({
          locked: true,
          attempts: 5,
          remainingTime: 30
        });

        const response = await request(app)
          .post('/password-reset-request')
          .send({ email: 'test@example.com' });

        expect(response.status).toBe(423);
        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe('Account temporarily locked. Please try again later.');
      });

      test('should not reveal if email exists', async () => {
        prisma.user.findUnique.mockResolvedValue(null);

        const response = await request(app)
          .post('/password-reset-request')
          .send({ email: 'nonexistent@example.com' });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.message).toContain('reset link has been sent');
      });
    });

    describe('POST /password-reset-confirm', () => {
      test('should reset password successfully', async () => {
        jwt.verify.mockReturnValue({ userId: 'user-123', type: 'password-reset' });

        const response = await request(app)
          .post('/password-reset-confirm')
          .send({
            token: 'reset-token',
            newPassword: 'newSecurePassword123'
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.message).toBe('Password reset successful');

        expect(bcrypt.hash).toHaveBeenCalledWith('newSecurePassword123', 12);
        expect(resetAccountLockout).toHaveBeenCalledWith('user-123');
        expect(prisma.$transaction).toHaveBeenCalled();
      });

      test('should reject invalid reset token', async () => {
        jwt.verify.mockImplementation(() => {
          throw new Error('Invalid token');
        });

        const response = await request(app)
          .post('/password-reset-confirm')
          .send({
            token: 'invalid-token',
            newPassword: 'newPassword123'
          });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe('Invalid or expired reset token');
      });

      test('should reject expired reset request', async () => {
        jwt.verify.mockReturnValue({ userId: 'user-123', type: 'password-reset' });
        prisma.passwordReset.findFirst.mockResolvedValue(null);

        const response = await request(app)
          .post('/password-reset-confirm')
          .send({
            token: 'expired-token',
            newPassword: 'newPassword123'
          });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe('Invalid or expired reset token');
      });
    });
  });

  describe('User Information Routes', () => {
    beforeEach(() => {
      // Mock authentication middleware
      app.use((req, res, next) => {
        req.userId = 'user-123';
        req.userType = 'empresas';
        next();
      });
    });

    describe('GET /user/:id', () => {
      test('should get own user information successfully', async () => {
        const response = await request(app)
          .get('/user/user-123')
          .set('Authorization', 'Bearer valid-token');

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.user.id).toBe('user-123');
        expect(response.body.data.user.email).toBe('test@example.com');
        expect(response.body.data.user.mfaEnabled).toBe(false);
      });

      test('should reject access to other user data', async () => {
        const response = await request(app)
          .get('/user/other-user-123')
          .set('Authorization', 'Bearer valid-token');

        expect(response.status).toBe(403);
        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe('Access denied');
      });

      test('should allow admin to access any user data', async () => {
        // Mock admin user
        app.use((req, res, next) => {
          req.userId = 'admin-123';
          req.userType = 'admin';
          next();
        });

        const response = await request(app)
          .get('/user/other-user-123')
          .set('Authorization', 'Bearer valid-token');

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });

      test('should handle user not found', async () => {
        prisma.user.findUnique.mockResolvedValue(null);

        const response = await request(app)
          .get('/user/user-123')
          .set('Authorization', 'Bearer valid-token');

        expect(response.status).toBe(404);
        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe('User not found');
      });
    });
  });

  describe('Error Handling', () => {
    test('should handle database connection errors', async () => {
      prisma.user.findUnique.mockRejectedValue(new Error('Database connection failed'));

      const response = await request(app)
        .post('/signin')
        .send({
          email: 'test@example.com',
          password: 'password123'
        });

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Internal Server Error');
    });

    test('should handle JWT signing errors', async () => {
      jwt.sign.mockImplementation(() => {
        throw new Error('JWT signing failed');
      });

      const response = await request(app)
        .post('/signin')
        .send({
          email: 'test@example.com',
          password: 'password123'
        });

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });

    test('should handle bcrypt errors gracefully', async () => {
      bcrypt.compare.mockRejectedValue(new Error('Bcrypt error'));

      const response = await request(app)
        .post('/signin')
        .send({
          email: 'test@example.com',
          password: 'password123'
        });

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });

    test('should handle MFA generation errors', async () => {
      generateMFAQRCode.mockRejectedValue(new Error('QR code generation failed'));

      const response = await request(app)
        .post('/mfa/setup')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Failed to setup MFA');
    });
  });

  describe('Integration Tests', () => {
    test('should handle complete user journey with MFA', async () => {
      // 1. Register user
      prisma.user.findUnique.mockResolvedValue(null);
      const signupResponse = await request(app)
        .post('/signup')
        .send({
          email: 'journey@example.com',
          password: 'securePassword123',
          userType: 'empresas'
        });
      expect(signupResponse.status).toBe(201);

      // 2. Login without MFA
      prisma.user.findUnique.mockResolvedValue(mockUser);
      const loginResponse = await request(app)
        .post('/signin')
        .send({
          email: 'journey@example.com',
          password: 'securePassword123'
        });
      expect(loginResponse.status).toBe(200);

      // 3. Setup MFA
      const mfaSetupResponse = await request(app)
        .post('/mfa/setup')
        .set('Authorization', 'Bearer valid-token');
      expect(mfaSetupResponse.status).toBe(200);

      // 4. Verify and enable MFA
      mockUser.mfaSecret = 'SECRET123';
      const mfaVerifyResponse = await request(app)
        .post('/mfa/verify')
        .set('Authorization', 'Bearer valid-token')
        .send({ token: '123456' });
      expect(mfaVerifyResponse.status).toBe(200);

      // 5. Login with MFA
      mockUser.mfaEnabled = true;
      const mfaLoginResponse = await request(app)
        .post('/signin')
        .send({
          email: 'journey@example.com',
          password: 'securePassword123',
          mfaToken: '123456'
        });
      expect(mfaLoginResponse.status).toBe(200);

      // 6. Logout with token blacklisting
      const logoutResponse = await request(app)
        .post('/logout')
        .set('Authorization', 'Bearer test-token');
      expect(logoutResponse.status).toBe(200);
    });

    test('should handle account lockout and recovery flow', async () => {
      // 1. Multiple failed attempts
      bcrypt.compare.mockResolvedValue(false);
      recordFailedAttempt.mockReturnValue({ attempts: 3, lockUntil: Date.now() + 60000 });

      for (let i = 0; i < 3; i++) {
        await request(app)
          .post('/signin')
          .send({
            email: 'test@example.com',
            password: 'wrongpassword'
          });
      }

      // 2. Account locked
      isAccountLocked.mockReturnValue({
        locked: true,
        attempts: 5,
        remainingTime: 15
      });

      const lockedResponse = await request(app)
        .post('/signin')
        .send({
          email: 'test@example.com',
          password: 'password123'
        });
      expect(lockedResponse.status).toBe(423);

      // 3. Password reset while locked
      const resetResponse = await request(app)
        .post('/password-reset-request')
        .send({ email: 'test@example.com' });
      expect(resetResponse.status).toBe(423);

      // 4. Successful login after lockout reset
      isAccountLocked.mockReturnValue(false);
      bcrypt.compare.mockResolvedValue(true);

      const successResponse = await request(app)
        .post('/signin')
        .send({
          email: 'test@example.com',
          password: 'password123'
        });
      expect(successResponse.status).toBe(200);
      expect(resetAccountLockout).toHaveBeenCalledWith('user-123');
    });
  });
}); 
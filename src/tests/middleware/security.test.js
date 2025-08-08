jest.mock('crypto');
jest.mock('speakeasy');
jest.mock('qrcode');
jest.mock('../../db.js', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
    // add other models as needed
  },
}));
require('crypto').randomBytes = jest.fn().mockReturnValue(Buffer.from('12345678', 'hex'));
const speakeasy = require('speakeasy');
speakeasy.generateSecret = jest.fn().mockReturnValue({
  base32: 'MOCKED_SECRET_BASE32',
  otpauth_url: 'otpauth://totp/test@example.com?secret=MOCKED_SECRET'
});
speakeasy.totp = { verify: jest.fn().mockReturnValue(true) };
const qrcode = require('qrcode');
qrcode.toDataURL = jest.fn().mockResolvedValue('data:image/png;base64,mockqrcode');
const { prisma } = require('../../db.js');

const {
  invalidateToken,
  isTokenBlacklisted,
  recordFailedAttempt,
  isAccountLocked,
  resetAccountLockout,
  detectSQLInjection,
  sqlInjectionDetection,
  generateMFASecret,
  generateMFAQRCode,
  verifyMFAToken,
  requireMFA,
  enhancedSecurityMiddleware,
  getSecurityStats,
  resetSecurityData
} = require('../../middleware/security.js');

// Mock dependencies


describe('Security Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    require('crypto').randomBytes.mockReturnValue(Buffer.from('12345678', 'hex'));
    speakeasy.generateSecret.mockReturnValue({
      base32: 'MOCKED_SECRET_BASE32',
      otpauth_url: 'otpauth://totp/test@example.com?secret=MOCKED_SECRET'
    });
    speakeasy.totp.verify.mockReturnValue(true);
    require('qrcode').toDataURL.mockResolvedValue('data:image/png;base64,mockqrcode');
    prisma.user.findUnique.mockResolvedValue({
      mfaEnabled: false,
      mfaSecret: null
    });
    jest.clearAllMocks();
    req = {
      ip: '192.168.1.100',
      get: jest.fn(() => 'Test User Agent'),
      originalUrl: '/api/test',
      query: {},
      body: {},
      headers: {},
      userId: 'test-user-id'
    };
    res = {
      status: jest.fn(() => res),
      json: jest.fn(() => res),
      setHeader: jest.fn(),
      get: jest.fn()
    };
    next = jest.fn();
    
    // Reset security data before each test
    resetSecurityData('all');
  });

  describe('Token Blacklisting', () => {
    test('should add token to blacklist', () => {
      const token = 'test-token-123';
      
      invalidateToken(token);
      
      expect(isTokenBlacklisted(token)).toBe(true);
    });

    test('should return false for non-blacklisted token', () => {
      const token = 'clean-token-123';
      
      expect(isTokenBlacklisted(token)).toBe(false);
    });

    test('should handle token cleanup', () => {
      const token = 'test-token-123';
      invalidateToken(token);
      
      expect(isTokenBlacklisted(token)).toBe(true);
      
      // Reset and verify cleanup
      resetSecurityData('blacklist');
      expect(isTokenBlacklisted(token)).toBe(false);
    });
  });

  describe('Account Lockout Mechanism', () => {
    const userId = 'test-user-123';

    test('should record failed attempt', () => {
      const result = recordFailedAttempt(userId);
      
      expect(result).toHaveProperty('attempts', 1);
      expect(result).toHaveProperty('lastAttempt');
    });

    test('should increment attempts on multiple failures', () => {
      recordFailedAttempt(userId);
      const result = recordFailedAttempt(userId);
      
      expect(result.attempts).toBe(2);
    });

    test('should lock account after 3 attempts', () => {
      // Record 3 failed attempts
      recordFailedAttempt(userId);
      recordFailedAttempt(userId);
      recordFailedAttempt(userId);
      
      const lockStatus = isAccountLocked(userId);
      expect(lockStatus).toBeTruthy();
      expect(lockStatus.locked).toBe(true);
      expect(lockStatus.attempts).toBe(3);
      expect(lockStatus.remainingTime).toBeGreaterThan(0);
    });

    test('should not lock account before 3 attempts', () => {
      recordFailedAttempt(userId);
      recordFailedAttempt(userId);
      
      const lockStatus = isAccountLocked(userId);
      expect(lockStatus).toBe(false);
    });

    test('should reset account lockout', () => {
      // Lock the account
      recordFailedAttempt(userId);
      recordFailedAttempt(userId);
      recordFailedAttempt(userId);
      
      expect(isAccountLocked(userId)).toBeTruthy();
      
      // Reset lockout
      resetAccountLockout(userId);
      expect(isAccountLocked(userId)).toBe(false);
    });

    test('should reset attempts after 1 hour of inactivity', () => {
      // Mock Date.now to simulate time passage
      const originalNow = Date.now;
      const baseTime = 1000000;
      Date.now = jest.fn(() => baseTime);
      
      recordFailedAttempt(userId);
      expect(recordFailedAttempt(userId).attempts).toBe(2);
      
      // Simulate 2 hours later
      Date.now = jest.fn(() => baseTime + (2 * 60 * 60 * 1000));
      
      const result = recordFailedAttempt(userId);
      expect(result.attempts).toBe(1); // Should reset and then increment to 1
      
      Date.now = originalNow;
    });
  });

  describe('SQL Injection Detection', () => {
    test('should detect SQL injection patterns', () => {
      const maliciousInputs = [
        "'; DROP TABLE users; --",
        "admin' OR '1'='1",
        "UNION SELECT * FROM passwords",
        "1; INSERT INTO users",
        "/* comment */ SELECT",
        "1' AND SLEEP(5) --",
        "true OR 1=1"
      ];

      maliciousInputs.forEach(input => {
        const result = detectSQLInjection(input);
        expect(result).toBeTruthy();
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBeGreaterThan(0);
      });
    });

    test('should not flag safe inputs', () => {
      const safeInputs = [
        "John Doe",
        "user@example.com",
        "password123",
        "This is a normal sentence.",
        "Product name with (parentheses)",
        "Search for something"
      ];

      safeInputs.forEach(input => {
        const result = detectSQLInjection(input);
        expect(result).toBe(false);
      });
    });

    test('should handle non-string inputs', () => {
      const nonStringInputs = [123, null, undefined, {}, [], true];

      nonStringInputs.forEach(input => {
        const result = detectSQLInjection(input);
        expect(result).toBe(false);
      });
    });

    test('should block requests with SQL injection in middleware', () => {
      req.body = { name: "'; DROP TABLE users; --" };
      
      sqlInjectionDetection(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid input detected',
        error: 'Security violation'
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('should allow safe requests through middleware', () => {
      req.body = { name: "John Doe", email: "john@example.com" };
      
      sqlInjectionDetection(req, res, next);
      
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('should check query parameters for SQL injection', () => {
      req.query = { search: "'; DROP TABLE users; --" };
      
      sqlInjectionDetection(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });

    test('should handle nested objects in request body', () => {
      req.body = {
        user: {
          profile: {
            bio: "'; DROP TABLE users; --"
          }
        }
      };
      
      sqlInjectionDetection(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('Multi-Factor Authentication (MFA)', () => {
    beforeEach(() => {
      // Mock crypto.randomBytes
      require('crypto').randomBytes.mockReturnValue(Buffer.from('1234567890ABCDEF', 'hex'));
      
      // Mock speakeasy
      speakeasy.generateSecret.mockReturnValue({
        base32: 'MOCKED_SECRET_BASE32',
        otpauth_url: 'otpauth://totp/test@example.com?secret=MOCKED_SECRET'
      });
      
      speakeasy.totp.verify.mockReturnValue(true);
      
      // Mock qrcode
      require('qrcode').toDataURL.mockResolvedValue('data:image/png;base64,mockqrcode');
    });

    test('should generate MFA secret', () => {
      const userEmail = 'test@example.com';
      const result = generateMFASecret(userEmail);
      
      expect(result).toHaveProperty('secret', 'MOCKED_SECRET_BASE32');
      expect(result).toHaveProperty('qrCodeUrl', 'otpauth://totp/test@example.com?secret=MOCKED_SECRET');
      expect(result).toHaveProperty('backupCodes');
      expect(Array.isArray(result.backupCodes)).toBe(true);
      expect(result.backupCodes).toHaveLength(8);
    });

    test('should generate backup codes', () => {
      // Mock crypto.randomBytes to return 4 bytes (8 hex characters)
      require('crypto').randomBytes.mockReturnValue(Buffer.from('12345678', 'hex'));
      
      const result = generateMFASecret('test@example.com');
      
      expect(result.backupCodes).toHaveLength(8);
      result.backupCodes.forEach(code => {
        expect(typeof code).toBe('string');
        expect(code).toHaveLength(8); // 4 bytes = 8 hex chars
        expect(code).toBe('12345678'); // Should match our mock
      });
    });

    test('should generate QR code', async () => {
      const otpauthUrl = 'otpauth://totp/test@example.com?secret=MOCKED_SECRET';
      
      const result = await generateMFAQRCode(otpauthUrl);
      
      expect(result).toBe('data:image/png;base64,mockqrcode');
      expect(require('qrcode').toDataURL).toHaveBeenCalledWith(otpauthUrl);
    });

    test('should handle QR code generation error', async () => {
      require('qrcode').toDataURL.mockRejectedValue(new Error('QR generation failed'));
      
      await expect(generateMFAQRCode('invalid-url')).rejects.toThrow('Failed to generate QR code');
    });

    test('should verify MFA token', () => {
      const secret = 'MOCKED_SECRET';
      const token = '123456';
      
      const result = verifyMFAToken(secret, token);
      
      expect(result).toBe(true);
      expect(speakeasy.totp.verify).toHaveBeenCalledWith({
        secret: secret,
        encoding: 'base32',
        token: token,
        window: 1
      });
    });

    test('should handle invalid MFA token', () => {
      speakeasy.totp.verify.mockReturnValue(false);
      
      const result = verifyMFAToken('secret', 'invalid');
      
      expect(result).toBe(false);
    });

    describe('requireMFA middleware', () => {
      test('should require authentication', async () => {
        req.userId = null;
        
        await requireMFA(req, res, next);
        
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({
          success: false,
          message: 'Authentication required'
        });
      });

      test('should proceed if MFA not enabled', async () => {
        prisma.user.findUnique.mockResolvedValue({
          mfaEnabled: false,
          mfaSecret: null
        });
        
        await requireMFA(req, res, next);
        
        expect(next).toHaveBeenCalled();
      });

      test('should require MFA token if MFA enabled', async () => {
        prisma.user.findUnique.mockResolvedValue({
          mfaEnabled: true,
          mfaSecret: 'SECRET'
        });
        
        await requireMFA(req, res, next);
        
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({
          success: false,
          message: 'MFA token required',
          requiresMFA: true
        });
      });

      test('should verify MFA token and proceed', async () => {
        req.headers['x-mfa-token'] = '123456';
        prisma.user.findUnique.mockResolvedValue({
          mfaEnabled: true,
          mfaSecret: 'SECRET'
        });
        
        await requireMFA(req, res, next);
        
        expect(next).toHaveBeenCalled();
      });

      test('should reject invalid MFA token', async () => {
        req.headers['x-mfa-token'] = 'invalid';
        prisma.user.findUnique.mockResolvedValue({
          mfaEnabled: true,
          mfaSecret: 'SECRET'
        });
        speakeasy.totp.verify.mockReturnValue(false);
        
        await requireMFA(req, res, next);
        
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({
          success: false,
          message: 'Invalid MFA token'
        });
      });

      test('should handle user not found', async () => {
        prisma.user.findUnique.mockResolvedValue(null);
        
        await requireMFA(req, res, next);
        
        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({
          success: false,
          message: 'User not found'
        });
      });

      test('should handle database errors', async () => {
        prisma.user.findUnique.mockRejectedValue(new Error('Database error'));
        
        await requireMFA(req, res, next);
        
        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
          success: false,
          message: 'MFA verification failed'
        });
      });
    });
  });

  describe('Enhanced Security Middleware', () => {
    test('should add security headers', () => {
      enhancedSecurityMiddleware(req, res, next);
      
      expect(res.setHeader).toHaveBeenCalledWith('X-Security-Enhanced', 'true');
      expect(res.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
      expect(res.setHeader).toHaveBeenCalledWith('X-XSS-Protection', '1; mode=block');
      expect(res.setHeader).toHaveBeenCalledWith('Referrer-Policy', 'strict-origin-when-cross-origin');
    });

    test('should not add headers if already present', () => {
      res.get.mockReturnValue('true');
      
      enhancedSecurityMiddleware(req, res, next);
      
      expect(res.setHeader).not.toHaveBeenCalledWith('X-Security-Enhanced', 'true');
    });

    test('should apply SQL injection detection', () => {
      req.body = { malicious: "'; DROP TABLE users; --" };
      
      enhancedSecurityMiddleware(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('Security Statistics', () => {
    test('should return security stats', () => {
      // Add some test data
      invalidateToken('token1');
      invalidateToken('token2');
      recordFailedAttempt('user1');
      recordFailedAttempt('user2');
      
      const stats = getSecurityStats();
      
      expect(stats).toHaveProperty('tokenBlacklist');
      expect(stats.tokenBlacklist.count).toBe(2);
      expect(stats).toHaveProperty('accountLockouts');
      expect(stats.accountLockouts.count).toBe(2);
      expect(stats).toHaveProperty('sqlInjectionAttempts');
    });

    test('should reset specific security data', () => {
      invalidateToken('token1');
      recordFailedAttempt('user1');
      
      resetSecurityData('blacklist');
      
      const stats = getSecurityStats();
      expect(stats.tokenBlacklist.count).toBe(0);
      expect(stats.accountLockouts.count).toBe(1);
    });

    test('should reset all security data', () => {
      invalidateToken('token1');
      recordFailedAttempt('user1');
      
      resetSecurityData('all');
      
      const stats = getSecurityStats();
      expect(stats.tokenBlacklist.count).toBe(0);
      expect(stats.accountLockouts.count).toBe(0);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle malformed request objects', () => {
      req.body = null;
      req.query = null;
      
      expect(() => sqlInjectionDetection(req, res, next)).not.toThrow();
      expect(next).toHaveBeenCalled();
    });

    test('should handle circular references in objects', () => {
      const circularObj = { name: 'test' };
      circularObj.self = circularObj;
      req.body = circularObj;
      
      expect(() => sqlInjectionDetection(req, res, next)).not.toThrow();
    });

    test('should handle very long inputs', () => {
      const longInput = 'a'.repeat(10000);
      req.body = { field: longInput };
      
      sqlInjectionDetection(req, res, next);
      
      expect(next).toHaveBeenCalled(); // Should not detect as SQL injection
    });

    test('should handle special characters safely', () => {
      const specialChars = '!@#$%^&*()_+-=[]{}|;:,.<>?`~';
      req.body = { field: specialChars };
      
      sqlInjectionDetection(req, res, next);
      
      expect(next).toHaveBeenCalled();
    });

    test('should handle unicode characters', () => {
      const unicode = '测试 مرحبا नमस्ते こんにちは';
      req.body = { field: unicode };
      
      sqlInjectionDetection(req, res, next);
      
      expect(next).toHaveBeenCalled();
    });
  });

  describe('Performance and Scalability', () => {
    test('should handle multiple concurrent lockout attempts', () => {
      const userId = 'concurrent-user';
      
      // Simulate concurrent failed attempts
      for (let i = 0; i < 10; i++) {
        recordFailedAttempt(userId);
      }
      
      const lockStatus = isAccountLocked(userId);
      expect(lockStatus).toBeTruthy();
      expect(lockStatus.attempts).toBe(10);
    });

    test('should handle large number of blacklisted tokens', () => {
      // Add many tokens to blacklist
      for (let i = 0; i < 1000; i++) {
        invalidateToken(`token-${i}`);
      }
      
      const stats = getSecurityStats();
      expect(stats.tokenBlacklist.count).toBe(1000);
      
      // Verify lookup performance is still reasonable
      const start = Date.now();
      expect(isTokenBlacklisted('token-500')).toBe(true);
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(10); // Should be very fast
    });

    test('should handle complex nested objects efficiently', () => {
      const deepObject = {
        level1: {
          level2: {
            level3: {
              level4: {
                level5: "safe value"
              }
            }
          }
        }
      };
      
      req.body = deepObject;
      
      const start = Date.now();
      sqlInjectionDetection(req, res, next);
      const duration = Date.now() - start;
      
      expect(next).toHaveBeenCalled();
      expect(duration).toBeLessThan(50); // Should process quickly
    });
  });
}); 
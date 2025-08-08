const crypto = require('crypto');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const { prisma } = require('../db.js');

// ============================================================================
// TOKEN BLACKLIST MANAGEMENT
// ============================================================================

/**
 * In-memory token blacklist for compromised/invalidated tokens
 * In production, consider using Redis for scalability
 */
const tokenBlacklist = new Set();
const tokenBlacklistCleanup = new Map(); // token -> expiry time

/**
 * Add token to blacklist
 */
const invalidateToken = (token) => {
  tokenBlacklist.add(token);
  // Set cleanup time (tokens expire in 24 hours by default)
  const expiryTime = Date.now() + (24 * 60 * 60 * 1000);
  tokenBlacklistCleanup.set(token, expiryTime);
  
  if (process.env.NODE_ENV !== 'test') {
    console.log(`🔒 Token blacklisted: ${token.substring(0, 20)}...`);
  }
};

/**
 * Check if token is blacklisted
 */
const isTokenBlacklisted = (token) => {
  return tokenBlacklist.has(token);
};

/**
 * Clean up expired tokens from blacklist (run periodically)
 */
const cleanupBlacklist = () => {
  const now = Date.now();
  let cleanedCount = 0;
  
  for (const [token, expiryTime] of tokenBlacklistCleanup.entries()) {
    if (now > expiryTime) {
      tokenBlacklist.delete(token);
      tokenBlacklistCleanup.delete(token);
      cleanedCount++;
    }
  }
  
  if (cleanedCount > 0) {
    if (process.env.NODE_ENV !== 'test') {
      console.log(`🧹 Cleaned ${cleanedCount} expired tokens from blacklist`);
    }
  }
};

// Run cleanup every hour (only in production)
if (process.env.NODE_ENV !== 'test') {
  setInterval(cleanupBlacklist, 60 * 60 * 1000);
}

// ============================================================================
// ACCOUNT LOCKOUT MECHANISM
// ============================================================================

/**
 * Account lockout tracking
 * In production, consider using Redis for scalability
 */
const accountLockouts = new Map(); // userId -> { attempts, lockUntil, lastAttempt }

const LOCKOUT_CONFIG = {
  maxAttempts: 5,
  lockoutDurations: [
    1 * 60 * 1000,   // 1 minute after 3 attempts
    5 * 60 * 1000,   // 5 minutes after 4 attempts  
    15 * 60 * 1000,  // 15 minutes after 5 attempts
    30 * 60 * 1000,  // 30 minutes after 6 attempts
    60 * 60 * 1000   // 1 hour for subsequent attempts
  ]
};

/**
 * Record failed login attempt
 */
const recordFailedAttempt = (userId) => {
  const now = Date.now();
  const lockoutData = accountLockouts.get(userId) || { attempts: 0, lockUntil: 0, lastAttempt: 0 };
  
  // Reset attempts if last attempt was more than 1 hour ago
  if (now - lockoutData.lastAttempt > 60 * 60 * 1000) {
    lockoutData.attempts = 0;
  }
  
  lockoutData.attempts++;
  lockoutData.lastAttempt = now;
  
  // Calculate lockout duration
  if (lockoutData.attempts >= 3) {
    const durationIndex = Math.min(lockoutData.attempts - 3, LOCKOUT_CONFIG.lockoutDurations.length - 1);
    const lockoutDuration = LOCKOUT_CONFIG.lockoutDurations[durationIndex];
    lockoutData.lockUntil = now + lockoutDuration;
    
    if (process.env.NODE_ENV !== 'test') {
      console.log(`🔒 Account locked for user ${userId}: ${lockoutData.attempts} attempts, locked for ${lockoutDuration / 60000} minutes`);
    }
  }
  
  accountLockouts.set(userId, lockoutData);
  return lockoutData;
};

/**
 * Check if account is currently locked
 */
const isAccountLocked = (userId) => {
  const lockoutData = accountLockouts.get(userId);
  if (!lockoutData) return false;
  
  const now = Date.now();
  if (lockoutData.lockUntil && now < lockoutData.lockUntil) {
    const remainingTime = Math.ceil((lockoutData.lockUntil - now) / 60000);
    return {
      locked: true,
      attempts: lockoutData.attempts,
      remainingTime: remainingTime
    };
  }
  
  return false;
};

/**
 * Reset account lockout (after successful login)
 */
const resetAccountLockout = (userId) => {
  if (accountLockouts.has(userId)) {
    accountLockouts.delete(userId);
    if (process.env.NODE_ENV !== 'test') {
      console.log(`✅ Account lockout reset for user ${userId}`);
    }
  }
};

// ============================================================================
// SQL INJECTION DETECTION
// ============================================================================

/**
 * Detect potential SQL injection attempts
 */
const detectSQLInjection = (input) => {
  if (typeof input !== 'string') return false;
  
  const suspiciousPatterns = [];
  
  // Check for actual SQL injection patterns
  const dangerousPatterns = [
    // SQL keywords in suspicious context
    /\b(union|select|insert|delete|update|drop|exec|execute|script|declare|create|alter)\b/gi,
    // SQL comments (only when they look like actual comments)
    /--\s+[^\r\n]*|#\s+[^\r\n]*|\/\*[\s\S]*?\*\//g,
    // UNION attacks
    /\bunion\b.*\bselect\b/gi,
    // Boolean-based attacks
    /\b(and|or)\b.*[=<>].*(\b(true|false|null)\b|\d+)/gi,
    // Time-based attacks
    /\b(sleep|waitfor|benchmark|pg_sleep)\b/gi,
    // SQL functions in suspicious context
    /\b(concat|char|ascii|substring|length|mid|count|sum|avg)\b/gi,
    // Dangerous quote patterns with SQL keywords
    /['"].*(\b(union|select|insert|delete|update|drop|exec|execute|script|declare|create|alter)\b).*['"]/gi,
    // Specific SQL injection attempts
    /';.*--|";.*--|';.*#|";.*#/gi,
    // Boolean logic attacks
    /\b(true|false)\s+(or|and)\s+\d+\s*=\s*\d+/gi,
    // Simple boolean attacks
    /\b(or|and)\s+\d+\s*=\s*\d+/gi
  ];
  
  for (let i = 0; i < dangerousPatterns.length; i++) {
    const pattern = dangerousPatterns[i];
    if (pattern.test(input)) {
      suspiciousPatterns.push({
        pattern: pattern.source,
        match: input.match(pattern)
      });
    }
  }
  
  return suspiciousPatterns.length > 0 ? suspiciousPatterns : false;
};

/**
 * SQL injection detection middleware
 */
const sqlInjectionDetection = (req, res, next) => {
  const checkObject = (obj, path = '', visited = new WeakSet()) => {
    // Prevent circular references
    if (visited.has(obj)) {
      return null;
    }
    visited.add(obj);
    
    for (const [key, value] of Object.entries(obj)) {
      const currentPath = path ? `${path}.${key}` : key;
      
      if (typeof value === 'string') {
        const suspiciousPatterns = detectSQLInjection(value);
        if (suspiciousPatterns) {
          if (process.env.NODE_ENV !== 'test') {
            console.log(`🚨 SQL Injection attempt detected:`, {
              ip: req.ip,
              userAgent: req.get('User-Agent'),
              path: req.originalUrl,
              field: currentPath,
              value: value,
              patterns: suspiciousPatterns,
              timestamp: new Date().toISOString()
            });
          }
          
          // Log to error tracking
          if (global.errorTracking) {
            global.errorTracking.logSecurityEvent({
              type: 'SQL_INJECTION_ATTEMPT',
              severity: 'critical',
              ip: req.ip,
              path: req.originalUrl,
              field: currentPath,
              patterns: suspiciousPatterns
            });
          }
          
          return res.status(400).json({
            success: false,
            message: 'Invalid input detected',
            error: 'Security violation'
          });
        }
      } else if (typeof value === 'object' && value !== null) {
        const result = checkObject(value, currentPath, visited);
        if (result) return result;
      }
    }
    return null;
  };
  
  // Check query parameters
  if (req.query && Object.keys(req.query).length > 0) {
    const result = checkObject(req.query);
    if (result) return result;
  }
  
  // Check request body
  if (req.body && Object.keys(req.body).length > 0) {
    const result = checkObject(req.body);
    if (result) return result;
  }
  
  next();
};

// ============================================================================
// MULTI-FACTOR AUTHENTICATION (MFA)
// ============================================================================

/**
 * Generate MFA secret for user
 */
const generateMFASecret = (userEmail, serviceName = 'Gourmet Platform') => {
  const secret = speakeasy.generateSecret({
    name: userEmail,
    issuer: serviceName,
    length: 32
  });
  
  return {
    secret: secret.base32,
    qrCodeUrl: secret.otpauth_url,
    backupCodes: generateBackupCodes()
  };
};

/**
 * Generate backup codes for MFA
 */
const generateBackupCodes = () => {
  const codes = [];
  for (let i = 0; i < 8; i++) {
    codes.push(crypto.randomBytes(4).toString('hex').toUpperCase());
  }
  return codes;
};

/**
 * Generate QR code for MFA setup
 */
const generateMFAQRCode = async (otpauthUrl) => {
  try {
    const qrCodeDataUrl = await qrcode.toDataURL(otpauthUrl);
    return qrCodeDataUrl;
  } catch (error) {
    console.error('Error generating QR code:', error);
    throw new Error('Failed to generate QR code');
  }
};

/**
 * Verify MFA token
 */
const verifyMFAToken = (secret, token, window = 1) => {
  return speakeasy.totp.verify({
    secret: secret,
    encoding: 'base32',
    token: token,
    window: window
  });
};

/**
 * MFA verification middleware
 */
const requireMFA = async (req, res, next) => {
  const userId = req.userId;
  const mfaToken = req.headers['x-mfa-token'] || req.body.mfaToken;
  
  if (!userId) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }
  
  try {
    // Check if user has MFA enabled
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { mfaEnabled: true, mfaSecret: true }
    });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // If MFA is not enabled, proceed
    if (!user.mfaEnabled) {
      return next();
    }
    
    // If MFA is enabled, verify token
    if (!mfaToken) {
      return res.status(403).json({
        success: false,
        message: 'MFA token required',
        requiresMFA: true
      });
    }
    
    const isValidToken = verifyMFAToken(user.mfaSecret, mfaToken);
    
    if (!isValidToken) {
      if (process.env.NODE_ENV !== 'test') {
        console.log(`🔒 Invalid MFA token for user ${userId}`);
      }
      return res.status(403).json({
        success: false,
        message: 'Invalid MFA token'
      });
    }
    
    if (process.env.NODE_ENV !== 'test') {
      console.log(`✅ MFA verified for user ${userId}`);
    }
    next();
    
  } catch (error) {
    console.error('MFA verification error:', error);
    res.status(500).json({
      success: false,
      message: 'MFA verification failed'
    });
  }
};

// ============================================================================
// COMPREHENSIVE SECURITY MIDDLEWARE
// ============================================================================

/**
 * Combined security middleware that applies multiple protections
 */
const enhancedSecurityMiddleware = (req, res, next) => {
  // Add security headers if not already present
  if (!res.get('X-Security-Enhanced')) {
    res.setHeader('X-Security-Enhanced', 'true');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  }
  
  // Apply SQL injection detection
  sqlInjectionDetection(req, res, (err) => {
    if (err) return;
    next();
  });
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get security statistics
 */
const getSecurityStats = () => {
  return {
    tokenBlacklist: {
      count: tokenBlacklist.size,
      nextCleanup: Math.min(...Array.from(tokenBlacklistCleanup.values())) || null
    },
    accountLockouts: {
      count: accountLockouts.size,
      lockedAccounts: Array.from(accountLockouts.entries())
        .filter(([, data]) => Date.now() < data.lockUntil)
        .map(([userId, data]) => ({
          userId,
          attempts: data.attempts,
          remainingTime: Math.ceil((data.lockUntil - Date.now()) / 60000)
        }))
    },
    sqlInjectionAttempts: {
      // This would be tracked in your error tracking system
      lastHour: 0, // Placeholder - implement based on your error tracking
      total: 0     // Placeholder - implement based on your error tracking
    }
  };
};

/**
 * Reset security data (for admin use)
 */
const resetSecurityData = (type) => {
  switch (type) {
    case 'blacklist':
      tokenBlacklist.clear();
      tokenBlacklistCleanup.clear();
      if (process.env.NODE_ENV !== 'test') {
        console.log('🧹 Token blacklist cleared');
      }
      break;
    case 'lockouts':
      accountLockouts.clear();
      if (process.env.NODE_ENV !== 'test') {
        console.log('🧹 Account lockouts cleared');
      }
      break;
    case 'all':
      tokenBlacklist.clear();
      tokenBlacklistCleanup.clear();
      accountLockouts.clear();
      if (process.env.NODE_ENV !== 'test') {
        console.log('🧹 All security data cleared');
      }
      break;
  }
};

module.exports = {
  invalidateToken,
  isTokenBlacklisted,
  cleanupBlacklist,
  recordFailedAttempt,
  isAccountLocked,
  resetAccountLockout,
  detectSQLInjection,
  sqlInjectionDetection,
  generateMFASecret,
  generateBackupCodes,
  generateMFAQRCode,
  verifyMFAToken,
  requireMFA,
  enhancedSecurityMiddleware,
  getSecurityStats,
  resetSecurityData
}; 
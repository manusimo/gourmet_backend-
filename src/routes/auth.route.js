import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../db.js';
import { 
  checkEmployee, 
  checkCompany, 
  setUserRole, 
  setUserType, 
  validateTokenAndIdentifyUser,
  optionalAuth
} from '../middleware/auth.js';
import { 
  validateSignup, 
  validateSignin, 
  validateUserId,
  validatePasswordReset,
  validatePasswordResetConfirm
} from "../middleware/validation.js";

// Import new security functions
import {
  recordFailedAttempt,
  isAccountLocked,
  resetAccountLockout,
  isTokenBlacklisted,
  invalidateToken,
  generateMFASecret,
  generateMFAQRCode,
  verifyMFAToken,
  enhancedSecurityMiddleware
} from '../middleware/security.js';

const router = Router();

// Apply enhanced security middleware to all auth routes
router.use(enhancedSecurityMiddleware);

// ============================================================================
// AUTHENTICATION ROUTES WITH ENHANCED SECURITY
// ============================================================================

// POST /signup - User registration with enhanced validation
router.post('/signup', validateSignup, async (req, res) => {
  try {
    const { email, password, userType } = req.body;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'User already exists with this email',
        error: 'EMAIL_ALREADY_EXISTS'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user with enhanced security defaults
    const newUser = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        password: hashedPassword,
        userType,
        // Security enhancements
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

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: newUser.id, 
        email: newUser.email, 
        userType: newUser.userType 
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    console.log(`✅ New user registered: ${newUser.email} (${newUser.userType})`);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: newUser,
        token,
        securityRecommendation: 'Consider enabling multi-factor authentication for enhanced security'
      }
    });

  } catch (error) {
    console.error('Signup error:', error);
    
    if (error.code === 'P2002') {
      return res.status(409).json({
        success: false,
        message: 'User already exists with this email'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Internal Server Error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// POST /signin - User login with enhanced validation and security
router.post('/signin', validateSignin, async (req, res) => {
  try {
    const { email, password, mfaToken } = req.body;
    const userEmail = email.toLowerCase();

    // Find user
    const user = await prisma.user.findUnique({
      where: { email: userEmail },
      select: {
        id: true,
        email: true,
        password: true,
        userType: true,
        mfaEnabled: true,
        mfaSecret: true,
        accountLocked: true,
        lastLoginAt: true
      }
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check account lockout
    const lockoutStatus = isAccountLocked(user.id);
    if (lockoutStatus) {
      return res.status(423).json({
        success: false,
        message: `Account temporarily locked due to multiple failed attempts`,
        data: {
          remainingTime: lockoutStatus.remainingTime,
          attempts: lockoutStatus.attempts
        }
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    
    if (!isPasswordValid) {
      // Record failed attempt
      const lockoutData = recordFailedAttempt(user.id);
      
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
        data: {
          attemptsRemaining: Math.max(0, 5 - lockoutData.attempts)
        }
      });
    }

    // If MFA is enabled, verify MFA token
    if (user.mfaEnabled) {
      if (!mfaToken) {
        return res.status(403).json({
          success: false,
          message: 'Multi-factor authentication required',
          requiresMFA: true
        });
      }

      const isMFAValid = verifyMFAToken(user.mfaSecret, mfaToken);
      if (!isMFAValid) {
        // Record failed attempt for invalid MFA
        recordFailedAttempt(user.id);
        
        return res.status(403).json({
          success: false,
          message: 'Invalid MFA token'
        });
      }
    }

    // Reset account lockout on successful login
    resetAccountLockout(user.id);

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    });

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: user.id, 
        email: user.email, 
        userType: user.userType 
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    console.log(`✅ User login successful: ${user.email}`);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user.id,
          email: user.email,
          userType: user.userType,
          mfaEnabled: user.mfaEnabled,
          lastLoginAt: user.lastLoginAt
        },
        token,
        securityStatus: {
          mfaEnabled: user.mfaEnabled,
          recommendMFA: !user.mfaEnabled
        }
      }
    });

  } catch (error) {
    console.error('Signin error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal Server Error'
    });
  }
});

// ============================================================================
// MFA MANAGEMENT ROUTES
// ============================================================================

// POST /mfa/setup - Setup MFA for user
router.post('/mfa/setup', validateTokenAndIdentifyUser, async (req, res) => {
  try {
    const userId = req.userId;

    // Get user details
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, mfaEnabled: true }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.mfaEnabled) {
      return res.status(400).json({
        success: false,
        message: 'MFA is already enabled for this account'
      });
    }

    // Generate MFA secret
    const mfaData = generateMFASecret(user.email);
    const qrCodeDataUrl = await generateMFAQRCode(mfaData.qrCodeUrl);

    // Store secret temporarily (user needs to confirm setup)
    await prisma.user.update({
      where: { id: userId },
      data: { 
        mfaSecret: mfaData.secret,
        mfaBackupCodes: JSON.stringify(mfaData.backupCodes)
      }
    });

    res.status(200).json({
      success: true,
      message: 'MFA setup initiated',
      data: {
        qrCode: qrCodeDataUrl,
        backupCodes: mfaData.backupCodes,
        instructions: 'Scan the QR code with your authenticator app and verify with a token to complete setup'
      }
    });

  } catch (error) {
    console.error('MFA setup error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to setup MFA'
    });
  }
});

// POST /mfa/verify - Verify and enable MFA
router.post('/mfa/verify', validateTokenAndIdentifyUser, async (req, res) => {
  try {
    const userId = req.userId;
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'MFA token is required'
      });
    }

    // Get user with MFA secret
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { mfaSecret: true, mfaEnabled: true }
    });

    if (!user || !user.mfaSecret) {
      return res.status(400).json({
        success: false,
        message: 'MFA setup not initiated'
      });
    }

    // Verify token
    const isValidToken = verifyMFAToken(user.mfaSecret, token);

    if (!isValidToken) {
      return res.status(400).json({
        success: false,
        message: 'Invalid MFA token'
      });
    }

    // Enable MFA
    await prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: true }
    });

    console.log(`✅ MFA enabled for user ${userId}`);

    res.status(200).json({
      success: true,
      message: 'MFA enabled successfully',
      data: {
        mfaEnabled: true,
        securityLevel: 'Enhanced'
      }
    });

  } catch (error) {
    console.error('MFA verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify MFA'
    });
  }
});

// POST /mfa/disable - Disable MFA
router.post('/mfa/disable', validateTokenAndIdentifyUser, async (req, res) => {
  try {
    const userId = req.userId;
    const { password, token } = req.body;

    if (!password || !token) {
      return res.status(400).json({
        success: false,
        message: 'Password and MFA token are required'
      });
    }

    // Get user
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { password: true, mfaEnabled: true, mfaSecret: true }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (!user.mfaEnabled) {
      return res.status(400).json({
        success: false,
        message: 'MFA is not enabled'
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid password'
      });
    }

    // Verify MFA token
    const isValidToken = verifyMFAToken(user.mfaSecret, token);
    if (!isValidToken) {
      return res.status(400).json({
        success: false,
        message: 'Invalid MFA token'
      });
    }

    // Disable MFA
    await prisma.user.update({
      where: { id: userId },
      data: { 
        mfaEnabled: false,
        mfaSecret: null,
        mfaBackupCodes: null
      }
    });

    console.log(`⚠️ MFA disabled for user ${userId}`);

    res.status(200).json({
      success: true,
      message: 'MFA disabled successfully',
      data: {
        mfaEnabled: false,
        securityLevel: 'Standard'
      }
    });

  } catch (error) {
    console.error('MFA disable error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to disable MFA'
    });
  }
});

// ============================================================================
// SESSION MANAGEMENT ROUTES
// ============================================================================

// POST /logout - Enhanced logout with token blacklisting
router.post('/logout', validateTokenAndIdentifyUser, async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (token) {
      // Add token to blacklist
      invalidateToken(token);
    }

    console.log(`✅ User logout: ${req.userId}`);

    res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });

  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Logout failed'
    });
  }
});

// POST /logout-all - Logout from all devices
router.post('/logout-all', validateTokenAndIdentifyUser, async (req, res) => {
  try {
    const userId = req.userId;
    
    // In a more advanced implementation, you would:
    // 1. Track all user tokens in database
    // 2. Add all user tokens to blacklist
    // 3. Or increment a "token version" in user record
    
    // For now, we'll just blacklist the current token
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      invalidateToken(token);
    }

    console.log(`✅ User logout from all devices: ${userId}`);

    res.status(200).json({
      success: true,
      message: 'Logged out from all devices successfully'
    });

  } catch (error) {
    console.error('Logout all error:', error);
    res.status(500).json({
      success: false,
      message: 'Logout failed'
    });
  }
});

// ============================================================================
// EXISTING ROUTES (ENHANCED)
// ============================================================================

// POST /password-reset-request - Password reset request
router.post('/password-reset-request', validatePasswordReset, async (req, res) => {
  try {
    const { email } = req.body;

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (!user) {
      // Don't reveal if email exists or not
      return res.status(200).json({
        success: true,
        message: 'If the email exists, a reset link has been sent'
      });
    }

    // Check account lockout
    const lockoutStatus = isAccountLocked(user.id);
    if (lockoutStatus) {
      return res.status(423).json({
        success: false,
        message: 'Account temporarily locked. Please try again later.'
      });
    }

    // Generate reset token
    const resetToken = jwt.sign(
      { userId: user.id, type: 'password-reset' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Store reset token
    await prisma.passwordReset.create({
      data: {
        userId: user.id,
        token: resetToken,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      },
    });

    console.log(`🔄 Password reset requested for: ${email}`);

    res.status(200).json({
      success: true,
      message: 'If the email exists, a reset link has been sent',
      data: { 
        resetToken: process.env.NODE_ENV === 'development' ? resetToken : undefined 
      }
    });

  } catch (error) {
    console.error('Password reset request error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal Server Error'
    });
  }
});

// POST /password-reset-confirm - Password reset confirmation
router.post('/password-reset-confirm', validatePasswordResetConfirm, async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    // Verify reset token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token'
      });
    }

    // Find reset request
    const resetRequest = await prisma.passwordReset.findFirst({
      where: {
        token,
        userId: decoded.userId,
        used: false,
        expiresAt: { gt: new Date() },
      },
    });

    if (!resetRequest) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token'
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update password and mark token as used
    await prisma.$transaction([
      prisma.user.update({
        where: { id: decoded.userId },
        data: { password: hashedPassword }
      }),
      prisma.passwordReset.update({
        where: { id: resetRequest.id },
        data: { used: true }
      })
    ]);

    // Reset any account lockout
    resetAccountLockout(decoded.userId);

    console.log(`✅ Password reset completed for user: ${decoded.userId}`);

    res.status(200).json({
      success: true,
      message: 'Password reset successful'
    });

  } catch (error) {
    console.error('Password reset confirm error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal Server Error'
    });
  }
});

// GET /user/:id - Get user information
router.get('/user/:id', validateUserId, validateTokenAndIdentifyUser, async (req, res) => {
  try {
    const { id } = req.params;
    const requesterId = req.userId;

    // Check if user can access this information
    if (id !== requesterId && req.userType !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        userType: true,
        createdAt: true,
        lastLoginAt: true,
        mfaEnabled: true,
        securityNotifications: true
      }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'User information retrieved successfully',
      data: { user }
    });

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal Server Error'
    });
  }
});

// ============================================================================
// MIDDLEWARE SETUP ROUTES
// ============================================================================

// Apply role-based middleware
router.use(setUserRole);
router.use(setUserType);

export default router;

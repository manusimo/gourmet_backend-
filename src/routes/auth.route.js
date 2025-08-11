const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { prisma } = require('../db.js');
const {
  checkEmployee,
  checkCompany,
  setUserRole,
  setUserType,
  validateTokenAndIdentifyUser,
  optionalAuth
} = require('../middleware/auth.js');
const {
  validateSignup,
  validateSignin,
  validateUserId,
  validatePasswordReset,
  validatePasswordResetConfirm
} = require('../middleware/validation.js');
const {
  recordFailedAttempt,
  isAccountLocked,
  resetAccountLockout,
  isTokenBlacklisted,
  invalidateToken,
  generateMFASecret,
  generateMFAQRCode,
  verifyMFAToken,
  enhancedSecurityMiddleware
} = require('../middleware/security.js');

const router = express.Router();

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

    // Automatically assign role based on userType
    let role = 'admin'; // default role
    

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user with enhanced security defaults
    const newUser = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        password: hashedPassword,
        userType,
        role, // Use automatically assigned role
        // Security enhancements
        name: req.body.name || "Juanito",
        surname: req.body.surname || "Pérez",
        phoneNumber: req.body.phoneNumber || "+56976212644",
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
        role: true,
        name: true,
        surname: true,
        createdAt: true,
        mfaEnabled: false
      }
    });

    // Generate JWT token
    const token = jwt.sign(
      {
        userId: newUser.id,
        email: newUser.email,
        userType: newUser.userType,
        role: newUser.role,
        restaurantId: restaurantId // Include restaurantId if user has one
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    console.log(`✅ New user registered: ${newUser.email} (${newUser.userType}) with role: ${newUser.role}`);

    // Check if user has a restaurant (for company users)
    let restaurantId = null;
    if (newUser.userType === 'empresas') {
      const restaurant = await prisma.restaurant.findUnique({
        where: { userId: newUser.id },
        select: { id: true }
      });
      if (restaurant) {
        restaurantId = restaurant.id;
        console.log(`🏢 Found restaurant for new user ${newUser.email}:`, restaurantId);
      } else {
        console.log(`🏢 No restaurant found for new user ${newUser.email}`);
      }
    }

    // Set authentication cookie
    res.cookie('manu', token, {
      httpOnly: false, // Allow JavaScript access for development
      secure: false, // Allow over HTTP for development
      sameSite: 'lax',
      path: '/',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });

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
        name: true,
        surname: true,
        phoneNumber: true,
        mfaEnabled: false,
        mfaSecret: true,
        accountLocked: true,
        lastLoginAt: true,
        role: true
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

    // Check if user has a restaurant (for company users)
    let restaurantId = null;
    if (user.userType === 'empresas') {
      const restaurant = await prisma.restaurant.findUnique({
        where: { userId: user.id },
        select: { id: true }
      });
      if (restaurant) {
        restaurantId = restaurant.id;
        console.log(`🏢 Found restaurant for user ${user.email}:`, restaurantId);
      } else {
        console.log(`🏢 No restaurant found for user ${user.email}`);
      }
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        userType: user.userType,
        role: user.role,
        restaurantId: restaurantId // Include restaurantId if user has one
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    console.log(`✅ User login successful: ${user.email}`);

    // Set authentication cookie
    res.cookie('manu', token, {
      httpOnly: false, // Allow JavaScript access for development
      secure: false, // Allow over HTTP for development
      sameSite: 'lax',
      path: '/',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });

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
      select: { email: true, mfaEnabled: false }
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
      select: { mfaSecret: true, mfaEnabled: false }
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
      data: { mfaEnabled: false }
    });

    console.log(`✅ MFA enabled for user ${userId}`);

    res.status(200).json({
      success: true,
      message: 'MFA enabled successfully',
      data: {
        mfaEnabled: false,
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
      select: { password: true, mfaEnabled: false, mfaSecret: true }
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
router.post('/logout', async (req, res) => {
  try {
    console.log('🚪 Logout request received');
    
    // Get token from cookie instead of Authorization header
    const token = req.cookies.manu;
    
    if (token) {
      try {
        // Verify and decode token to get userId
        const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
        console.log(`✅ User logout: ${decodedToken.userId}`);
        
        // Add token to blacklist
        invalidateToken(token);
      } catch (tokenError) {
        console.log('⚠️ Invalid token during logout, but continuing logout process');
      }
    }

    // Clear the cookie
    res.clearCookie('manu', {
      path: '/',
      sameSite: 'lax'
    });

    console.log('✅ Logout successful, cookie cleared');

    res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });

  } catch (error) {
    console.error('Logout error:', error);
    
    // Even if there's an error, clear the cookie and return success
    res.clearCookie('manu', {
      path: '/',
      sameSite: 'lax'
    });
    
    res.status(200).json({
      success: true,
      message: 'Logged out successfully'
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
        mfaEnabled: false,
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

// GET /check-login-status - Check if user is logged in
router.get('/check-login-status', async (req, res) => {
  try {
    console.log('🔍 check-login-status: Request received');
    console.log('🔍 check-login-status: Available cookies:', req.cookies);
    console.log('🔍 check-login-status: manu cookie:', req.cookies?.manu);
    
    // Check for cookie-based authentication
    const token = req.cookies.manu;
    
    if (!token) {
      console.log('❌ check-login-status: No token found in cookies');
      return res.json({
        success: true,
        isLoggedIn: false,
        user: null
      });
    }

    console.log('🔍 check-login-status: Token found, verifying...');
    try {
      const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
      console.log('✅ check-login-status: Token verified, decoded:', decodedToken);
      
      // Fetch user data
      const user = await prisma.user.findUnique({
        where: { id: decodedToken.userId },
        select: {
          id: true,
          email: true,
          userType: true,
          role: true,
          name: true,
          surname: true
        }
      });

      console.log('🔍 check-login-status: User found:', user);

      if (user) {
        console.log('✅ check-login-status: User authenticated successfully');
        return res.json({
          success: true,
          isLoggedIn: true,
          user: {
            ...user,
            userId: user.id
          }
        });
      } else {
        console.log('❌ check-login-status: User not found in database');
        return res.json({
          success: true,
          isLoggedIn: false,
          user: null
        });
      }
    } catch (tokenError) {
      console.log('❌ check-login-status: Token verification failed:', tokenError.message);
      // Invalid token
      return res.json({
        success: true,
        isLoggedIn: false,
        user: null
      });
    }
  } catch (error) {
    console.error('Error checking login status:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// ============================================================================
// MIDDLEWARE SETUP ROUTES
// ============================================================================

// Apply role-based middleware
router.use(setUserRole);
router.use(setUserType);

module.exports = router;

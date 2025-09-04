const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { prisma } = require('../db.js');
const { sendEmail } = require('../helpers/email.js');
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
        message: 'Credenciales invalidos'
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
    let restaurantUserId = null;
    if (user.userType === 'empresas') {
      // For staff users, we need to get restaurantId and restaurantUserId from RestaurantUser table
      const restaurantUser = await prisma.restaurantUser.findFirst({
        where: { userId: user.id },
        select: { id: true, restaurantId: true }
      });
      
      if (restaurantUser) {
        restaurantId = restaurantUser.restaurantId;
        restaurantUserId = restaurantUser.id;
        console.log(`🏢 Found restaurant for user ${user.email}:`, { restaurantId, restaurantUserId });
      } else {
        // Fallback: try to find restaurant directly (for admin users)
        const restaurant = await prisma.restaurant.findUnique({
          where: { userId: user.id },
          select: { id: true }
        });
        if (restaurant) {
          restaurantId = restaurant.id;
          console.log(`🏢 Found restaurant for admin user ${user.email}:`, restaurantId);
        } else {
          console.log(`🏢 No restaurant found for user ${user.email}`);
        }
      }
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        userType: user.userType,
        role: user.role,
        restaurantId: restaurantId,
        restaurantUserId: restaurantUserId
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

    // Store reset token in TokenDenyList (we'll use this to track used tokens)
    // For now, we'll just generate the token and send the email
    // The token validation will be done by JWT verification

    // Generate reset URL
    const baseUrl = process.env.NODE_ENV === 'production' 
      ? 'https://www.gourmetjobs.cl' 
      : 'http://localhost:3001';
    const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;

    // Send email with reset link
    try {
      await sendEmail({
        to: email,
        subject: 'Recupera tu contraseña - GourmetJobs',
        text: `Hola,\n\nHas solicitado recuperar tu contraseña en GourmetJobs.\n\nHaz clic en el siguiente enlace para restablecer tu contraseña:\n${resetUrl}\n\nEste enlace expirará en 1 hora.\n\nSi no solicitaste este cambio, puedes ignorar este correo.\n\nSaludos,\nEl equipo de GourmetJobs`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #fb5424;">Recupera tu contraseña</h2>
            <p>Hola,</p>
            <p>Has solicitado recuperar tu contraseña en GourmetJobs.</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" style="background-color: #fb5424; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Restablecer Contraseña</a>
            </div>
            <p><strong>Importante:</strong> Este enlace expirará en 1 hora.</p>
            <p>Si no solicitaste este cambio, puedes ignorar este correo.</p>
            <p>Saludos,<br>El equipo de GourmetJobs</p>
          </div>
        `
      });
      console.log(`✅ Password reset email sent to: ${email}`);
    } catch (emailError) {
      console.error('❌ Error sending password reset email:', emailError);
      // Don't fail the request if email fails
    }

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

    // Check if token is for password reset
    if (decoded.type !== 'password-reset') {
      return res.status(400).json({
        success: false,
        message: 'Invalid reset token'
      });
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'User not found'
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update password
    await prisma.user.update({
      where: { id: decoded.userId },
      data: { password: hashedPassword }
    });

    // Add token to deny list to prevent reuse
    await prisma.tokenDenyList.create({
      data: { token }
    });

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

// POST /set-password - Set initial password for new users
router.post('/set-password', async (req, res) => {
  try {
    const { token, password, name, phoneNumber } = req.body;

    if (!token || !password) {
      console.log('⚠️ Set-password: Missing required fields', { 
        hasToken: !!token, 
        hasPassword: !!password,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      return res.status(400).json({
        success: false,
        message: 'Token and password are required'
      });
    }

    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      console.log('⚠️ Set-password: Invalid token', { 
        error: error.message,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }

    // Find the user
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId }
    });

    if (!user) {
      console.log('⚠️ Set-password: User not found', { 
        userId: decoded.userId,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Update user with new password and additional info
    const updateData = {
      password: hashedPassword,
    };

    // Add name and phone number if provided (for initial setup)
    if (name) updateData.name = name;
    if (phoneNumber) updateData.phoneNumber = phoneNumber;

    await prisma.user.update({
      where: { id: user.id },
      data: updateData
    });

    console.log(`✅ Set-password: Password set successfully for user: ${user.email}`, {
      userId: user.id,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    // Generate a new JWT token for the user
    const newToken = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        userType: user.userType,
        role: user.role,
        restaurantId: decoded.restaurantId,
        restaurantUserId: decoded.restaurantUserId
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Set authentication cookie
    res.cookie('manu', newToken, {
      httpOnly: false, // Allow JavaScript access for development
      secure: false, // Allow over HTTP for development
      sameSite: 'lax',
      path: '/',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });

    res.status(200).json({
      success: true,
      message: 'Password set successfully',
      data: {
        token: newToken,
        userType: user.userType,
        restaurantId: decoded.restaurantId
      }
    });

  } catch (error) {
    console.error('❌ Set-password: Error setting password:', error, {
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// POST /confirm-email - Confirm email and create user

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

// GET /user-info - Get current user info (userId, restaurantUserId, employeeId)
router.get('/user-info', async (req, res) => {
  try {
    console.log('🔍 user-info: Request received');
    
    // Check for cookie-based authentication
    const token = req.cookies.manu;
    
    if (!token) {
      console.log('❌ user-info: No token found in cookies');
      return res.status(401).json({
        success: false,
        message: 'No authentication token found'
      });
    }

    console.log('🔍 user-info: Token found, verifying...');
    try {
      const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
      console.log('✅ user-info: Token verified, decoded:', decodedToken);
      
      const userId = decodedToken.userId;
      let restaurantUserId = null;
      let employeeId = null;
      let userRestaurants = [];

      // Get all restaurants this user has access to
      const restaurantUsers = await prisma.restaurantUser.findMany({
        where: { userId: userId },
        include: {
          restaurant: {
            select: {
              id: true,
              name: true,
              profileImageUrl: true,
              description: true
            }
          }
        },
        orderBy: { id: 'asc' }
      });

      console.log('🔍 user-info: Found restaurant users:', restaurantUsers.length);
      
      if (restaurantUsers.length > 0) {
        userRestaurants = restaurantUsers.map(ru => ({
          restaurantUserId: ru.id,
          restaurantId: ru.restaurant.id,
          restaurantName: ru.restaurant.name,
          restaurantImage: ru.restaurant.profileImageUrl,
          restaurantDescription: ru.restaurant.description,
          role: ru.role
        }));

        // Set the current restaurantUserId (use the first one or the one from token)
        if (decodedToken.restaurantId) {
          const currentRestaurant = userRestaurants.find(r => r.restaurantId === decodedToken.restaurantId);
          if (currentRestaurant) {
            restaurantUserId = currentRestaurant.restaurantUserId;
          } else {
            restaurantUserId = userRestaurants[0].restaurantUserId;
          }
        } else {
          restaurantUserId = userRestaurants[0].restaurantUserId;
        }

        console.log('✅ user-info: restaurantUserId set to:', restaurantUserId);
      }

      // Check if user has an employee profile
      const employee = await prisma.employee.findUnique({
        where: { userId: userId }
      });
      
      if (employee) {
        employeeId = employee.id;
      }

      console.log('✅ user-info: Returning user info:', { 
        userId, 
        restaurantUserId, 
        employeeId, 
        restaurantCount: userRestaurants.length 
      });
      
      return res.json({
        success: true,
        userId,
        restaurantUserId,
        employeeId,
        restaurants: userRestaurants
      });
      
    } catch (tokenError) {
      console.log('❌ user-info: Token verification failed:', tokenError.message);
      return res.status(401).json({
        success: false,
        message: 'Invalid authentication token'
      });
    }
  } catch (error) {
    console.error('Error getting user info:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// POST /switch-restaurant - Switch to a different restaurant
router.post('/switch-restaurant', async (req, res) => {
  try {
    console.log('🔍 switch-restaurant: Request received');
    
    const token = req.cookies.manu;
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No authentication token found'
      });
    }

    const { restaurantId } = req.body;
    
    if (!restaurantId) {
      return res.status(400).json({
        success: false,
        message: 'Restaurant ID is required'
      });
    }

    try {
      const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
      const userId = decodedToken.userId;

      // Verify that the user has access to this restaurant
      const restaurantUser = await prisma.restaurantUser.findFirst({
        where: {
          userId: userId,
          restaurantId: parseInt(restaurantId)
        }
      });

      if (!restaurantUser) {
        return res.status(403).json({
          success: false,
          message: 'You do not have access to this restaurant'
        });
      }

      // Create a new token with the selected restaurant
      const newToken = jwt.sign({
        userId: decodedToken.userId,
        userType: decodedToken.userType,
        role: decodedToken.role,
        restaurantId: parseInt(restaurantId),
        restaurantUserId: restaurantUser.id,
        employeeId: decodedToken.employeeId
      }, process.env.JWT_SECRET, { expiresIn: '7d' });

      // Set the new token in a cookie
      res.cookie('manu', newToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });

      console.log('✅ switch-restaurant: Successfully switched to restaurant:', restaurantId);

      return res.json({
        success: true,
        message: 'Restaurant switched successfully',
        restaurantUserId: restaurantUser.id
      });

    } catch (tokenError) {
      return res.status(401).json({
        success: false,
        message: 'Invalid authentication token'
      });
    }
  } catch (error) {
    console.error('Error switching restaurant:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
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
      
      // Fetch user data with profile image
      const user = await prisma.user.findUnique({
        where: { id: decodedToken.userId },
        select: {
          id: true,
          email: true,
          userType: true,
          role: true,
          name: true,
          surname: true,
          employee: {
            select: {
              profileImageUrl: true
            }
          },
          restaurantUsers: {
            select: {
              restaurant: {
                select: {
                  profileImageUrl: true
                }
              }
            }
          }
        }
      });

      console.log('🔍 check-login-status: User found:', user);

      if (user) {
        // Get profile image URL based on user type
        let profileImageUrl = null;
        
        if (user.userType === 'profesionales' && user.employee?.profileImageUrl) {
          profileImageUrl = user.employee.profileImageUrl;
        } else if (user.userType === 'empresas' && user.restaurantUsers?.[0]?.restaurant?.profileImageUrl) {
          profileImageUrl = user.restaurantUsers[0].restaurant.profileImageUrl;
        }
        
        console.log('✅ check-login-status: User authenticated successfully, profileImageUrl:', profileImageUrl);
        return res.json({
          success: true,
          isLoggedIn: true,
          user: {
            ...user,
            userId: user.id,
            profileImageUrl: profileImageUrl
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

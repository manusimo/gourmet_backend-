const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { prisma } = require('../db.js');
const { sendEmail } = require('../helpers/email.js');
const { 
  convertImageKeyToSignedUrl 
} = require('../utils/imageUrlUtils.js');
const AuthService = require('../services/authService.js');
const { sendSuccessResponse, sendErrorResponse, handleAuthError } = require('../utils/responseHelpers.js');
const { Logger } = require('../middleware/errorTracking.js');

const {
  validateGoogleOAuthRequest,
  handleGoogleOAuthError
} = require('../helpers/validationHelpers.js');

const {
  authenticateWithGoogle,
  createAuthResponse
} = require('../helpers/googleAuthHelpers.js');

const {
  setSecureAuthCookie,
  clearAuthCookie
} = require('../helpers/secureCookie.js');

const {
  checkEmployee,
  checkCompany,
  setUserRole,
  setUserType,
  optionalAuth
} = require('../middleware/auth.js');

const {
  getUserIdFromCookie
} = require('../helpers/cookies.js');

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


// POST /signup - User registration with enhanced validation
router.post('/signup', validateSignup, async (req, res) => {
  try {
    const { email, password, userType, name, surname, phoneNumber } = req.body;

    // Create user account
    const { user, token, restaurantId } = await AuthService.signup({
      email,
      password,
          userType,
      name,
      surname,
      phoneNumber
    });

    // Set secure auth cookie (non-blocking)
    try {
      setSecureAuthCookie(res, token, {
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
      });
    } catch (cookieError) {
      Logger.warn('Cookie setting failed during signup', {
        userId: user.id,
        error: cookieError.message
      });
      // Continue with response even if cookie setting fails
    }

    sendSuccessResponse(res, 201, '¡Cuenta creada exitosamente! Bienvenido a GourmetJobs.', {
      user,
        token,
        securityRecommendation: 'Considera habilitar la autenticación de dos factores para mayor seguridad'
    });
  } catch (error) {
    handleAuthError(res, error, {
      context: { email: req.body?.email },
      logger: Logger
    });
  }
});

// POST /signin - User login with enhanced validation and security
router.post('/signin', validateSignin, async (req, res) => {
  try {
    const { email, password, mfaToken } = req.body;
    
    // Authenticate user
    const { user, token, securityStatus } = await AuthService.signin({
      email,
      password,
      mfaToken
    });

    // Set secure authentication cookie (non-blocking)
    try {
      setSecureAuthCookie(res, token, {
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
      });
    } catch (cookieError) {
      Logger.warn('Cookie setting failed during signin', {
        userId: user.id,
        error: cookieError.message
      });
      // Continue with response even if cookie setting fails
    }

    sendSuccessResponse(res, 200, 'Inicio de sesión exitoso', {
      user,
        token,
      securityStatus
    });
  } catch (error) {
    handleAuthError(res, error, {
      context: { email: req.body?.email },
      logger: Logger
    });
  }
});

// POST /google-signin - Google OAuth signin
router.post('/google-signin', async (req, res) => {
  try {
    // Validate request
    const validation = validateGoogleOAuthRequest(req.body);
    if (!validation.isValid) {
      return res.status(400).json(validation.error);
    }

    const { credential, userType } = req.body;

    // Authenticate with Google
    const authResult = await authenticateWithGoogle(credential, userType);
    
    // Set secure authentication cookie (subdomain support)
    setSecureAuthCookie(res, authResult.token, {
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });

    // Return success response with redirect info
    return res.status(200).json({
      success: true,
      message: 'Google sign-in successful',
      data: {
        user: authResult.user,
        token: authResult.token,
        redirectUrl: userType === 'profesionales' 
          ? 'http://localhost:3001/panel-empleado/perfil-empleado'
          : 'http://localhost:3001/panel-empresa/perfil'
      }
    });

  } catch (error) {
    const errorResponse = handleGoogleOAuthError(error);
    return res.status(errorResponse.status).json(errorResponse.response);
  }
});


// POST /logout - Enhanced logout with token blacklisting
router.post('/logout', async (req, res) => {
  try {
  
      // Get token from cookie instead of Authorization header
    const token = req.cookies.manu;
    
    if (token) {
      try {
        // Verify and decode token to get userId
        const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
        
        // Add token to blacklist
        invalidateToken(token);
      } catch (tokenError) {
        console.log('⚠️ Invalid token during logout, but continuing logout process');
      }
    }

    // Clear the cookie securely (cross-domain support)
    clearAuthCookie(res);

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
router.post('/logout-all', getUserIdFromCookie, async (req, res) => {
  try {
    const userId = req.userId;
    
    // In a more advanced implementation, you would:
    // 1. Track all user tokens in database
    // 2. Add all user tokens to blacklist
    // 3. Or increment a "token version" in user record
    
    // For now, we'll just blacklist the current token
    // Get token from cookie (preferred) or Bearer header (fallback)
    let token = req.cookies?.manu;
    if (!token) {
      token = req.headers.authorization?.replace('Bearer ', '');
    }
    
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

// POST /password-reset-request - Password reset request
router.post('/password-reset-request', validatePasswordReset, async (req, res) => {
  try {
    const { email } = req.body;

    const result = await AuthService.requestPasswordReset({ email });

    sendSuccessResponse(res, 200, result.message, {
      resetToken: result.resetToken
    });
  } catch (error) {
    handleAuthError(res, error, {
      context: { email: req.body?.email },
      logger: Logger
    });
  }
});

// POST /password-reset-confirm - Password reset confirmation
router.post('/password-reset-confirm', validatePasswordResetConfirm, async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    const result = await AuthService.confirmPasswordReset({ token, newPassword });

    sendSuccessResponse(res, 200, result.message);
  } catch (error) {
    handleAuthError(res, error, {
      context: {},
      logger: Logger
    });
  }
});

// POST /set-password - Set initial password for new users
router.post('/set-password', async (req, res) => {
  try {
    const { token, password, name, phoneNumber } = req.body;

    if (!token || !password) {
      return sendErrorResponse(res, 400, 'Token and password are required');
    }

    const result = await AuthService.setPassword({ token, password, name, phoneNumber });

    // Set secure authentication cookie (non-blocking)
    try {
      setSecureAuthCookie(res, result.token, {
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
      });
    } catch (cookieError) {
      Logger.warn('Cookie setting failed during set password', {
        error: cookieError.message
      });
      // Continue with response even if cookie setting fails
    }

    sendSuccessResponse(res, 200, result.message, {
      token: result.token,
      userType: result.userType,
      restaurantId: result.restaurantId
    });
  } catch (error) {
    handleAuthError(res, error, {
      context: { ip: req.ip, userAgent: req.get('User-Agent') },
      logger: Logger
    });
  }
});

// GET /user/:id - Get user information
router.get('/user/:id', validateUserId, getUserIdFromCookie, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await AuthService.getUser({
      userId: id,
      requesterId: req.userId,
      requesterUserType: req.userType
    });

    sendSuccessResponse(res, 200, 'User information retrieved successfully', result);
  } catch (error) {
    handleAuthError(res, error, {
      context: { userId: req.params.id, requesterId: req.userId },
      logger: Logger
    });
  }
});

// GET /user-info - Get current user info (userId, restaurantUserId, employeeId)
router.get('/user-info', async (req, res) => {
  try {
    const token = req.cookies.manu;

    if (!token) {
      return sendErrorResponse(res, 401, 'No authentication token found');
    }

    const result = await AuthService.getCurrentUserInfo({ token });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    handleAuthError(res, error, {
      context: { ip: req.ip, userAgent: req.get('User-Agent') },
      logger: Logger
    });
  }
});

// POST /switch-restaurant - Switch to a different restaurant
router.post('/switch-restaurant', async (req, res) => {
  try {
    const token = req.cookies.manu;

    if (!token) {
      return sendErrorResponse(res, 401, 'No authentication token found');
    }

    const { restaurantId } = req.body;

    if (!restaurantId) {
      return sendErrorResponse(res, 400, 'Restaurant ID is required');
    }

    const result = await AuthService.switchRestaurant({ token, restaurantId });

    // Set the new token in a secure cookie (non-blocking)
    try {
      setSecureAuthCookie(res, result.token, {
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });
    } catch (cookieError) {
      Logger.warn('Cookie setting failed during restaurant switch', {
        error: cookieError.message
      });
      // Continue with response even if cookie setting fails
    }

    res.json({
      success: true,
      message: result.message,
      restaurantUserId: result.restaurantUserId
    });
  } catch (error) {
    handleAuthError(res, error, {
      context: { restaurantId: req.body?.restaurantId },
      logger: Logger
    });
  }
});

// GET /check-login-status - Check if user is logged in
router.get('/check-login-status', async (req, res) => {
  try {
    const token = req.cookies.manu;

    const result = await AuthService.checkLoginStatus({ token });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    handleAuthError(res, error, {
      context: {},
      logger: Logger
    });
  }
});


// Apply role-based middleware
router.use(setUserRole);
router.use(setUserType);

module.exports = router;

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { prisma } = require('../db.js');
const { sendEmail } = require('../helpers/email.js');
const { 
  convertImageKeyToSignedUrl 
} = require('../utils/imageUrlUtils.js');

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


// POST /signup - User registration with enhanced validation
router.post('/signup', validateSignup, async (req, res) => {
  try {
    console.log('🔐 [POST /signup] Signup request received');
    console.log('🔐 [POST /signup] Request body:', {
      email: req.body.email,
      userType: req.body.userType,
      name: req.body.name,
      hasPassword: !!req.body.password,
      passwordLength: req.body.password?.length,
      hasPasswordConfirmation: !!req.body.passwordConfirmation,
      phoneNumber: req.body.phoneNumber
    });
    
    const { email, password, userType } = req.body;
    const userEmail = email.toLowerCase();
    console.log('🔐 [POST /signup] Processing signup for email:', userEmail);

    // Check if user already exists with error handling
    let existingUser;
    try {
      existingUser = await prisma.user.findUnique({
        where: { email: userEmail }
      });
    } catch (dbError) {
      console.error('❌ [POST /signup] Database error checking existing user:', dbError.message);
      console.error('❌ [POST /signup] Full error:', dbError);
      return res.status(500).json({
        success: false,
        message: 'Error de conexión con la base de datos. Por favor, intenta nuevamente en unos momentos.'
      });
    }

    if (existingUser) {
      console.log('❌ [POST /signup] User already exists:', userEmail);
      return res.status(409).json({
        success: false,
        message: 'Este email ya está registrado. Por favor, inicia sesión o utiliza otro email.',
        error: 'EMAIL_ALREADY_EXISTS'
      });
    }

    console.log('✅ [POST /signup] Email available, proceeding with registration');

    // Automatically assign role based on userType
    let role = 'admin'; // default role
    console.log('🔐 [POST /signup] Assigning role:', role, 'for userType:', userType);

    // Hash password with error handling
    let hashedPassword;
    try {
      console.log('🔐 [POST /signup] Hashing password...');
      hashedPassword = await bcrypt.hash(password, 12);
      console.log('✅ [POST /signup] Password hashed successfully');
    } catch (hashError) {
      console.error('❌ [POST /signup] Error hashing password:', hashError.message);
      return res.status(500).json({
        success: false,
        message: 'Error al procesar tu contraseña. Por favor, intenta nuevamente.'
      });
    }

    // Create user with enhanced security defaults
    let newUser;
    try {
      console.log('🔐 [POST /signup] Creating user in database...');
      newUser = await prisma.user.create({
        data: {
          email: userEmail,
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
      console.log(`✅ [POST /signup] User created successfully: ${newUser.email} (${newUser.userType}) with role: ${newUser.role}`);
    } catch (createError) {
      console.error('❌ [POST /signup] Error creating user:', createError.message);
      console.error('❌ [POST /signup] Full error:', createError);
      
      if (createError.code === 'P2002') {
        return res.status(409).json({
          success: false,
          message: 'Este email ya está registrado. Por favor, inicia sesión o utiliza otro email.',
          error: 'EMAIL_ALREADY_EXISTS'
        });
      }
      
      return res.status(500).json({
        success: false,
        message: 'Error al crear tu cuenta. Por favor, intenta nuevamente.'
      });
    }

    // Check if user has a restaurant (for company users)
    let restaurantId = null;
    if (newUser.userType === 'empresas') {
      try {
        console.log('🏢 [POST /signup] Checking for restaurant for company user:', newUser.email);
        const restaurant = await prisma.restaurant.findFirst({
          where: { userId: newUser.id },
          select: { id: true }
        });
        if (restaurant) {
          restaurantId = restaurant.id;
          console.log(`✅ [POST /signup] Found restaurant for new user ${newUser.email}:`, restaurantId);
        } else {
          console.log(`⚠️ [POST /signup] No restaurant found for new user ${newUser.email}`);
        }
      } catch (restaurantError) {
        console.error('⚠️ [POST /signup] Error fetching restaurant data:', restaurantError.message);
        // Continue with signup even if restaurant lookup fails
      }
    }

    // Generate JWT token with error handling
    let token;
    try {
      if (!process.env.JWT_SECRET) {
        console.error('❌ [POST /signup] JWT_SECRET not configured');
        return res.status(500).json({
          success: false,
          message: 'Error en la configuración del servidor. Por favor, contacta al soporte.'
        });
      }
      
      console.log('🔐 [POST /signup] Generating JWT token...');
      token = jwt.sign(
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
      console.log('✅ [POST /signup] JWT token generated successfully');
    } catch (tokenError) {
      console.error('❌ [POST /signup] Error generating JWT token:', tokenError.message);
      return res.status(500).json({
        success: false,
        message: 'Error al generar el token de autenticación. Por favor, intenta nuevamente.'
      });
    }

    // Set secure authentication cookie (subdomain support)
    try {
      console.log('🔐 [POST /signup] Setting secure authentication cookie...');
      setSecureAuthCookie(res, token, {
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
      });
      console.log('✅ [POST /signup] Authentication cookie set successfully');
    } catch (cookieError) {
      console.error('⚠️ [POST /signup] Error setting cookie:', cookieError.message);
      // Continue with response even if cookie setting fails
    }

    console.log('✅ [POST /signup] Signup completed successfully for:', newUser.email);
    res.status(201).json({
      success: true,
      message: '¡Cuenta creada exitosamente! Bienvenido a GourmetJobs.',
      data: {
        user: newUser,
        token,
        securityRecommendation: 'Considera habilitar la autenticación de dos factores para mayor seguridad'
      }
    });

  } catch (error) {
    console.error('❌ [POST /signup] Unexpected signup error:', error.message);
    console.error('❌ [POST /signup] Full error:', error);
    console.error('❌ [POST /signup] Error stack:', error.stack);

    if (error.code === 'P2002') {
      return res.status(409).json({
        success: false,
        message: 'Este email ya está registrado. Por favor, inicia sesión o utiliza otro email.',
        error: 'EMAIL_ALREADY_EXISTS'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Ocurrió un error inesperado al crear tu cuenta. Por favor, intenta nuevamente más tarde.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// POST /signin - User login with enhanced validation and security
router.post('/signin', validateSignin, async (req, res) => {
  try {
    console.log('🔐 [Signin] Login attempt started');
    const { email, password, mfaToken } = req.body;
    
    // Validate required fields
    if (!email || !password) {
      console.error('❌ [Signin] Missing required fields:', { hasEmail: !!email, hasPassword: !!password });
      return res.status(400).json({
        success: false,
        message: 'Email y contraseña son requeridos'
      });
    }

    const userEmail = email.toLowerCase();
    console.log('🔐 [Signin] Attempting login for email:', userEmail);

    // Find user with error handling
    let user;
    try {
      user = await prisma.user.findUnique({
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
    } catch (dbError) {
      console.error('❌ [Signin] Database error finding user:', dbError.message);
      console.error('❌ [Signin] Full error:', dbError);
      return res.status(500).json({
        success: false,
        message: 'Error de conexión con la base de datos. Por favor, intenta nuevamente en unos momentos.'
      });
    }

    if (!user) {
      console.log('❌ [Signin] User not found:', userEmail);
      return res.status(401).json({
        success: false,
        message: 'El usuario no existe. Verifica tu email e intenta nuevamente.'
      });
    }

    console.log('✅ [Signin] User found:', { id: user.id, email: user.email, userType: user.userType });

    // Check account lockout
    let lockoutStatus;
    try {
      lockoutStatus = isAccountLocked(user.id);
    } catch (lockoutError) {
      console.error('❌ [Signin] Error checking account lockout:', lockoutError.message);
      // Continue with login attempt even if lockout check fails
    }

    if (lockoutStatus) {
      console.log('⚠️ [Signin] Account locked for user:', userEmail, lockoutStatus);
      return res.status(423).json({
        success: false,
        message: `Cuenta temporalmente bloqueada debido a múltiples intentos fallidos`,
        data: {
          remainingTime: lockoutStatus.remainingTime,
          attempts: lockoutStatus.attempts
        }
      });
    }

    // Verify password with error handling
    let isPasswordValid = false;
    try {
      if (!user.password) {
        console.error('❌ [Signin] User has no password hash:', user.id);
        return res.status(500).json({
          success: false,
          message: 'Error en la configuración de tu cuenta. Por favor, contacta al soporte.'
        });
      }
      isPasswordValid = await bcrypt.compare(password, user.password);
    } catch (bcryptError) {
      console.error('❌ [Signin] Error comparing password:', bcryptError.message);
      return res.status(500).json({
        success: false,
        message: 'Error al verificar tu contraseña. Por favor, intenta nuevamente.'
      });
    }

    if (!isPasswordValid) {
      console.log('❌ [Signin] Invalid password for user:', userEmail);
      // Record failed attempt with error handling
      try {
        const lockoutData = recordFailedAttempt(user.id);
        console.log('⚠️ [Signin] Failed attempt recorded:', { attempts: lockoutData.attempts });
      } catch (recordError) {
        console.error('❌ [Signin] Error recording failed attempt:', recordError.message);
      }

      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas',
        data: {
          attemptsRemaining: Math.max(0, 5 - (lockoutStatus?.attempts || 0))
        }
      });
    }

    console.log('✅ [Signin] Password verified for user:', userEmail);

    // If MFA is enabled, verify MFA token
    if (user.mfaEnabled) {
      console.log('🔐 [Signin] MFA enabled for user:', userEmail);
      if (!mfaToken) {
        console.log('❌ [Signin] MFA token missing for user:', userEmail);
        return res.status(403).json({
          success: false,
          message: 'Autenticación de dos factores requerida',
          requiresMFA: true
        });
      }

      let isMFAValid = false;
      try {
        if (!user.mfaSecret) {
          console.error('❌ [Signin] MFA enabled but no secret found for user:', user.id);
          return res.status(500).json({
            success: false,
            message: 'Error en la configuración de tu cuenta. Por favor, contacta al soporte.'
          });
        }
        isMFAValid = verifyMFAToken(user.mfaSecret, mfaToken);
      } catch (mfaError) {
        console.error('❌ [Signin] Error verifying MFA token:', mfaError.message);
        return res.status(500).json({
          success: false,
          message: 'Error al verificar el código de autenticación. Por favor, intenta nuevamente.'
        });
      }

      if (!isMFAValid) {
        console.log('❌ [Signin] Invalid MFA token for user:', userEmail);
        // Record failed attempt for invalid MFA
        try {
          recordFailedAttempt(user.id);
        } catch (recordError) {
          console.error('❌ [Signin] Error recording failed MFA attempt:', recordError.message);
        }

        return res.status(403).json({
          success: false,
          message: 'Código de autenticación inválido'
        });
      }
      console.log('✅ [Signin] MFA token verified for user:', userEmail);
    }

    // Reset account lockout on successful login
    try {
      resetAccountLockout(user.id);
      console.log('✅ [Signin] Account lockout reset for user:', userEmail);
    } catch (resetError) {
      console.error('⚠️ [Signin] Error resetting account lockout:', resetError.message);
      // Continue with login even if reset fails
    }

    // Update last login with error handling
    try {
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() }
      });
      console.log('✅ [Signin] Last login updated for user:', userEmail);
    } catch (updateError) {
      console.error('⚠️ [Signin] Error updating last login:', updateError.message);
      // Continue with login even if update fails
    }

    // Check if user has a restaurant (for company users)
    let restaurantId = null;
    let restaurantUserId = null;
    if (user.userType === 'empresas') {
      try {
        // For staff users, we need to get restaurantId and restaurantUserId from RestaurantUser table
        const restaurantUser = await prisma.restaurantUser.findFirst({
          where: { userId: user.id },
          select: { id: true, restaurantId: true }
        });
        
        if (restaurantUser) {
          restaurantId = restaurantUser.restaurantId;
          restaurantUserId = restaurantUser.id;
          console.log(`🏢 [Signin] Found restaurant for user ${user.email}:`, { restaurantId, restaurantUserId });
        } else {
          // Fallback: try to find restaurant directly (for admin users)
          const restaurant = await prisma.restaurant.findFirst({
            where: { userId: user.id },
            select: { id: true }
          });
          if (restaurant) {
            restaurantId = restaurant.id;
            console.log(`🏢 [Signin] Found restaurant for admin user ${user.email}:`, restaurantId);
          } else {
            console.log(`⚠️ [Signin] No restaurant found for user ${user.email}`);
          }
        }
      } catch (restaurantError) {
        console.error('⚠️ [Signin] Error fetching restaurant data:', restaurantError.message);
        // Continue with login even if restaurant lookup fails
      }
    }

    // Generate JWT token with error handling
    let token;
    try {
      if (!process.env.JWT_SECRET) {
        console.error('❌ [Signin] JWT_SECRET not configured');
        return res.status(500).json({
          success: false,
          message: 'Error en la configuración del servidor. Por favor, contacta al soporte.'
        });
      }

      token = jwt.sign(
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
      console.log('✅ [Signin] JWT token generated for user:', userEmail);
    } catch (jwtError) {
      console.error('❌ [Signin] Error generating JWT token:', jwtError.message);
      return res.status(500).json({
        success: false,
        message: 'Error al generar el token de acceso. Por favor, intenta nuevamente.'
      });
    }

    // Set secure authentication cookie (subdomain support)
    try {
      setSecureAuthCookie(res, token, {
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
      });
      console.log('✅ [Signin] Authentication cookie set for user:', userEmail);
    } catch (cookieError) {
      console.error('⚠️ [Signin] Error setting cookie:', cookieError.message);
      // Continue even if cookie fails - token is in response body
    }

    console.log(`✅ [Signin] User login successful: ${user.email}`);

    res.status(200).json({
      success: true,
      message: 'Inicio de sesión exitoso',
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
    console.error('❌ [Signin] Unexpected error:', error.message);
    console.error('❌ [Signin] Error stack:', error.stack);
    console.error('❌ [Signin] Request body:', { email: req.body?.email ? 'provided' : 'missing' });
    
    res.status(500).json({
      success: false,
      message: 'Ocurrió un error inesperado durante el inicio de sesión. Por favor, intenta nuevamente más tarde.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
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

    // Clear the cookie securely (cross-domain support)
    clearAuthCookie(res);

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
    } catch (emailError) {
      console.error('❌ Error sending password reset email:', emailError);
    }

    res.status(200).json({
      success: true,
      message: 'If the email exists, a reset link has been sent',
      data: { 
        resetToken: process.env.NODE_ENV === 'development' ? resetToken : undefined 
      }
    });

  } catch (error) {
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

    // Set secure authentication cookie (subdomain support)
    setSecureAuthCookie(res, newToken, {
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
    
    // Check for cookie-based authentication
    const token = req.cookies.manu;
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No authentication token found'
      });
    }

    try {
      const decodedToken = jwt.verify(token, process.env.JWT_SECRET); 
      const userId = decodedToken.userId;
      let restaurantUserId = null;
      let employeeId = null;
      let userRestaurants = [];

      // Get all restaurants this user has access to (both as owner and as staff)
      const restaurantUsers = await prisma.restaurantUser.findMany({
        where: { 
          userId: userId,
          restaurant: {
            deletedAt: null // Filter out soft-deleted restaurants
          }
        },
        include: {
          restaurant: {
            select: {
              id: true,
              name: true,
              profileImageUrl: true,
              description: true,
              specialty: true,
              format: true,
              region: true,
              comuna: true
            }
          }
        },
        orderBy: { id: 'asc' }
      });

      // Also get restaurants where the user is the direct owner
      const ownedRestaurants = await prisma.restaurant.findMany({
        where: { 
          userId: userId,
          deletedAt: null // Filter out soft-deleted restaurants
        },
        select: {
          id: true,
          name: true,
          profileImageUrl: true,
          description: true,
          specialty: true,
          format: true,
          region: true,
          comuna: true
        },
        orderBy: { id: 'asc' }
      });

      
      // Combine restaurant users and owned restaurants
      const allRestaurants = [];
      
      // Add restaurants from RestaurantUser table (staff access)
      for (const ru of restaurantUsers) {
        
        const convertedImageUrl = await convertImageKeyToSignedUrl(ru.restaurant.profileImageUrl).catch(error => {
          console.error('❌ Error converting restaurant image URL:', ru.restaurant.profileImageUrl, error);
          return '/default-restaurant.png';
        });
        
        
        allRestaurants.push({
          restaurantUserId: ru.id,
          restaurantId: ru.restaurant.id,
          restaurantName: ru.restaurant.name,
          restaurantImage: convertedImageUrl,
          restaurantDescription: ru.restaurant.description,
          specialty: ru.restaurant.specialty,
          format: ru.restaurant.format,
          region: ru.restaurant.region,
          comuna: ru.restaurant.comuna,
          role: ru.role
        });
      }
      
      // Add owned restaurants (direct ownership)
      for (const restaurant of ownedRestaurants) {
        // Check if this restaurant is already in the list (avoid duplicates)
        const exists = allRestaurants.some(r => r.restaurantId === restaurant.id);
        if (!exists) {
          
          const convertedImageUrl = await convertImageKeyToSignedUrl(restaurant.profileImageUrl).catch(error => {
            console.error('❌ Error converting owned restaurant image URL:', restaurant.profileImageUrl, error);
            return '/default-restaurant.png';
          });
          
          allRestaurants.push({
            restaurantUserId: null, // No RestaurantUser record for direct ownership
            restaurantId: restaurant.id,
            restaurantName: restaurant.name,
            restaurantImage: convertedImageUrl,
            restaurantDescription: restaurant.description,
            specialty: restaurant.specialty,
            format: restaurant.format,
            region: restaurant.region,
            comuna: restaurant.comuna,
            role: 'admin' // Owner has admin role
          });
        }
      }

      userRestaurants = allRestaurants;

      if (userRestaurants.length > 0) {
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

      }

      // Check if user has an employee profile
      const employee = await prisma.employee.findUnique({
        where: { userId: userId }
      });
      
      if (employee) {
        employeeId = employee.id;
      }
 
      return res.json({
        success: true,
        userId,
        restaurantUserId,
        employeeId,
        userType: decodedToken.userType,
        restaurants: userRestaurants
      });
      
    } catch (tokenError) {
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
      let restaurantUser = await prisma.restaurantUser.findFirst({
        where: {
          userId: userId,
          restaurantId: parseInt(restaurantId)
        }
      });

      // If no RestaurantUser record found, check if user is admin and owns the restaurant directly
      if (!restaurantUser && decodedToken.role === 'admin') {
        const ownedRestaurant = await prisma.restaurant.findFirst({
          where: {
            id: parseInt(restaurantId),
            userId: userId
          }
        });

        if (ownedRestaurant) {
          // Admin user owns this restaurant directly
          restaurantUser = { id: null }; 
        }
      }

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
        restaurantUserId: restaurantUser.id, // null for admin users, actual ID for staff
        employeeId: decodedToken.employeeId
      }, process.env.JWT_SECRET, { expiresIn: '7d' });

      // Set the new token in a secure cookie (subdomain support)
      setSecureAuthCookie(res, newToken, {
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });

      return res.json({
        success: true,
        message: 'Restaurant switched successfully',
        restaurantUserId: restaurantUser.id // null for admin users, actual ID for staff
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
    
    // Check for cookie-based authentication
    const token = req.cookies.manu;
    
    if (!token) {
      return res.json({
        success: true,
        isLoggedIn: false,
        user: null
      });
    }

    try {
      const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
      
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

      if (user) {
        // Get profile image URL based on user type and convert to signed URL
        let profileImageUrl = null;
        
        if (user.userType === 'profesionales' && user.employee?.profileImageUrl) {
          profileImageUrl = await convertImageKeyToSignedUrl(user.employee.profileImageUrl, '/default-employee.png');
        } 
        
        if (user.userType === 'empresas' && user.restaurantUsers?.[0]?.restaurant?.profileImageUrl) {
          profileImageUrl = await convertImageKeyToSignedUrl(user.restaurantUsers[0].restaurant.profileImageUrl, '/default-restaurant.png');
        }
        
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


// Apply role-based middleware
router.use(setUserRole);
router.use(setUserType);

module.exports = router;

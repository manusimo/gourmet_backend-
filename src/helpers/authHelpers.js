const { prisma } = require("../db.js");
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { sendEmail } = require('./email.js');

/**
 * Validate signup input data
 * @param {Object} data - Signup data
 * @returns {Object} Validation result
 */
const validateSignupInput = (data) => {
  const { email, password, passwordConfirmation, userType, name, phoneNumber } = data;
  const errors = [];

  if (!email) {
    errors.push('Email is required');
  } else if (!email.includes('@')) {
    errors.push('Invalid email format');
  }

  if (!password) {
    errors.push('Password is required');
  } else if (password.length < 6) {
    errors.push('Password must be at least 6 characters long');
  }

  if (password !== passwordConfirmation) {
    errors.push('Passwords do not match');
  }

  if (!userType) {
    errors.push('User type is required');
  } else if (!['empresas', 'profesionales'].includes(userType)) {
    errors.push('Invalid user type');
  }

  if (!name) {
    errors.push('Name is required');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Validate signin input data
 * @param {Object} data - Signin data
 * @returns {Object} Validation result
 */
const validateSigninInput = (data) => {
  const { email, password } = data;
  const errors = [];

  if (!email) {
    errors.push('Email is required');
  }

  if (!password) {
    errors.push('Password is required');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Check if user exists by email
 * @param {string} email - User email
 * @returns {Object|null} User or null if not found
 */
const getUserByEmail = async (email) => {
  return await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: {
      employee: true,
      restaurant: true,
      restaurantUsers: {
        include: {
          restaurant: true
        }
      },
    },
  });
};

/**
 * Hash password with bcrypt
 * @param {string} password - Plain text password
 * @param {number} [saltRounds=12] - Bcrypt salt rounds
 * @returns {Promise<string>} Hashed password
 */
const hashPassword = async (password, saltRounds = 12) => {
  return await bcrypt.hash(password, saltRounds);
};

/**
 * Create new user
 * @param {Object} userData - User data
 * @returns {Object} Created user
 */
const createUser = async (userData) => {
  const { email, password, userType, name, phoneNumber } = userData;
  const hashedPassword = await hashPassword(password, 10);

  return await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      password: hashedPassword,
      userType,
      phoneNumber,
      name,
      role: 'admin',
    },
  });
};

/**
 * Create user with security defaults for signup
 * @param {Object} userData - User data
 * @param {string} userData.email - User email
 * @param {string} userData.hashedPassword - Hashed password
 * @param {string} userData.userType - User type
 * @param {string} [userData.name] - User name
 * @param {string} [userData.surname] - User surname
 * @param {string} [userData.phoneNumber] - User phone number
 * @returns {Object} Created user
 */
const createUserWithSecurityDefaults = async ({ email, hashedPassword, userType, name, surname, phoneNumber }) => {
  return await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      password: hashedPassword,
      userType,
      role: 'admin',
      name: name || 'Juanito',
      surname: surname || 'Pérez',
      phoneNumber: phoneNumber || '+56976212644',
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
      mfaEnabled: true
    }
  });
};

/**
 * Get restaurant ID for a user (for company users)
 * @param {number} userId - User ID
 * @returns {Promise<number|null>} Restaurant ID or null
 */
const getRestaurantIdForUser = async (userId) => {
  try {
    const restaurant = await prisma.restaurant.findFirst({
      where: { userId },
      select: { id: true }
    });
    return restaurant?.id || null;
  } catch (error) {
    // Return null on error - non-blocking
    return null;
  }
};

/**
 * Get user for signin with all required fields
 * @param {string} email - User email
 * @returns {Promise<Object|null>} User object or null
 */
const getUserForSignin = async (email) => {
  return await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    select: {
      id: true,
      email: true,
      password: true,
      userType: true,
      name: true,
      surname: true,
      phoneNumber: true,
      mfaEnabled: true,
      mfaSecret: true,
      accountLocked: true,
      lastLoginAt: true,
      role: true
    }
  });
};

/**
 * Get restaurant access info for signin (restaurantId and restaurantUserId)
 * @param {number} userId - User ID
 * @returns {Promise<Object>} Object with restaurantId and restaurantUserId
 */
const getRestaurantAccessForSignin = async (userId) => {
  try {
    // For staff users, get from RestaurantUser table
    const restaurantUser = await prisma.restaurantUser.findFirst({
      where: { userId },
      select: { id: true, restaurantId: true }
    });

    if (restaurantUser) {
      return {
        restaurantId: restaurantUser.restaurantId,
        restaurantUserId: restaurantUser.id
      };
    }

    // Fallback: try to find restaurant directly (for admin users)
    const restaurant = await prisma.restaurant.findFirst({
      where: { userId },
      select: { id: true }
    });

    return {
      restaurantId: restaurant?.id || null,
      restaurantUserId: null
    };
  } catch (error) {
    // Return nulls on error - non-blocking
    return { restaurantId: null, restaurantUserId: null };
  }
};

/**
 * Update user's last login timestamp
 * @param {number} userId - User ID
 * @returns {Promise<void>}
 */
const updateLastLogin = async (userId) => {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() }
    });
  } catch (error) {
    // Non-blocking - log but don't throw
    if (process.env.NODE_ENV !== 'test') {
      console.error('⚠️ [Signin] Error updating last login:', error.message);
    }
  }
};

/**
 * Generate JWT token for signin
 * @param {Object} user - User object
 * @param {number|null} restaurantId - Restaurant ID (optional)
 * @param {number|null} restaurantUserId - Restaurant User ID (optional)
 * @returns {string} JWT token
 * @throws {Error} If JWT_SECRET is not configured
 */
const generateSigninToken = (user, restaurantId = null, restaurantUserId = null) => {
  if (!process.env.JWT_SECRET) {
    const error = new Error('Error en la configuración del servidor. Por favor, contacta al soporte.');
    error.statusCode = 500;
    throw error;
  }

  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      userType: user.userType,
      role: user.role,
      restaurantId,
      restaurantUserId
    },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );
};

/**
 * Validate account lockout status
 * @param {Object} user - User object
 * @param {Function} isAccountLocked - Function to check account lockout
 * @param {Function} createAuthError - Function to create auth error
 * @throws {Error} If account is locked
 */
const validateAccountLockout = (user, isAccountLocked, createAuthError) => {
  const lockoutStatus = isAccountLocked(user.id);
  if (lockoutStatus) {
    const error = createAuthError(
      'Cuenta temporalmente bloqueada debido a múltiples intentos fallidos',
      423
    );
    error.data = {
      remainingTime: lockoutStatus.remainingTime,
      attempts: lockoutStatus.attempts
    };
    throw error;
  }
};

/**
 * Verify password with failed attempt tracking
 * @param {string} password - Plain text password
 * @param {Object} user - User object with password
 * @param {Function} verifyPassword - Function to verify password
 * @param {Function} recordFailedAttempt - Function to record failed attempt
 * @param {Function} createAuthError - Function to create auth error
 * @param {Object} lockoutStatus - Current lockout status
 * @throws {Error} If password is invalid
 */
const verifyPasswordWithTracking = async (password, user, verifyPassword, recordFailedAttempt, createAuthError, lockoutStatus) => {
  if (!user.password) {
    throw createAuthError(
      'Error en la configuración de tu cuenta. Por favor, contacta al soporte.',
      500
    );
  }

  const isPasswordValid = await verifyPassword(password, user.password);
  if (!isPasswordValid) {
    recordFailedAttempt(user.id);
    const error = createAuthError('Credenciales inválidas', 401);
    error.data = {
      attemptsRemaining: Math.max(0, 5 - (lockoutStatus?.attempts || 0))
    };
    throw error;
  }
};

/**
 * Verify MFA if enabled
 * @param {Object} user - User object
 * @param {string} mfaToken - MFA token
 * @param {Function} verifyMFAToken - Function to verify MFA token
 * @param {Function} recordFailedAttempt - Function to record failed attempt
 * @param {Function} createAuthError - Function to create auth error
 * @throws {Error} If MFA is required but not provided or invalid
 */
const verifyMFAIfEnabled = (user, mfaToken, verifyMFAToken, recordFailedAttempt, createAuthError) => {
  if (!user.mfaEnabled) {
    return; // MFA not enabled, skip verification
  }

  if (!mfaToken) {
    const error = createAuthError(
      'Autenticación de dos factores requerida',
      403
    );
    error.requiresMFA = true;
    throw error;
  }

  if (!user.mfaSecret) {
    throw createAuthError(
      'Error en la configuración de tu cuenta. Por favor, contacta al soporte.',
      500
    );
  }

  const isMFAValid = verifyMFAToken(user.mfaSecret, mfaToken);
  if (!isMFAValid) {
    recordFailedAttempt(user.id);
    throw createAuthError('Código de autenticación inválido', 403);
  }
};

/**
 * Complete successful signin - reset lockout, update login, get restaurant, generate token
 * @param {Object} user - User object
 * @param {Function} resetAccountLockout - Function to reset account lockout
 * @param {Function} updateLastLogin - Function to update last login
 * @param {Function} getRestaurantAccessForSignin - Function to get restaurant access
 * @param {Function} generateSigninToken - Function to generate signin token
 * @returns {Promise<Object>} Signin result with user, token, and restaurant info
 */
const completeSuccessfulSignin = async (user, resetAccountLockout, updateLastLogin, getRestaurantAccessForSignin, generateSigninToken) => {
  // Reset account lockout on successful authentication
  resetAccountLockout(user.id);

  // Update last login (non-blocking)
  updateLastLogin(user.id);

  // Get restaurant access for company users
  const { restaurantId, restaurantUserId } = user.userType === 'empresas'
    ? await getRestaurantAccessForSignin(user.id)
    : { restaurantId: null, restaurantUserId: null };

  // Generate JWT token
  const token = generateSigninToken(user, restaurantId, restaurantUserId);

  return {
    user: {
      id: user.id,
      email: user.email,
      userType: user.userType,
      mfaEnabled: user.mfaEnabled,
      lastLoginAt: user.lastLoginAt
    },
    token,
    restaurantId,
    restaurantUserId,
    securityStatus: {
      mfaEnabled: user.mfaEnabled,
      recommendMFA: !user.mfaEnabled
    }
  };
};

/**
 * Generate JWT token for signup
 * @param {Object} user - User object
 * @param {number|null} restaurantId - Restaurant ID (optional)
 * @returns {string} JWT token
 * @throws {Error} If JWT_SECRET is not configured
 */
const generateSignupToken = (user, restaurantId = null) => {
  if (!process.env.JWT_SECRET) {
    const error = new Error('Error en la configuración del servidor. Por favor, contacta al soporte.');
    error.statusCode = 500;
    throw error;
  }

  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      userType: user.userType,
      role: user.role,
      restaurantId
    },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );
};

/**
 * Verify user password
 * @param {string} password - Plain text password
 * @param {string} hashedPassword - Hashed password
 * @returns {boolean} True if password matches
 */
const verifyPassword = async (password, hashedPassword) => {
  return await bcrypt.compare(password, hashedPassword);
};

/**
 * Generate JWT token
 * @param {Object} payload - Token payload
 * @returns {string} JWT token
 */
const generateToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
};

/**
 * Verify JWT token
 * @param {string} token - JWT token
 * @returns {Object} Decoded token payload
 */
const verifyToken = (token) => {
  return jwt.verify(token, process.env.JWT_SECRET);
};

/**
 * Get user profile image URL
 * @param {Object} user - User object with related data
 * @returns {string} Profile image URL
 */
const getUserProfileImage = (user) => {
  if (user.userType === 'profesionales' && user.employee?.profileImageUrl) {
    return user.employee.profileImageUrl;
  } else if (user.userType === 'empresas') {
    const restaurant = user.restaurant || user.restaurantUsers?.[0]?.restaurant;
    if (restaurant?.profileImageUrl) {
      return restaurant.profileImageUrl;
    }
  }
  
  return 'defaultImage.jpg';
};

/**
 * Get user with profile image data for login status check
 * @param {number} userId - User ID
 * @returns {Promise<Object|null>} User with profile image data or null
 */
const getUserForLoginStatus = async (userId) => {
  return await prisma.user.findUnique({
    where: { id: parseInt(userId) },
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
};

/**
 * Get and convert profile image URL for a user
 * @param {Object} user - User object with employee/restaurant data
 * @param {Function} convertImageKeyToSignedUrl - Function to convert image URLs
 * @returns {Promise<string|null>} Converted profile image URL or null
 */
const getConvertedProfileImageUrl = async (user, convertImageKeyToSignedUrl) => {
  if (user.userType === 'profesionales' && user.employee?.profileImageUrl) {
    return await convertImageKeyToSignedUrl(user.employee.profileImageUrl, '/default-employee.png').catch(() => {
      return '/default-employee.png';
    });
  }

  if (user.userType === 'empresas' && user.restaurantUsers?.[0]?.restaurant?.profileImageUrl) {
    return await convertImageKeyToSignedUrl(
      user.restaurantUsers[0].restaurant.profileImageUrl,
      '/default-restaurant.png'
    ).catch(() => {
      return '/default-restaurant.png';
    });
  }

  return null;
};

/**
 * Build token payload for user
 * @param {Object} user - User object
 * @returns {Object} Token payload
 */
const buildTokenPayload = (user) => {
  const payload = {
    userId: user.id,
    email: user.email,
    userType: user.userType,
    role: user.role,
  };

  if (user.employee) {
    payload.employeeId = user.employee.id;
  }

  if (user.restaurantUsers.length > 0) {
    const restaurantUser = user.restaurantUsers[0];
    payload.restaurantId = restaurantUser.restaurantId;
    payload.restaurantUserId = restaurantUser.id;
  }

  return payload;
};

/**
 * Get restaurant users
 * @param {number} restaurantId - Restaurant ID
 * @returns {Array} Array of restaurant users
 */
const getRestaurantUsers = async (restaurantId) => {
  return await prisma.restaurantUser.findMany({
    where: {
      restaurantId: parseInt(restaurantId),
    },
    include: {
      user: true,
    },
  });
};

/**
 * Get user by ID
 * @param {number} userId - User ID
 * @returns {Object|null} User or null if not found
 */
const getUserById = async (userId) => {
  return await prisma.user.findUnique({
    where: {
      id: parseInt(userId),
    },
  });
};

/**
 * Check if user exists by email
 * @param {string} email - Email to check
 * @returns {Object|null} User or null if not found
 */
const checkUserExists = async (email) => {
  return await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });
};

/**
 * Send confirmation email
 * @param {string} email - Recipient email
 * @param {string} userType - User type
 * @param {number} restaurantId - Restaurant ID
 * @returns {Promise} Email sending result
 */
const sendConfirmationEmail = async (email, userType, restaurantId) => {
  const confirmationToken = jwt.sign(
    { email, userType, restaurantId }, 
    process.env.JWT_SECRET, 
    { expiresIn: '60min' }
  );

  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
  const confirmationLink = `${baseUrl}/panel-empresa/confirm-email?token=${confirmationToken}`;
  const emailBody = `Welcome to our service! Please click on the link below to confirm your email and set your password. <a href="${confirmationLink}">Confirm Email</a>`;
  
  return await sendEmail({
    to: email,
    subject: 'Welcome to Our Service - Confirm Your Email',
    text: 'Confirmation link is provided in the email.',
    html: `<p>${emailBody}</p>`,
  });
};

/**
 * Create or update user with password
 * @param {Object} userData - User data
 * @returns {Object} User object
 */
const createOrUpdateUserWithPassword = async (userData) => {
  const { email, password, userType, name, phoneNumber } = userData;
  const hashedPassword = await bcrypt.hash(password, 10);

  return await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      password: hashedPassword,
      userType,
      role: 'staff',
      name: name || undefined,
      phoneNumber: phoneNumber || undefined,
    },
  });
};

/**
 * Create restaurant user association
 * @param {number} userId - User ID
 * @param {number} restaurantId - Restaurant ID
 * @returns {Object} Created restaurant user
 */
const createRestaurantUser = async (userId, restaurantId) => {
  return await prisma.restaurantUser.create({
    data: {
      userId,
      restaurantId: parseInt(restaurantId),
      role: 'staff',
    }
  });
};

/**
 * Get user with full details
 * @param {number} userId - User ID
 * @returns {Object|null} User with full details or null
 */
const getUserWithDetails = async (userId) => {
  return await prisma.user.findUnique({
    where: { id: parseInt(userId) },
    include: { 
      employee: true,
      restaurant: true,     
      restaurantUsers: {    
        include: {
          restaurant: true
        }
      }
    }
  });
};

/**
 * Get user info for specific use cases
 * @param {number} userId - User ID
 * @returns {Object|null} User info or null
 */
const getUserInfo = async (userId) => {
  return await prisma.user.findUnique({
    where: {
      id: parseInt(userId),
    },
    include: {
      restaurantUsers: {
        where: {
          userId: parseInt(userId), 
        },
      },
      employee: true, 
    },
  });
};

/**
 * Get user with basic info fields (for profile viewing)
 * @param {number} userId - User ID
 * @returns {Promise<Object|null>} User with selected fields or null
 */
const getUserBasicInfo = async (userId) => {
  return await prisma.user.findUnique({
    where: { id: parseInt(userId) },
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
};

/**
 * Get all restaurants for a user (staff access + owned)
 * @param {number} userId - User ID
 * @returns {Promise<Array>} Array of restaurant access records
 */
const getAllUserRestaurants = async (userId) => {
  // Get restaurants from RestaurantUser table (staff access)
  const restaurantUsers = await prisma.restaurantUser.findMany({
    where: { 
      userId: parseInt(userId),
      restaurant: {
        deletedAt: null // Filter out soft-deleted restaurants
      }
    },
    select: {
      id: true,
      role: true,
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

  // Get restaurants where the user is the direct owner
  const ownedRestaurants = await prisma.restaurant.findMany({
    where: { 
      userId: parseInt(userId),
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

  return { restaurantUsers, ownedRestaurants };
};

/**
 * Get employee ID for a user
 * @param {number} userId - User ID
 * @returns {Promise<number|null>} Employee ID or null
 */
const getEmployeeIdForUser = async (userId) => {
  const employee = await prisma.employee.findUnique({
    where: { userId: parseInt(userId) },
    select: { id: true }
  });
  
  return employee?.id || null;
};

/**
 * Verify JWT token from cookie
 * @param {string} token - JWT token
 * @returns {Object} Decoded token payload
 * @throws {Error} If token is invalid or expired
 */
const verifyTokenFromCookie = (token) => {
  if (!process.env.JWT_SECRET) {
    const error = new Error('Error en la configuración del servidor. Por favor, contacta al soporte.');
    error.statusCode = 500;
    throw error;
  }

  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    const authError = new Error('Invalid authentication token');
    authError.statusCode = 401;
    throw authError;
  }
};

/**
 * Format restaurants with converted image URLs
 * @param {Array} restaurantUsers - Restaurant users (staff access)
 * @param {Array} ownedRestaurants - Owned restaurants
 * @param {Function} convertImageKeyToSignedUrl - Function to convert image URLs
 * @returns {Promise<Array>} Formatted restaurants array
 */
const formatUserRestaurants = async (restaurantUsers, ownedRestaurants, convertImageKeyToSignedUrl) => {
  const allRestaurants = [];

  // Add restaurants from RestaurantUser table (staff access)
  for (const ru of restaurantUsers) {
    const convertedImageUrl = await convertImageKeyToSignedUrl(ru.restaurant.profileImageUrl).catch(() => {
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
      const convertedImageUrl = await convertImageKeyToSignedUrl(restaurant.profileImageUrl).catch(() => {
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

  return allRestaurants;
};

/**
 * Determine current restaurantUserId from restaurants and token
 * @param {Array} restaurants - User's restaurants
 * @param {number|null} tokenRestaurantId - Restaurant ID from token
 * @returns {number|null} Current restaurantUserId
 */
const getCurrentRestaurantUserId = (restaurants, tokenRestaurantId) => {
  if (restaurants.length === 0) {
    return null;
  }

  // Use restaurant from token if available and exists in user's restaurants
  if (tokenRestaurantId) {
    const currentRestaurant = restaurants.find(r => r.restaurantId === tokenRestaurantId);
    if (currentRestaurant) {
      return currentRestaurant.restaurantUserId;
    }
  }

  // Default to first restaurant's restaurantUserId
  return restaurants[0].restaurantUserId;
};

/**
 * Verify user has access to a restaurant
 * @param {number} userId - User ID
 * @param {number} restaurantId - Restaurant ID
 * @param {string} userRole - User role
 * @returns {Promise<Object|null>} RestaurantUser record or null
 */
const verifyRestaurantAccess = async (userId, restaurantId, userRole) => {
  // Check RestaurantUser table (staff access)
  const restaurantUser = await prisma.restaurantUser.findFirst({
    where: {
      userId: parseInt(userId),
      restaurantId: parseInt(restaurantId)
    },
    select: { id: true }
  });

  if (restaurantUser) {
    return restaurantUser;
  }

  // If no RestaurantUser record found, check if user is admin and owns the restaurant directly
  if (userRole === 'admin') {
    const ownedRestaurant = await prisma.restaurant.findFirst({
      where: {
        id: parseInt(restaurantId),
        userId: parseInt(userId),
        deletedAt: null
      },
      select: { id: true }
    });

    if (ownedRestaurant) {
      // Admin user owns this restaurant directly
      return { id: null };
    }
  }

  return null;
};

/**
 * Generate JWT token for restaurant switch
 * @param {Object} decodedToken - Original decoded token
 * @param {number} restaurantId - Restaurant ID to switch to
 * @param {number|null} restaurantUserId - Restaurant User ID (null for admin owners)
 * @returns {string} JWT token
 * @throws {Error} If JWT_SECRET is not configured
 */
const generateSwitchRestaurantToken = (decodedToken, restaurantId, restaurantUserId) => {
  if (!process.env.JWT_SECRET) {
    const error = new Error('Error en la configuración del servidor. Por favor, contacta al soporte.');
    error.statusCode = 500;
    throw error;
  }

  return jwt.sign({
    userId: decodedToken.userId,
    userType: decodedToken.userType,
    role: decodedToken.role,
    restaurantId: parseInt(restaurantId),
    restaurantUserId: restaurantUserId, // null for admin users, actual ID for staff
    employeeId: decodedToken.employeeId
  }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

/**
 * Update user password
 * @param {string} email - User email
 * @param {string} newPassword - New password
 * @returns {Object} Updated user
 */
const updateUserPassword = async (email, newPassword) => {
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  
  return await prisma.user.update({
    where: { email: email.toLowerCase() },
    data: { password: hashedPassword },
  });
};

/**
 * Verify password reset token
 * @param {string} token - JWT reset token
 * @returns {Object} Decoded token payload
 * @throws {Error} If token is invalid or expired
 */
const verifyPasswordResetToken = (token) => {
  if (!process.env.JWT_SECRET) {
    const error = new Error('Error en la configuración del servidor. Por favor, contacta al soporte.');
    error.statusCode = 500;
    throw error;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (decoded.type !== 'password-reset') {
      const error = new Error('Invalid reset token');
      error.statusCode = 400;
      throw error;
    }

    return decoded;
  } catch (error) {
    if (error.statusCode) {
      throw error;
    }
    const authError = new Error('Invalid or expired reset token');
    authError.statusCode = 400;
    throw authError;
  }
};

/**
 * Add token to deny list to prevent reuse
 * @param {string} token - JWT token to invalidate
 * @returns {Promise<void>}
 */
const addTokenToDenyList = async (token) => {
  try {
    await prisma.tokenDenyList.create({
      data: { token }
    });
  } catch (error) {
    // If token already exists in deny list, that's fine
    if (error.code !== 'P2002') {
      throw error;
    }
  }
};

/**
 * Reset user password by ID
 * @param {number} userId - User ID
 * @param {string} newPassword - New password (plain text)
 * @returns {Promise<Object>} Updated user
 */
const resetUserPasswordById = async (userId, newPassword) => {
  const hashedPassword = await hashPassword(newPassword, 12);
  
  return await prisma.user.update({
    where: { id: userId },
    data: { password: hashedPassword }
  });
};

/**
 * Verify generic JWT token (for initial password setup)
 * @param {string} token - JWT token
 * @returns {Object} Decoded token payload
 * @throws {Error} If token is invalid or expired
 */
const verifyGenericToken = (token) => {
  if (!process.env.JWT_SECRET) {
    const error = new Error('Error en la configuración del servidor. Por favor, contacta al soporte.');
    error.statusCode = 500;
    throw error;
  }

  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    const authError = new Error('Invalid or expired token');
    authError.statusCode = 400;
    throw authError;
  }
};

/**
 * Update user with password and optional fields
 * @param {number} userId - User ID
 * @param {string} password - New password (plain text)
 * @param {string} [name] - User name (optional)
 * @param {string} [phoneNumber] - User phone number (optional)
 * @returns {Promise<Object>} Updated user
 */
const setUserPasswordAndInfo = async (userId, password, name, phoneNumber) => {
  const hashedPassword = await hashPassword(password, 12);
  
  const updateData = {
    password: hashedPassword
  };

  if (name) updateData.name = name;
  if (phoneNumber) updateData.phoneNumber = phoneNumber;

  return await prisma.user.update({
    where: { id: userId },
    data: updateData
  });
};

/**
 * Generate password reset token
 * @param {number} userId - User ID
 * @returns {string} JWT reset token
 * @throws {Error} If JWT_SECRET is not configured
 */
const generatePasswordResetToken = (userId) => {
  if (!process.env.JWT_SECRET) {
    const error = new Error('Error en la configuración del servidor. Por favor, contacta al soporte.');
    error.statusCode = 500;
    throw error;
  }

  return jwt.sign(
    { userId, type: 'password-reset' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
};

/**
 * Send password reset email with formatted HTML
 * @param {string} email - User email
 * @param {string} resetToken - Password reset token
 * @returns {Promise} Email sending result
 */
const sendPasswordResetEmail = async (email, resetToken) => {
  const baseUrl = process.env.FRONTEND_URL || 'https://www.gourmetjobs.cl';
  const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;

  return await sendEmail({
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
};

/**
 * Generate chat token
 * @param {Object} user - User object
 * @returns {string} Chat JWT token
 */
const generateChatToken = (user) => {
  const chatTokenPayload = {
    userId: user.id,
    userType: user.userType,
    tokenType: 'socket',
    ...(user.employee && { employeeId: user.employee.id }),
    ...(user.restaurantUsers?.[0] && {
      restaurantUserId: user.restaurantUsers[0].id,
      restaurantId: user.restaurantUsers[0].restaurantId
    }),
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (60 * 60), 
    aud: 'chat',
    iss: process.env.NODE_ENV === 'production' ? process.env.JWT_ISSUER : 'localhost',   
  };

  return jwt.sign(chatTokenPayload, process.env.JWT_SECRET);
};

/**
 * Update user profile
 * @param {number} userId - User ID
 * @param {Object} updateData - Data to update
 * @returns {Object} Updated user
 */
const updateUserProfile = async (userId, updateData) => {
  return await prisma.user.update({
    where: { 
      id: parseInt(userId) 
    },
    data: updateData,
    include: {
      restaurantUsers: true
    }
  });
};

/**
 * Check for email conflicts
 * @param {string} email - Email to check
 * @param {number} excludeUserId - User ID to exclude from check
 * @returns {Object|null} Conflicting user or null
 */
const checkEmailConflict = async (email, excludeUserId) => {
  return await prisma.user.findFirst({
    where: {
      email: email.toLowerCase(),
      NOT: {
        id: parseInt(excludeUserId)
      }
    }
  });
}; 

module.exports = {
  validateSignupInput,
  validateSigninInput,
  getUserByEmail,
  createUser,
  hashPassword,
  createUserWithSecurityDefaults,
  getRestaurantIdForUser,
  getUserForSignin,
  getRestaurantAccessForSignin,
  updateLastLogin,
  verifyPasswordWithTracking,
  verifyMFAIfEnabled,
  completeSuccessfulSignin,
  generateSignupToken,
  generateSigninToken,
  generatePasswordResetToken,
  verifyPassword,
  generateToken,
  verifyToken,
  getUserProfileImage,
  buildTokenPayload,
  getRestaurantUsers,
  getUserById,
  getUserBasicInfo,
  getAllUserRestaurants,
  getEmployeeIdForUser,
  verifyTokenFromCookie,
  formatUserRestaurants,
  getCurrentRestaurantUserId,
  verifyRestaurantAccess,
  generateSwitchRestaurantToken,
  getUserForLoginStatus,
  getConvertedProfileImageUrl,
  checkUserExists,
  sendConfirmationEmail,
  createOrUpdateUserWithPassword,
  createRestaurantUser,
  getUserWithDetails,
  getUserInfo,
  updateUserPassword,
  resetUserPasswordById,
  verifyPasswordResetToken,
  verifyGenericToken,
  setUserPasswordAndInfo,
  addTokenToDenyList,
  sendPasswordResetEmail,
  generateChatToken,
  updateUserProfile,
  checkEmailConflict,
}; 
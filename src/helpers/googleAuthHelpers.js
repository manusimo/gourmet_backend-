const { OAuth2Client } = require('google-auth-library');
const { prisma } = require('../db.js');
const jwt = require('jsonwebtoken');

/**
 * Verify Google OAuth token and extract user information
 * @param {string} credential - Google JWT token
 * @returns {Object} Google user payload
 */
const verifyGoogleToken = async (credential) => {
  const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
  
  const ticket = await client.verifyIdToken({
    idToken: credential,
    audience: process.env.GOOGLE_CLIENT_ID,
  });

  return ticket.getPayload();
};

/**
 * Find or create user from Google OAuth data
 * @param {Object} googlePayload - Google user data
 * @param {string} userType - User type (profesionales/empresas)
 * @returns {Object} User object
 */
const findOrCreateUser = async (googlePayload, userType) => {
  const { email, name, picture, given_name, family_name } = googlePayload;
  
  console.log(`🔍 Google OAuth: User ${email} attempting to sign in as ${userType}`);

  // Check if user already exists
  let user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() }
  });

  if (user) {
    return await handleExistingUser(user, userType, googlePayload);
  } else {
    return await createNewGoogleUser(googlePayload, userType);
  }
};

/**
 * Handle existing user login
 * @param {Object} user - Existing user
 * @param {string} userType - Requested user type
 * @param {Object} googlePayload - Google user data
 * @returns {Object} Updated user
 */
const handleExistingUser = async (user, userType, googlePayload) => {
  const { email, name, picture, given_name, family_name } = googlePayload;
  
  // Check if userType matches
  if (user.userType !== userType) {
    throw new Error(`This email is already registered as a ${user.userType === 'profesionales' ? 'professional' : 'company'} user. Please use the correct login option.`);
  }

  // Update user info from Google
  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: {
      name: given_name || name?.split(' ')[0] || 'Google User',
      surname: family_name || name?.split(' ').slice(1).join(' ') || '',
      lastLoginAt: new Date()
    }
  });

  console.log(`✅ Google OAuth: Existing user ${email} signed in successfully`);
  return updatedUser;
};

/**
 * Create new user from Google OAuth data
 * @param {Object} googlePayload - Google user data
 * @param {string} userType - User type
 * @returns {Object} New user
 */
const createNewGoogleUser = async (googlePayload, userType) => {
  const { email, name, picture, given_name, family_name } = googlePayload;
  
  const newUser = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      password: null, // No password for Google OAuth users
      userType,
      role: 'admin', // Default role
      name: given_name || name?.split(' ')[0] || 'Google User',
      surname: family_name || name?.split(' ').slice(1).join(' ') || '',
      phoneNumber: '+56900000000', // Default phone number
      mfaEnabled: false,
      mfaSecret: null,
      accountLocked: false,
      lastLoginAt: new Date(),
      loginAttempts: 0,
      securityNotifications: true
    }
  });

  console.log(`✅ Google OAuth: New user ${email} created and signed in successfully`);
  return newUser;
};

/**
 * Get restaurant access information for company users
 * @param {Object} user - User object
 * @returns {Object} Restaurant access info
 */
const getRestaurantAccess = async (user) => {
  let restaurantId = null;
  let restaurantUserId = null;

  if (user.userType === 'empresas') {
    // Check if user has restaurant access via RestaurantUser table
    const restaurantUser = await prisma.restaurantUser.findFirst({
      where: { userId: user.id },
      select: { id: true, restaurantId: true }
    });
    
    if (restaurantUser) {
      restaurantId = restaurantUser.restaurantId;
      restaurantUserId = restaurantUser.id;
    } else {
      // Check for direct ownership
      const restaurant = await prisma.restaurant.findUnique({
        where: { userId: user.id },
        select: { id: true }
      });
      if (restaurant) {
        restaurantId = restaurant.id;
      }
    }
  }

  return { restaurantId, restaurantUserId };
};

/**
 * Generate JWT token for authenticated user
 * @param {Object} user - User object
 * @param {Object} restaurantAccess - Restaurant access info
 * @returns {string} JWT token
 */
const generateAuthToken = (user, restaurantAccess) => {
  const { restaurantId, restaurantUserId } = restaurantAccess;
  
  return jwt.sign(
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
};

/**
 * Set authentication cookie
 * @param {Object} res - Express response object
 * @param {string} token - JWT token
 */
const setAuthCookie = (res, token) => {
  res.cookie('manu', token, {
    httpOnly: false, // Allow JavaScript access for development
    secure: false, // Allow over HTTP for development
    sameSite: 'lax',
    path: '/',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  });
};

/**
 * Format user response data
 * @param {Object} user - User object
 * @returns {Object} Formatted user data
 */
const formatUserResponse = (user) => {
  return {
    id: user.id,
    email: user.email,
    userType: user.userType,
    name: user.name,
    surname: user.surname
  };
};

/**
 * Complete Google OAuth authentication flow
 * @param {string} credential - Google JWT token
 * @param {string} userType - User type (profesionales/empresas)
 * @returns {Object} Authentication result
 */
const authenticateWithGoogle = async (credential, userType) => {
  try {
    // Verify Google token and get user data
    const googlePayload = await verifyGoogleToken(credential);
    
    // Find or create user
    const user = await findOrCreateUser(googlePayload, userType);
    
    // Get restaurant access info
    const restaurantAccess = await getRestaurantAccess(user);
    
    // Generate JWT token
    const token = generateAuthToken(user, restaurantAccess);
    
    return {
      success: true,
      user: formatUserResponse(user),
      token,
      isNewUser: !user.lastLoginAt || (new Date() - new Date(user.lastLoginAt)) > 60000
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Create authentication response
 * @param {Object} res - Express response object
 * @param {string} token - JWT token
 * @param {Object} user - User data
 * @param {boolean} isNewUser - Whether user is new
 * @returns {Object} Response object
 */
const createAuthResponse = (res, token, user, isNewUser) => {
  // Set authentication cookie
  setAuthCookie(res, token);
  
  return {
    success: true,
    message: 'Google sign-in successful',
    data: {
      user,
      token,
      isNewUser
    }
  };
};

module.exports = {
  verifyGoogleToken,
  findOrCreateUser,
  getRestaurantAccess,
  generateAuthToken,
  setAuthCookie,
  formatUserResponse,
  authenticateWithGoogle,
  createAuthResponse
};

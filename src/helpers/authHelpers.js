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
 * Create new user
 * @param {Object} userData - User data
 * @returns {Object} Created user
 */
const createUser = async (userData) => {
  const { email, password, userType, name, phoneNumber } = userData;
  const hashedPassword = await bcrypt.hash(password, 10);

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
 * Send password reset email
 * @param {string} email - User email
 * @returns {Promise} Email sending result
 */
const sendPasswordResetEmail = async (email) => {
  const resetToken = jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const resetLink = `http://localhost:3001/reset-password?token=${resetToken}`;
  const emailBody = `Click the link below to reset your password:\n\n${resetLink}`;

  return await sendEmail({
    to: email,
    subject: 'Password Reset Request',
    text: emailBody,
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
  verifyPassword,
  generateToken,
  verifyToken,
  getUserProfileImage,
  buildTokenPayload,
  getRestaurantUsers,
  getUserById,
  checkUserExists,
  sendConfirmationEmail,
  createOrUpdateUserWithPassword,
  createRestaurantUser,
  getUserWithDetails,
  getUserInfo,
  updateUserPassword,
  sendPasswordResetEmail,
  generateChatToken,
  updateUserProfile,
  checkEmailConflict,
}; 
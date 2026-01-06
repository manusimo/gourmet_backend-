const {
  checkUserExists,
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
  verifyPasswordResetToken,
  verifyGenericToken,
  resetUserPasswordById,
  setUserPasswordAndInfo,
  addTokenToDenyList,
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
  sendPasswordResetEmail,
  verifyPassword
} = require('../helpers/authHelpers.js');
const { convertImageKeyToSignedUrl } = require('../utils/imageUrlUtils.js');
const {
  isAccountLocked,
  recordFailedAttempt,
  resetAccountLockout,
  verifyMFAToken
} = require('../middleware/security.js');
const { Logger } = require('../middleware/errorTracking.js');
const { createAuthError } = require('../utils/responseHelpers.js');

/**
 * Service to handle authentication business logic
 * Orchestrates the signup flow using helper functions
 */
class AuthService {
  /**
   * Create a new user account
   * @param {Object} params - Signup parameters
   * @param {string} params.email - User email
   * @param {string} params.password - User password
   * @param {string} params.userType - User type (empresas/profesionales)
   * @param {string} [params.name] - User name
   * @param {string} [params.surname] - User surname
   * @param {string} [params.phoneNumber] - User phone number
   * @returns {Object} Created user and JWT token
   * @throws {Error} With appropriate error code and message
   */
  static async signup({ email, password, userType, name, surname, phoneNumber }) {
    const startTime = Date.now();
    const userEmail = email.toLowerCase();

    Logger.info('Signup attempt started', { email: userEmail, userType });

    // Check if user already exists
    const existingUser = await checkUserExists(userEmail);
    if (existingUser) {
      Logger.warn('Signup attempt with existing email', { email: userEmail });
      throw createAuthError(
        'Este email ya está registrado. Por favor, inicia sesión o utiliza otro email.',
        409,
        'EMAIL_ALREADY_EXISTS'
      );
    }

    // Hash password
    const hashedPassword = await hashPassword(password, 12);

    // Create user with security defaults
    let newUser;
    try {
      newUser = await createUserWithSecurityDefaults({
        email: userEmail,
        hashedPassword,
        userType,
        name,
        surname,
        phoneNumber
      });
    } catch (createError) {
      // Handle unique constraint violation (race condition)
      if (createError.code === 'P2002') {
        Logger.warn('Duplicate signup detected (race condition)', { email: userEmail });
        throw createAuthError(
          'Este email ya está registrado. Por favor, inicia sesión o utiliza otro email.',
          409,
          'EMAIL_ALREADY_EXISTS'
        );
      }

      Logger.error('User creation failed', { email: userEmail, error: createError.message, code: createError.code });
      throw createAuthError(
        'Error al crear tu cuenta. Por favor, intenta nuevamente.',
        500,
        createError.code
      );
    }

    // Get restaurant ID for company users (non-blocking)
    const restaurantId = newUser.userType === 'empresas' 
      ? await getRestaurantIdForUser(newUser.id) 
      : null;

    if (restaurantId) {
      Logger.info('Restaurant found for company user', { userId: newUser.id, restaurantId });
    }

    // Generate JWT token
    const token = generateSignupToken(newUser, restaurantId);

    Logger.info('Signup successful', {
      userId: newUser.id,
      email: userEmail,
      userType,
      duration: Date.now() - startTime
    });

    return {
      user: newUser,
      token,
      restaurantId
    };
  }

  /**
   * Authenticate user and create session
   * @param {Object} params - Signin parameters
   * @param {string} params.email - User email
   * @param {string} params.password - User password
   * @param {string} [params.mfaToken] - MFA token (required if MFA enabled)
   * @returns {Object} User data and JWT token
   * @throws {Error} With appropriate error code and message
   */
  static async signin({ email, password, mfaToken }) {
    const startTime = Date.now();
    const userEmail = email.toLowerCase();

    Logger.info('Signin attempt started', { email: userEmail });

    // Get user
    const user = await getUserForSignin(userEmail);
    if (!user) {
      Logger.warn('Signin attempt with non-existent email', { email: userEmail });
      throw createAuthError(
        'El usuario no existe. Verifica tu email e intenta nuevamente.',
        401
      );
    }

    // Check account lockout
    const lockoutStatus = isAccountLocked(user.id);
    if (lockoutStatus) {
      Logger.warn('Signin attempt on locked account', { userId: user.id, email: userEmail });
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

    // Verify password with tracking
    try {
      await verifyPasswordWithTracking(
        password,
        user,
        verifyPassword,
        recordFailedAttempt,
        createAuthError,
        lockoutStatus
      );
    } catch (error) {
      Logger.warn('Invalid password attempt', { userId: user.id, email: userEmail });
      throw error;
    }

    // Verify MFA if enabled
    try {
      verifyMFAIfEnabled(user, mfaToken, verifyMFAToken, recordFailedAttempt, createAuthError);
    } catch (error) {
      if (error.requiresMFA) {
        Logger.info('MFA required but not provided', { userId: user.id });
      } else {
        Logger.warn('Invalid MFA token', { userId: user.id });
      }
      throw error;
    }

    // Complete successful signin
    const result = await completeSuccessfulSignin(
      user,
      resetAccountLockout,
      updateLastLogin,
      getRestaurantAccessForSignin,
      generateSigninToken
    );

    Logger.info('Signin successful', {
      userId: user.id,
      email: userEmail,
      userType: user.userType,
      duration: Date.now() - startTime
    });

    return result;
  }

  /**
   * Request password reset - generates token and sends email
   * @param {Object} params - Password reset parameters
   * @param {string} params.email - User email
   * @returns {Object} Result with reset token (dev only)
   * @throws {Error} With appropriate error code and message
   */
  static async requestPasswordReset({ email }) {
    const userEmail = email.toLowerCase();

    Logger.info('Password reset request started', { email: userEmail });

    // Get user
    const user = await checkUserExists(userEmail);
    if (!user) {
      // Don't reveal if email exists or not (security best practice)
      Logger.info('Password reset requested for non-existent email', { email: userEmail });
      return {
        message: 'If the email exists, a reset link has been sent',
        resetToken: null
      };
    }

    // Check account lockout
    const lockoutStatus = isAccountLocked(user.id);
    if (lockoutStatus) {
      Logger.warn('Password reset requested for locked account', { userId: user.id, email: userEmail });
      throw createAuthError(
        'Account temporarily locked. Please try again later.',
        423
      );
    }

    // Generate reset token
    const resetToken = generatePasswordResetToken(user.id);

    // Send email (non-blocking)
    sendPasswordResetEmail(userEmail, resetToken)
      .catch(emailError => {
        Logger.error('Failed to send password reset email', {
          userId: user.id,
          email: userEmail,
          error: emailError.message
        });
      });

    Logger.info('Password reset email sent', { userId: user.id, email: userEmail });

    return {
      message: 'If the email exists, a reset link has been sent',
      resetToken: process.env.NODE_ENV === 'development' ? resetToken : null
    };
  }

  /**
   * Confirm password reset - verifies token and updates password
   * @param {Object} params - Password reset confirmation parameters
   * @param {string} params.token - Password reset token
   * @param {string} params.newPassword - New password
   * @returns {Object} Success message
   * @throws {Error} With appropriate error code and message
   */
  static async confirmPasswordReset({ token, newPassword }) {
    Logger.info('Password reset confirmation started');

    // Verify reset token
    let decoded;
    try {
      decoded = verifyPasswordResetToken(token);
    } catch (error) {
      Logger.warn('Invalid password reset token', { error: error.message });
      throw error;
    }

    // Check if user exists
    const user = await getUserById(decoded.userId);
    if (!user) {
      Logger.warn('Password reset for non-existent user', { userId: decoded.userId });
      throw createAuthError('User not found', 400);
    }

    // Reset password
    await resetUserPasswordById(decoded.userId, newPassword);

    // Add token to deny list to prevent reuse
    await addTokenToDenyList(token);

    // Reset any account lockout
    resetAccountLockout(decoded.userId);

    Logger.info('Password reset successful', { userId: decoded.userId });

    return {
      message: 'Password reset successful'
    };
  }

  /**
   * Set initial password for new users
   * @param {Object} params - Set password parameters
   * @param {string} params.token - JWT token (from email invitation)
   * @param {string} params.password - New password
   * @param {string} [params.name] - User name (optional)
   * @param {string} [params.phoneNumber] - User phone number (optional)
   * @returns {Object} User data and JWT token
   * @throws {Error} With appropriate error code and message
   */
  static async setPassword({ token, password, name, phoneNumber }) {
    Logger.info('Set password request started');

    // Verify token
    let decoded;
    try {
      decoded = verifyGenericToken(token);
    } catch (error) {
      Logger.warn('Invalid token for set password', { error: error.message });
      throw error;
    }

    // Get user
    const user = await getUserById(decoded.userId);
    if (!user) {
      Logger.warn('Set password for non-existent user', { userId: decoded.userId });
      throw createAuthError('User not found', 404);
    }

    // Update user with password and optional info
    await setUserPasswordAndInfo(decoded.userId, password, name, phoneNumber);

    // Generate new JWT token for the user
    const newToken = generateSigninToken(
      user,
      decoded.restaurantId || null,
      decoded.restaurantUserId || null
    );

    Logger.info('Password set successfully', { userId: user.id });

    return {
      message: 'Password set successfully',
      token: newToken,
      userType: user.userType,
      restaurantId: decoded.restaurantId || null
    };
  }

  /**
   * Get user information with authorization check
   * @param {Object} params - Get user parameters
   * @param {string|number} params.userId - User ID to retrieve
   * @param {string|number} params.requesterId - ID of user making the request
   * @param {string} params.requesterUserType - User type of requester
   * @returns {Object} User information
   * @throws {Error} With appropriate error code and message
   */
  static async getUser({ userId, requesterId, requesterUserType }) {
    const parsedUserId = parseInt(userId);
    const parsedRequesterId = parseInt(requesterId);

    Logger.info('Get user request', { userId: parsedUserId, requesterId: parsedRequesterId });

    // Check authorization - user can only access their own info unless admin
    if (parsedUserId !== parsedRequesterId && requesterUserType !== 'admin') {
      Logger.warn('Unauthorized user info access attempt', {
        userId: parsedUserId,
        requesterId: parsedRequesterId,
        requesterUserType
      });
      throw createAuthError('Access denied', 403);
    }

    // Get user with basic info
    const user = await getUserBasicInfo(parsedUserId);
    if (!user) {
      Logger.warn('User not found', { userId: parsedUserId });
      throw createAuthError('User not found', 404);
    }

    Logger.info('User info retrieved successfully', { userId: parsedUserId });

    return { user };
  }

  /**
   * Get current user info with restaurants and employee ID
   * @param {Object} params - Get user info parameters
   * @param {string} params.token - JWT token from cookie
   * @returns {Object} User info with restaurants and IDs
   * @throws {Error} With appropriate error code and message
   */
  static async getCurrentUserInfo({ token }) {
    Logger.info('Get current user info request started');

    // Verify token
    const decodedToken = verifyTokenFromCookie(token);
    const userId = decodedToken.userId;

    // Verify user still exists
    const userExists = await getUserById(userId);
    if (!userExists) {
      Logger.warn('User no longer exists', { userId });
      throw createAuthError('User no longer exists', 401);
    }

    // Get all restaurants for user
    const { restaurantUsers, ownedRestaurants } = await getAllUserRestaurants(userId);

    // Format restaurants with converted image URLs
    const restaurants = await formatUserRestaurants(
      restaurantUsers,
      ownedRestaurants,
      convertImageKeyToSignedUrl
    );

    // Determine current restaurantUserId
    const restaurantUserId = getCurrentRestaurantUserId(restaurants, decodedToken.restaurantId || null);

    // Get employee ID if exists
    const employeeId = await getEmployeeIdForUser(userId);

    Logger.info('User info retrieved successfully', {
      userId,
      restaurantCount: restaurants.length,
      hasEmployee: !!employeeId
    });

    return {
      userId,
      restaurantUserId,
      employeeId,
      userType: decodedToken.userType,
      restaurants
    };
  }

  /**
   * Switch user's active restaurant
   * @param {Object} params - Switch restaurant parameters
   * @param {string} params.token - JWT token from cookie
   * @param {string|number} params.restaurantId - Restaurant ID to switch to
   * @returns {Object} New token and restaurantUserId
   * @throws {Error} With appropriate error code and message
   */
  static async switchRestaurant({ token, restaurantId }) {
    Logger.info('Restaurant switch request started', { restaurantId });

    // Verify token
    const decodedToken = verifyTokenFromCookie(token);
    const userId = decodedToken.userId;
    const parsedRestaurantId = parseInt(restaurantId);

    if (!parsedRestaurantId || isNaN(parsedRestaurantId)) {
      throw createAuthError('Restaurant ID is required', 400);
    }

    // Verify user has access to this restaurant
    const restaurantUser = await verifyRestaurantAccess(
      userId,
      parsedRestaurantId,
      decodedToken.role
    );

    if (!restaurantUser) {
      Logger.warn('User attempted to switch to unauthorized restaurant', {
        userId,
        restaurantId: parsedRestaurantId
      });
      throw createAuthError('You do not have access to this restaurant', 403);
    }

    // Generate new token with selected restaurant
    const newToken = generateSwitchRestaurantToken(
      decodedToken,
      parsedRestaurantId,
      restaurantUser.id
    );

    Logger.info('Restaurant switched successfully', {
      userId,
      restaurantId: parsedRestaurantId,
      restaurantUserId: restaurantUser.id
    });

    return {
      message: 'Restaurant switched successfully',
      token: newToken,
      restaurantUserId: restaurantUser.id // null for admin users, actual ID for staff
    };
  }

  /**
   * Check if user is logged in and return user info
   * @param {Object} params - Check login status parameters
   * @param {string|null} params.token - JWT token from cookie (optional)
   * @returns {Object} Login status and user info
   */
  static async checkLoginStatus({ token }) {
    // No token means not logged in
    if (!token) {
      return {
        isLoggedIn: false,
        user: null
      };
    }

    try {
      // Verify token
      const decodedToken = verifyTokenFromCookie(token);

      // Get user with profile image data
      const user = await getUserForLoginStatus(decodedToken.userId);

      if (!user) {
        Logger.info('User not found for login status check', { userId: decodedToken.userId });
        return {
          isLoggedIn: false,
          user: null
        };
      }

      // Get and convert profile image URL
      const profileImageUrl = await getConvertedProfileImageUrl(user, convertImageKeyToSignedUrl);

      Logger.info('Login status check successful', { userId: user.id, userType: user.userType });

      return {
        isLoggedIn: true,
        user: {
          ...user,
          userId: user.id,
          profileImageUrl
        }
      };
    } catch (error) {
      // Invalid token means not logged in (don't log as error, it's expected)
      Logger.info('Invalid token for login status check', { error: error.message });
      return {
        isLoggedIn: false,
        user: null
      };
    }
  }
}

module.exports = AuthService;


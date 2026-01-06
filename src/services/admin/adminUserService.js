const Logger = require('../../utils/logger.js');
const { getRestaurantUsers } = require('../../helpers/authHelpers.js');
const { prisma } = require('../../db.js');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { sendEmail } = require('../../helpers/email.js');
const { isAccountLocked, resetAccountLockout } = require('../../middleware/security.js');
const { JWT_TOKEN_EXPIRY, DEFAULT_FRONTEND_URL } = require('./adminConstants.js');
const AdminDeletionService = require('./adminDeletionService.js');

/**
 * Admin User Service
 * Handles business logic for admin user-related operations
 */
class AdminUserService {
  /**
   * Get all users for a restaurant
   * @param {number} restaurantId - Restaurant ID
   * @returns {Promise<Array>} Array of users with restaurant user information
   * @throws {Error} If restaurantId is invalid or database error occurs
   */
  static async getRestaurantUsers(restaurantId) {
    Logger.info('Getting restaurant users', { restaurantId });

    // Validate restaurantId
    if (!restaurantId) {
      const error = new Error('Restaurant ID is required');
      error.statusCode = 400;
      error.code = 'MISSING_RESTAURANT_ID';
      throw error;
    }

    // Fetch restaurant users from database
    const restaurantUsers = await getRestaurantUsers(restaurantId);

    // Transform data to include user info with restaurant user metadata
    const users = restaurantUsers.map(restaurantUser => ({
      ...restaurantUser.user,
      restaurantUserId: restaurantUser.id,
      role: restaurantUser.role
    }));

    Logger.info('Restaurant users retrieved successfully', {
      restaurantId,
      userCount: users.length
    });

    return users;
  }

  /**
   * Create a new user for a restaurant
   * @param {Object} params - User creation parameters
   * @param {string} params.name - User name
   * @param {string} params.email - User email
   * @param {string} params.phoneNumber - User phone number
   * @param {number} params.restaurantId - Restaurant ID
   * @returns {Promise<Object>} Created user with restaurant user information
   * @throws {Error} If validation fails or user creation fails
   */
  static async createRestaurantUser({ name, email, phoneNumber, restaurantId }) {
    Logger.info('Creating restaurant user', { email, restaurantId });

    // Validate input
    this._validateCreateUserInput({ name, email, phoneNumber, restaurantId });

    // Check if user already exists
    await this._checkUserExists(email);

    // Generate temporary password and create user
    const { user: newUser, tempPassword } = await this._createUserWithTempPassword({
      name,
      email,
      phoneNumber
    });

    // Create restaurant user association
    const restaurantUser = await this._createRestaurantUserAssociation({
      userId: newUser.id,
      restaurantId
    });

    // Generate setup token and send welcome email
    await this._sendWelcomeEmail({
      name,
      email,
      tempPassword,
      userId: newUser.id,
      restaurantId,
      restaurantUserId: restaurantUser.id
    });

    Logger.info('Restaurant user created successfully', {
      userId: newUser.id,
      email: newUser.email,
      restaurantId
    });

    // Return user with restaurant user metadata
    return {
      ...newUser,
      restaurantUserId: restaurantUser.id,
      role: restaurantUser.role
    };
  }

  /**
   * Update a restaurant user's information
   * @param {Object} params - Update parameters
   * @param {number} params.userId - User ID to update
   * @param {number} params.restaurantId - Restaurant ID (for validation)
   * @param {string} [params.name] - Updated name (optional)
   * @param {string} [params.email] - Updated email (optional)
   * @param {string} [params.phoneNumber] - Updated phone number (optional)
   * @returns {Promise<Object>} Updated user
   * @throws {Error} If validation fails or update fails
   */
  static async updateRestaurantUser({ userId, restaurantId, name, email, phoneNumber }) {
    Logger.info('Updating restaurant user', { userId, restaurantId });

    // Validate and parse userId
    const parsedUserId = this._validateAndParseUserId(userId);

    // Validate restaurantId
    this._validateRestaurantId(restaurantId);

    // Verify user belongs to restaurant
    await this._verifyRestaurantUserAssociation(parsedUserId, restaurantId);

    // Build update data from provided fields
    const updateData = this._buildUpdateData({ name, email, phoneNumber });

    // If no fields to update, return current user
    if (Object.keys(updateData).length === 0) {
      return await this._getUserById(parsedUserId);
    }

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id: parsedUserId },
      data: updateData
    });

    Logger.info('Restaurant user updated successfully', {
      userId: parsedUserId,
      restaurantId,
      updatedFields: Object.keys(updateData)
    });

    return updatedUser;
  }

  /**
   * Delete a restaurant user
   * @param {Object} params - Delete parameters
   * @param {number} params.userId - User ID to delete
   * @param {number} params.restaurantId - Restaurant ID (for validation)
   * @returns {Promise<Object>} Deleted user information
   * @throws {Error} If validation fails or deletion fails
   */
  static async deleteRestaurantUser({ userId, restaurantId }) {
    Logger.info('Deleting restaurant user', { userId, restaurantId });

    // Validate and parse userId
    const parsedUserId = this._validateAndParseUserId(userId);

    // Validate restaurantId
    this._validateRestaurantId(restaurantId);

    // Get restaurant user with user data
    const restaurantUser = await this._getRestaurantUserWithUserData(parsedUserId, restaurantId);

    // Prevent deleting admin users (restaurant owners)
    this._preventAdminDeletion(restaurantUser.user.role);

    // Delete user and restaurant user association
    await this._deleteUserAndAssociation(parsedUserId, restaurantUser.id);

    Logger.info('Restaurant user deleted successfully', {
      userId: parsedUserId,
      restaurantId,
      email: restaurantUser.user.email
    });

    // Return deleted user information
    return {
      deletedUser: {
        id: restaurantUser.user.id,
        email: restaurantUser.user.email,
        role: restaurantUser.user.role
      }
    };
  }

  /**
   * Get a specific restaurant user by ID
   * @param {Object} params - Get user parameters
   * @param {number} params.userId - User ID
   * @param {number} params.restaurantId - Restaurant ID (for validation)
   * @returns {Promise<Object>} User with restaurant user information
   * @throws {Error} If validation fails or user not found
   */
  static async getRestaurantUserById({ userId, restaurantId }) {
    Logger.info('Getting restaurant user by ID', { userId, restaurantId });

    // Validate and parse userId
    const parsedUserId = this._validateAndParseUserId(userId);

    // Validate restaurantId
    this._validateRestaurantId(restaurantId);

    // Get restaurant user with full user details
    const restaurantUser = await this._getRestaurantUserWithFullDetails(parsedUserId, restaurantId);

    // Transform data to include restaurant user metadata
    const user = this._transformRestaurantUserData(restaurantUser);

    Logger.info('Restaurant user retrieved successfully', {
      userId: parsedUserId,
      restaurantId
    });

    return user;
  }

  /**
   * Get all users (professionals and company admins) with profile info and conversation counts
   * @returns {Promise<Object>} Users with profile information and conversation counts
   * @throws {Error} If database error occurs
   */
  static async getAllUsers() {
    Logger.info('Getting all users');

    try {
      // Fetch users with filters
      const users = await prisma.user.findMany({
        where: {
          OR: [
            { userType: 'profesionales' },
            { 
              AND: [
                { userType: 'empresas' },
                { role: 'admin' }
              ]
            }
          ]
        },
        select: {
          id: true,
          name: true,
          surname: true,
          email: true,
          phoneNumber: true,
          userType: true,
          role: true,
          createdAt: true,
          lastLoginAt: true,
          accountLocked: true,
          mfaEnabled: true,
          employee: {
            select: {
              id: true
            }
          }
        },
        orderBy: {
          id: 'desc' // Order by ID desc to show newest users first
        }
      });

      // Map users to include hasEmployeeProfile flag and conversation counts
      const usersWithProfileInfo = await Promise.all(
        users.map(user => this._buildUserWithProfileInfo(user))
      );

      Logger.info('All users retrieved successfully', {
        total: usersWithProfileInfo.length
      });

      return {
        users: usersWithProfileInfo,
        total: usersWithProfileInfo.length
      };
    } catch (error) {
      Logger.error('Error getting all users', { error: error.message, stack: error.stack });
      throw error;
    }
  }

  /**
   * Get all flagged users (users with locked accounts)
   * @returns {Promise<Object>} Flagged users with lockout information
   * @throws {Error} If database error occurs
   */
  static async getFlaggedUsers() {
    Logger.info('Getting flagged users');

    try {
      // Get all users with lockout information
      const users = await prisma.user.findMany({
        select: {
          id: true,
          name: true,
          email: true,
          userType: true,
          role: true,
          lastLoginAt: true,
          createdAt: true
        }
      });

      // Check which users are currently locked
      const flaggedUsers = [];
      
      for (const user of users) {
        const lockoutStatus = isAccountLocked(user.id);
        if (lockoutStatus) {
          flaggedUsers.push({
            ...user,
            attempts: lockoutStatus.attempts,
            lockUntil: lockoutStatus.lockUntil,
            remainingTime: lockoutStatus.remainingTime
          });
        }
      }

      Logger.info('Flagged users retrieved successfully', {
        total: flaggedUsers.length
      });

      return {
        flaggedUsers,
        total: flaggedUsers.length
      };
    } catch (error) {
      Logger.error('Error getting flagged users', { error: error.message, stack: error.stack });
      throw error;
    }
  }

  /**
   * Unflag a user (reset account lockout)
   * @param {Object} params - Unflag parameters
   * @param {number} params.userId - User ID to unflag
   * @returns {Promise<Object>} Unlocked user information
   * @throws {Error} If validation fails or unlock fails
   */
  static async unflagUser({ userId }) {
    Logger.info('Unflagging user', { userId });

    // Validate userId
    if (!userId) {
      const error = new Error('User ID is required');
      error.statusCode = 400;
      error.code = 'MISSING_USER_ID';
      throw error;
    }

    const parsedUserId = parseInt(userId, 10);
    if (isNaN(parsedUserId)) {
      const error = new Error('Invalid user ID');
      error.statusCode = 400;
      error.code = 'INVALID_USER_ID';
      throw error;
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: parsedUserId },
      select: { id: true, email: true, name: true }
    });

    if (!user) {
      const error = new Error('User not found');
      error.statusCode = 404;
      error.code = 'USER_NOT_FOUND';
      throw error;
    }

    // Reset the account lockout
    const resetResult = resetAccountLockout(parsedUserId);
    
    if (!resetResult.success) {
      const error = new Error('User was not locked or could not be unlocked');
      error.statusCode = 400;
      error.code = 'UNLOCK_FAILED';
      throw error;
    }

    Logger.info('User unflagged successfully', {
      userId: parsedUserId,
      email: user.email
    });

    return {
      message: `User ${user.email} has been successfully unlocked`,
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      }
    };
  }

  /**
   * Delete a user and all related data
   * @param {Object} params - Delete parameters
   * @param {number} params.userId - User ID to delete
   * @param {number} params.currentUserId - Current admin user ID (to prevent self-deletion)
   * @returns {Promise<Object>} Deleted user information
   * @throws {Error} If validation fails or deletion fails
   */
  static async deleteUser({ userId, currentUserId }) {
    Logger.info('Deleting user and all related data', { userId, currentUserId });

    // Validate userId
    if (!userId) {
      const error = new Error('User ID is required');
      error.statusCode = 400;
      error.code = 'MISSING_USER_ID';
      throw error;
    }

    const parsedUserId = parseInt(userId, 10);
    if (isNaN(parsedUserId)) {
      const error = new Error('Invalid user ID');
      error.statusCode = 400;
      error.code = 'INVALID_USER_ID';
      throw error;
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: parsedUserId },
      select: { id: true, email: true, name: true, userType: true }
    });

    if (!user) {
      const error = new Error('User not found');
      error.statusCode = 404;
      error.code = 'USER_NOT_FOUND';
      throw error;
    }

    // Prevent deleting the current admin user
    if (parsedUserId === currentUserId) {
      const error = new Error('Cannot delete your own account');
      error.statusCode = 400;
      error.code = 'CANNOT_DELETE_SELF';
      throw error;
    }

    // Start a transaction to delete all related data
    await prisma.$transaction(async (tx) => {
      // Delete related data based on user type
      if (user.userType === 'empresas') {
        await AdminDeletionService.deleteEmpresasUserData(tx, parsedUserId);
      } else if (user.userType === 'profesionales') {
        await AdminDeletionService.deleteProfesionalesUserData(tx, parsedUserId);
      }

      // Delete AI agent related data
      await tx.agentConversation.deleteMany({ where: { userId: parsedUserId } });
      await tx.aiAgent.deleteMany({ where: { createdByUserId: parsedUserId } });
      
      // Delete notifications
      await tx.notification.deleteMany({ where: { userId: parsedUserId } });
      
      // Finally, delete the user
      await tx.user.delete({ where: { id: parsedUserId } });
    });

    Logger.info('User and all related data deleted successfully', {
      userId: parsedUserId,
      email: user.email,
      userType: user.userType
    });

    return {
      message: `User ${user.email} and all related data deleted successfully`,
      deletedUser: {
        id: user.id,
        email: user.email,
        name: user.name,
        userType: user.userType
      }
    };
  }

  // ========== Private Helper Methods ==========

  /**
   * Validate create user input
   * @param {Object} params - Input parameters
   * @private
   */
  static _validateCreateUserInput({ name, email, phoneNumber, restaurantId }) {
    if (!name || !email || !phoneNumber) {
      const error = new Error('Name, email, and phone number are required');
      error.statusCode = 400;
      error.code = 'MISSING_REQUIRED_FIELDS';
      throw error;
    }

    if (!restaurantId) {
      const error = new Error('Restaurant ID is required');
      error.statusCode = 400;
      error.code = 'MISSING_RESTAURANT_ID';
      throw error;
    }
  }

  /**
   * Check if user already exists
   * @param {string} email - User email
   * @private
   * @throws {Error} If user already exists
   */
  static async _checkUserExists(email) {
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (existingUser) {
      const error = new Error('User with this email already exists');
      error.statusCode = 400;
      error.code = 'USER_ALREADY_EXISTS';
      throw error;
    }
  }

  /**
   * Create user with temporary password
   * @param {Object} params - User data
   * @returns {Promise<Object>} Created user and temporary password
   * @private
   */
  static async _createUserWithTempPassword({ name, email, phoneNumber }) {
    // Generate temporary password
    const tempPassword = crypto.randomBytes(10).toString('hex');
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    // Create user
    const user = await prisma.user.create({
      data: {
        name,
        email: email.toLowerCase(),
        phoneNumber,
        password: hashedPassword,
        userType: 'empresas',
        role: 'staff',
        mfaEnabled: false,
        accountLocked: false,
        loginAttempts: 0,
        securityNotifications: false
      }
    });

    return { user, tempPassword };
  }

  /**
   * Create restaurant user association
   * @param {Object} params - Association parameters
   * @param {number} params.userId - User ID
   * @param {number} params.restaurantId - Restaurant ID
   * @returns {Promise<Object>} Created restaurant user
   * @private
   */
  static async _createRestaurantUserAssociation({ userId, restaurantId }) {
    return await prisma.restaurantUser.create({
      data: {
        userId,
        restaurantId,
        role: 'staff'
      }
    });
  }

  /**
   * Generate setup token and send welcome email
   * @param {Object} params - Email parameters
   * @param {string} params.name - User name
   * @param {string} params.email - User email
   * @param {string} params.tempPassword - Temporary password
   * @param {number} params.userId - User ID
   * @param {number} params.restaurantId - Restaurant ID
   * @param {number} params.restaurantUserId - Restaurant user ID
   * @private
   */
  static async _sendWelcomeEmail({ name, email, tempPassword, userId, restaurantId, restaurantUserId }) {
    const setupUrl = this._generateSetupUrl({ userId, restaurantId, restaurantUserId });
    const emailContent = this._buildWelcomeEmailContent({ name, tempPassword, setupUrl });

    // Send welcome email (non-blocking - don't fail if email fails)
    try {
      await sendEmail({
        to: email,
        subject: 'Bienvenido a GourmetJobs - Tu cuenta ha sido creada',
        text: emailContent.text,
        html: emailContent.html
      });
      Logger.info('Welcome email sent successfully', { email });
    } catch (emailError) {
      Logger.error('Failed to send welcome email', { email, error: emailError.message });
      // Don't throw - user creation succeeded, email is secondary
    }
  }

  /**
   * Generate setup URL with JWT token
   * @param {Object} params - Token parameters
   * @param {number} params.userId - User ID
   * @param {number} params.restaurantId - Restaurant ID
   * @param {number} params.restaurantUserId - Restaurant user ID
   * @returns {string} Setup URL
   * @private
   */
  static _generateSetupUrl({ userId, restaurantId, restaurantUserId }) {
    const token = jwt.sign(
      {
        userId,
        userType: 'empresas',
        role: 'staff',
        restaurantId,
        restaurantUserId
      },
      process.env.JWT_SECRET,
      { expiresIn: JWT_TOKEN_EXPIRY }
    );

    const baseUrl = process.env.FRONTEND_URL || DEFAULT_FRONTEND_URL;
    return `${baseUrl}/set-password?token=${token}`;
  }

  /**
   * Build welcome email content (text and HTML)
   * @param {Object} params - Email content parameters
   * @param {string} params.name - User name
   * @param {string} params.tempPassword - Temporary password
   * @param {string} params.setupUrl - Setup URL
   * @returns {Object} Email content with text and html
   * @private
   */
  static _buildWelcomeEmailContent({ name, tempPassword, setupUrl }) {
    const text = `Hola ${name},\n\nTu cuenta ha sido creada exitosamente en GourmetJobs.\n\nTu contraseña temporal es: ${tempPassword}\n\nConfigura tu contraseña aquí: ${setupUrl}\n\nPor favor, cambia tu contraseña después de iniciar sesión por primera vez.\n\nSaludos,\nEl equipo de GourmetJobs`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #fb5424;">Bienvenido a GourmetJobs</h2>
        <p>Hola <strong>${name}</strong>,</p>
        <p>Tu cuenta ha sido creada exitosamente en GourmetJobs.</p>
    
        <div style="text-align: center; margin: 30px 0;">
          <a href="${setupUrl}" style="background-color: #fb5424; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Configurar Contraseña</a>
        </div>
        <p><strong>Importante:</strong> Por favor, cambia tu contraseña después de iniciar sesión por primera vez.</p>
        <p>Saludos,<br>El equipo de GourmetJobs</p>
      </div>
    `;

    return { text, html };
  }

  /**
   * Validate and parse user ID
   * @param {number|string} userId - User ID
   * @returns {number} Parsed user ID
   * @private
   * @throws {Error} If userId is invalid
   */
  static _validateAndParseUserId(userId) {
    if (!userId) {
      const error = new Error('User ID is required');
      error.statusCode = 400;
      error.code = 'MISSING_USER_ID';
      throw error;
    }

    const parsedUserId = parseInt(userId, 10);
    if (isNaN(parsedUserId)) {
      const error = new Error('Invalid user ID');
      error.statusCode = 400;
      error.code = 'INVALID_USER_ID';
      throw error;
    }

    return parsedUserId;
  }

  /**
   * Validate restaurant ID
   * @param {number} restaurantId - Restaurant ID
   * @private
   * @throws {Error} If restaurantId is invalid
   */
  static _validateRestaurantId(restaurantId) {
    if (!restaurantId) {
      const error = new Error('Restaurant ID is required');
      error.statusCode = 400;
      error.code = 'MISSING_RESTAURANT_ID';
      throw error;
    }
  }

  /**
   * Verify user belongs to restaurant
   * @param {number} userId - User ID
   * @param {number} restaurantId - Restaurant ID
   * @private
   * @throws {Error} If user doesn't belong to restaurant
   */
  static async _verifyRestaurantUserAssociation(userId, restaurantId) {
    const restaurantUser = await prisma.restaurantUser.findFirst({
      where: {
        userId,
        restaurantId
      }
    });

    if (!restaurantUser) {
      const error = new Error('User not found or not associated with this restaurant');
      error.statusCode = 404;
      error.code = 'USER_NOT_FOUND';
      throw error;
    }
  }

  /**
   * Build update data object from provided fields
   * @param {Object} fields - Update fields
   * @param {string} [fields.name] - Name
   * @param {string} [fields.email] - Email
   * @param {string} [fields.phoneNumber] - Phone number
   * @returns {Object} Update data object
   * @private
   */
  static _buildUpdateData({ name, email, phoneNumber }) {
    const updateData = {};

    if (name !== undefined && name !== null) {
      updateData.name = name;
    }
    if (email !== undefined && email !== null) {
      updateData.email = email.toLowerCase();
    }
    if (phoneNumber !== undefined && phoneNumber !== null) {
      updateData.phoneNumber = phoneNumber;
    }

    return updateData;
  }

  /**
   * Get user by ID
   * @param {number} userId - User ID
   * @returns {Promise<Object>} User
   * @private
   * @throws {Error} If user not found
   */
  static async _getUserById(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });
    
    if (!user) {
      const error = new Error('User not found');
      error.statusCode = 404;
      error.code = 'USER_NOT_FOUND';
      throw error;
    }

    return user;
  }

  /**
   * Get restaurant user with user data
   * @param {number} userId - User ID
   * @param {number} restaurantId - Restaurant ID
   * @returns {Promise<Object>} Restaurant user with user data
   * @private
   * @throws {Error} If user not found or not associated with restaurant
   */
  static async _getRestaurantUserWithUserData(userId, restaurantId) {
    const restaurantUser = await prisma.restaurantUser.findFirst({
      where: {
        userId,
        restaurantId
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true
          }
        }
      }
    });

    if (!restaurantUser) {
      const error = new Error('User not found or not associated with this restaurant');
      error.statusCode = 404;
      error.code = 'USER_NOT_FOUND';
      throw error;
    }

    return restaurantUser;
  }

  /**
   * Prevent deletion of admin users
   * @param {string} role - User role
   * @private
   * @throws {Error} If user is admin
   */
  static _preventAdminDeletion(role) {
    if (role === 'admin') {
      const error = new Error('Cannot delete the restaurant owner (admin user)');
      error.statusCode = 403;
      error.code = 'CANNOT_DELETE_ADMIN';
      throw error;
    }
  }

  /**
   * Delete user and restaurant user association
   * @param {number} userId - User ID
   * @param {number} restaurantUserId - Restaurant user ID
   * @private
   */
  static async _deleteUserAndAssociation(userId, restaurantUserId) {
    // Delete restaurant user association first
    await prisma.restaurantUser.delete({
      where: { id: restaurantUserId }
    });

    // Delete the user
    await prisma.user.delete({
      where: { id: userId }
    });
  }

  /**
   * Get restaurant user with full user details
   * @param {number} userId - User ID
   * @param {number} restaurantId - Restaurant ID
   * @returns {Promise<Object>} Restaurant user with full user details
   * @private
   * @throws {Error} If user not found or not associated with restaurant
   */
  static async _getRestaurantUserWithFullDetails(userId, restaurantId) {
    const restaurantUser = await prisma.restaurantUser.findFirst({
      where: {
        userId,
        restaurantId
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phoneNumber: true,
            role: true
          }
        }
      }
    });

    if (!restaurantUser) {
      const error = new Error('User not found or not associated with this restaurant');
      error.statusCode = 404;
      error.code = 'USER_NOT_FOUND';
      throw error;
    }

    return restaurantUser;
  }

  /**
   * Transform restaurant user data to include metadata
   * @param {Object} restaurantUser - Restaurant user with user data
   * @returns {Object} Transformed user data
   * @private
   */
  static _transformRestaurantUserData(restaurantUser) {
    return {
      ...restaurantUser.user,
      restaurantUserId: restaurantUser.id,
      role: restaurantUser.role
    };
  }

  /**
   * Build user object with profile info and conversation count
   * @param {Object} user - User object from database
   * @returns {Promise<Object>} User with profile info and conversation count
   * @private
   */
  static async _buildUserWithProfileInfo(user) {
    const conversationCount = await this._getUserConversationCount(user);
    
    return {
      ...user,
      hasEmployeeProfile: user.userType === 'profesionales' ? (user.employee !== null) : null,
      conversationCount
    };
  }

  /**
   * Get conversation count for a user based on their type
   * @param {Object} user - User object
   * @returns {Promise<number>} Conversation count
   * @private
   */
  static async _getUserConversationCount(user) {
    if (user.userType === 'profesionales' && user.employee) {
      return this._getProfessionalConversationCount(user.employee.id);
    } else if (user.userType === 'empresas') {
      return this._getCompanyConversationCount(user.id);
    }
    return 0;
  }

  /**
   * Get conversation count for a professional user
   * @param {number} employeeId - Employee ID
   * @returns {Promise<number>} Conversation count
   * @private
   */
  static async _getProfessionalConversationCount(employeeId) {
    return prisma.conversation.count({
      where: {
        employeeId,
        deletedAt: null
      }
    });
  }

  /**
   * Get conversation count for a company user
   * @param {number} userId - User ID
   * @returns {Promise<number>} Conversation count
   * @private
   */
  static async _getCompanyConversationCount(userId) {
    const restaurantUsers = await prisma.restaurantUser.findMany({
      where: { userId },
      select: { id: true }
    });
    
    if (restaurantUsers.length === 0) {
      return 0;
    }
    
    const restaurantUserIds = restaurantUsers.map(ru => ru.id);
    return prisma.conversation.count({
      where: {
        restaurantUserId: { in: restaurantUserIds },
        deletedAt: null
      }
    });
  }
}

module.exports = AdminUserService;


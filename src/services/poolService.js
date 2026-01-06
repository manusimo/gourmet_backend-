const Logger = require('../utils/logger.js');
const { convertImageUrls } = require('../utils/imageUrlUtils.js');
const {
  checkTalentPoolEntry,
  createTalentPoolEntry,
  findOrCreateRestaurantUser,
  getRestaurantByUserId,
  upsertAdminRestaurantUser,
  buildTalentPoolFilters,
  deleteTalentPoolEntry: deleteTalentPoolEntryHelper,
  approveTalentPoolEntry: approveTalentPoolEntryHelper
} = require('../helpers/poolHelpers.js');
const { getTalentPool } = require('../helpers/pool.js');

/**
 * Pool Service
 * Handles business logic for talent pool operations
 */
class PoolService {
  /**
   * Check if a talent pool entry exists for an employee and restaurant
   * @param {Object} params - Check talent pool parameters
   * @param {string|number} params.employeeId - Employee ID
   * @param {number} params.restaurantId - Restaurant ID
   * @returns {Promise<Object>} Object with exists boolean
   * @throws {Error} If validation fails
   */
  static async checkTalentPoolEntry({ employeeId, restaurantId }) {
    Logger.info('Checking talent pool entry', { employeeId, restaurantId });

    if (!employeeId) {
      const error = new Error('Employee ID is required');
      error.statusCode = 400;
      error.code = 'MISSING_EMPLOYEE_ID';
      throw error;
    }

    if (!restaurantId) {
      const error = new Error('Restaurant ID is required');
      error.statusCode = 400;
      error.code = 'MISSING_RESTAURANT_ID';
      throw error;
    }

    const existingEntry = await checkTalentPoolEntry(employeeId, restaurantId);

    const exists = !!existingEntry;

    Logger.info('Talent pool entry check completed', {
      employeeId,
      restaurantId,
      exists
    });

    return { exists };
  }

  /**
   * Validate parameters for adding to talent pool
   * @param {string|number} employeeId - Employee ID
   * @param {number} userId - User ID
   * @throws {Error} If validation fails
   * @private
   */
  static _validateAddToTalentPoolParams(employeeId, userId) {
    if (!employeeId) {
      const error = new Error('Employee ID is required');
      error.statusCode = 400;
      error.code = 'MISSING_EMPLOYEE_ID';
      throw error;
    }

    if (!userId) {
      const error = new Error('User ID is required');
      error.statusCode = 401;
      error.code = 'MISSING_USER_ID';
      throw error;
    }
  }

  /**
   * Resolve restaurant and restaurant user from request body
   * @param {number} userId - User ID
   * @param {number} bodyRestaurantId - Restaurant ID from request body
   * @returns {Promise<Object>} Object with restaurantId and restaurantUserId
   * @private
   */
  static async _resolveRestaurantFromBody(userId, bodyRestaurantId) {
    Logger.info('Using restaurantId from request body', { bodyRestaurantId });
    const restaurantId = parseInt(bodyRestaurantId);
    const restaurantUserId = await findOrCreateRestaurantUser(userId, restaurantId);
    Logger.info('Restaurant user resolved', { restaurantUserId });
    return { restaurantId, restaurantUserId };
  }

  /**
   * Resolve restaurant and restaurant user from JWT (legacy fallback)
   * @param {number} userId - User ID
   * @returns {Promise<Object>} Object with restaurantId and restaurantUserId
   * @throws {Error} If restaurant not found
   * @private
   */
  static async _resolveRestaurantFromJWT(userId) {
    Logger.info('No restaurantId in body, using JWT fallback');
    const restaurant = await getRestaurantByUserId(userId);

    if (!restaurant) {
      const error = new Error('Restaurant not found for user');
      error.statusCode = 404;
      error.code = 'RESTAURANT_NOT_FOUND';
      throw error;
    }

    const adminRestaurantUser = await upsertAdminRestaurantUser(userId, restaurant.id);
    Logger.info('Restaurant and restaurant user resolved from JWT', {
      restaurantId: restaurant.id,
      restaurantUserId: adminRestaurantUser.id
    });

    return {
      restaurantId: restaurant.id,
      restaurantUserId: adminRestaurantUser.id
    };
  }

  /**
   * Ensure talent pool entry does not already exist
   * @param {string|number} employeeId - Employee ID
   * @param {number} restaurantId - Restaurant ID
   * @throws {Error} If entry already exists
   * @private
   */
  static async _ensureTalentPoolEntryDoesNotExist(employeeId, restaurantId) {
    const existingEntry = await checkTalentPoolEntry(employeeId, restaurantId);
    if (existingEntry) {
      const error = new Error('Employee already exists in the talent pool');
      error.statusCode = 409;
      error.code = 'TALENT_POOL_ENTRY_EXISTS';
      throw error;
    }
  }

  /**
   * Add employee to talent pool
   * @param {Object} params - Add to talent pool parameters
   * @param {string|number} params.employeeId - Employee ID
   * @param {number} [params.bodyRestaurantId] - Restaurant ID from request body (optional)
   * @param {number} params.userId - User ID from JWT
   * @returns {Promise<Object>} Created talent pool entry
   * @throws {Error} If validation fails, already exists, or creation fails
   */
  static async addToTalentPool({ employeeId, bodyRestaurantId, userId }) {
    Logger.info('Adding employee to talent pool', { employeeId, bodyRestaurantId, userId });

    // Validate parameters
    this._validateAddToTalentPoolParams(employeeId, userId);

    // Resolve restaurant and restaurant user
    const { restaurantId, restaurantUserId } = bodyRestaurantId
      ? await this._resolveRestaurantFromBody(userId, bodyRestaurantId)
      : await this._resolveRestaurantFromJWT(userId);

    // Ensure entry doesn't already exist
    await this._ensureTalentPoolEntryDoesNotExist(employeeId, restaurantId);

    // Create talent pool entry
    const talentEntry = await createTalentPoolEntry({
      employeeId,
      restaurantId,
      restaurantUserId
    });

    Logger.info('Talent pool entry created successfully', {
      employeeId,
      restaurantId,
      talentPoolId: talentEntry.id
    });

    return talentEntry;
  }

  /**
   * Resolve restaurant ID from query parameter or JWT token
   * @param {number} [queryRestaurantId] - Restaurant ID from query parameter
   * @param {number} [jwtRestaurantId] - Restaurant ID from JWT token
   * @returns {number} Resolved restaurant ID
   * @private
   */
  static _resolveRestaurantId(queryRestaurantId, jwtRestaurantId) {
    return queryRestaurantId ? parseInt(queryRestaurantId) : jwtRestaurantId;
  }

  /**
   * Validate restaurant ID
   * @param {number} restaurantId - Restaurant ID to validate
   * @throws {Error} If restaurant ID is missing
   * @private
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
   * Build filter object from query parameters
   * @param {Object} filterParams - Filter parameters
   * @param {string} [filterParams.position] - Position filter
   * @param {string} [filterParams.experience] - Experience filter
   * @param {string} [filterParams.region] - Region filter
   * @param {string} [filterParams.comuna] - Comuna filter
   * @param {string} [filterParams.available] - Available filter
   * @param {string} [filterParams.schedule] - Schedule filter
   * @returns {Object} Filter object
   * @private
   */
  static _buildTalentPoolFilters({ position, experience, region, comuna, available, schedule }) {
    return buildTalentPoolFilters({
      position,
      experience,
      region,
      comuna,
      available,
      schedule
    });
  }

  /**
   * Convert employee profile image URLs to signed URLs
   * @param {Array} talentPool - Array of talent pool entries
   * @returns {Promise<Array>} Array of talent pool entries with converted image URLs
   * @private
   */
  static async _convertTalentPoolImageUrls(talentPool) {
    return await Promise.all(
      talentPool.map(async (talent) => {
        const convertedTalent = { ...talent };
        if (talent.employee) {
          convertedTalent.employee = await convertImageUrls(talent.employee, ['profileImageUrl']);
        }
        return convertedTalent;
      })
    );
  }

  /**
   * Get talent pool with filters
   * @param {Object} params - Get talent pool parameters
   * @param {number} [params.queryRestaurantId] - Restaurant ID from query parameter (optional)
   * @param {number} [params.jwtRestaurantId] - Restaurant ID from JWT token (optional)
   * @param {string} [params.position] - Position filter
   * @param {string} [params.experience] - Experience filter
   * @param {string} [params.region] - Region filter
   * @param {string} [params.comuna] - Comuna filter
   * @param {string} [params.available] - Available filter
   * @param {string} [params.schedule] - Schedule filter
   * @returns {Promise<Array>} Array of talent pool entries with converted image URLs
   * @throws {Error} If validation fails or fetching fails
   */
  static async getTalentPool({ queryRestaurantId, jwtRestaurantId, position, experience, region, comuna, available, schedule }) {
    // Resolve restaurant ID
    const restaurantId = this._resolveRestaurantId(queryRestaurantId, jwtRestaurantId);

    Logger.info('Fetching talent pool', {
      restaurantId,
      source: queryRestaurantId ? 'query parameter' : 'JWT token',
      filters: { position, experience, region, comuna, available, schedule }
    });

    // Validate restaurant ID
    this._validateRestaurantId(restaurantId);

    // Build filters
    const filter = this._buildTalentPoolFilters({
      position,
      experience,
      region,
      comuna,
      available,
      schedule
    });

    // Fetch talent pool
    const talentPool = await getTalentPool(restaurantId, filter);

    Logger.info('Talent pool fetched', {
      restaurantId,
      count: talentPool.length
    });

    // Convert employee profile image URLs to signed URLs
    const talentsWithSignedUrls = await this._convertTalentPoolImageUrls(talentPool);

    Logger.info('Talent pool image URLs converted', {
      restaurantId,
      count: talentsWithSignedUrls.length
    });

    return talentsWithSignedUrls;
  }

  /**
   * Validate and parse talent pool entry ID
   * @param {string|number} talentId - Talent pool entry ID
   * @returns {number} Parsed talent pool entry ID
   * @throws {Error} If validation fails
   * @private
   */
  static _validateAndParseTalentId(talentId) {
    if (!talentId) {
      const error = new Error('Talent pool entry ID is required');
      error.statusCode = 400;
      error.code = 'MISSING_TALENT_ID';
      throw error;
    }

    const parsedTalentId = parseInt(talentId, 10);
    if (isNaN(parsedTalentId)) {
      const error = new Error('Invalid talent pool entry ID');
      error.statusCode = 400;
      error.code = 'INVALID_TALENT_ID';
      throw error;
    }

    return parsedTalentId;
  }

  /**
   * Handle "not found" error from talent pool operations
   * @param {Error} error - Original error
   * @throws {Error} Structured not found error
   * @private
   */
  static _handleTalentPoolNotFoundError(error) {
    if (error.message === 'Talent not found in the pool or already deleted.') {
      const notFoundError = new Error('Talent not found in the pool or already deleted');
      notFoundError.statusCode = 404;
      notFoundError.code = 'TALENT_POOL_ENTRY_NOT_FOUND';
      throw notFoundError;
    }
    throw error;
  }

  /**
   * Delete (soft delete) talent pool entry and associated conversations
   * @param {Object} params - Delete talent pool parameters
   * @param {string|number} params.talentId - Talent pool entry ID
   * @returns {Promise<Object>} Soft deleted talent pool entry
   * @throws {Error} If validation fails or deletion fails
   */
  static async deleteTalentPoolEntry({ talentId }) {
    Logger.info('Deleting talent pool entry', { talentId });

    // Validate and parse talent ID
    const parsedTalentId = this._validateAndParseTalentId(talentId);

    try {
      // Delete talent pool entry (soft delete with cascade)
      const deletedEntry = await deleteTalentPoolEntryHelper(parsedTalentId);

      Logger.info('Talent pool entry deleted successfully', {
        talentId: parsedTalentId
      });

      return deletedEntry;
    } catch (error) {
      // Handle specific "not found" error from helper
      this._handleTalentPoolNotFoundError(error);
    }
  }

  /**
   * Approve talent pool entry
   * @param {Object} params - Approve talent pool parameters
   * @param {string|number} params.talentId - Talent pool entry ID
   * @param {number} [params.restaurantUserId] - Restaurant user ID (optional)
   * @returns {Promise<Object>} Updated talent pool entry
   * @throws {Error} If validation fails or approval fails
   */
  static async approveTalentPoolEntry({ talentId, restaurantUserId }) {
    Logger.info('Approving talent pool entry', { talentId, restaurantUserId });

    // Validate and parse talent ID
    const parsedTalentId = this._validateAndParseTalentId(talentId);

    // Approve talent pool entry
    const approvedEntry = await approveTalentPoolEntryHelper(parsedTalentId, restaurantUserId);

    Logger.info('Talent pool entry approved successfully', {
      talentId: parsedTalentId,
      restaurantUserId
    });

    return approvedEntry;
  }
}

module.exports = PoolService;


const { getRestaurantUserById: getRestaurantUserByIdHelper, getRestaurantUserByUserId } = require('../helpers/companyHelpers.js');
const { handleCompanyError } = require('../utils/responseHelpers.js');
const { Logger } = require('../middleware/errorTracking.js');
const AdminUserService = require('../services/admin/adminUserService.js');

/**
 * Middleware to validate and fetch restaurant user by restaurantUserId from params
 * Attaches restaurantUser to req.restaurantUser and req.restaurantUserId
 */
const getRestaurantUserById = async (req, res, next) => {
  try {
    const { restaurantUserId } = req.params;

    if (!restaurantUserId) {
      const error = new Error('ID de usuario del restaurante es requerido.');
      error.statusCode = 400;
      error.code = 'MISSING_RESTAURANT_USER_ID';
      return handleCompanyError(res, error, { logger: Logger });
    }

    const parsedId = parseInt(restaurantUserId, 10);
    if (isNaN(parsedId)) {
      const error = new Error('ID de usuario del restaurante inválido.');
      error.statusCode = 400;
      error.code = 'INVALID_RESTAURANT_USER_ID';
      return handleCompanyError(res, error, { logger: Logger });
    }

    // Fetch restaurant user
    const restaurantUser = await getRestaurantUserByIdHelper(parsedId);

    if (!restaurantUser) {
      Logger.warn('Restaurant user not found', { restaurantUserId: parsedId });
      const error = new Error('Usuario del restaurante no encontrado.');
      error.statusCode = 404;
      error.code = 'RESTAURANT_USER_NOT_FOUND';
      return handleCompanyError(res, error, { logger: Logger });
    }

    // Attach to request object
    req.restaurantUser = restaurantUser;
    req.restaurantUserId = parsedId;

    next();
  } catch (error) {
    return handleCompanyError(res, error, {
      context: { restaurantUserId: req.params?.restaurantUserId },
      logger: Logger
    });
  }
};

/**
 * Middleware to fetch all restaurant users for the current restaurant
 * Attaches restaurant users to req.restaurantUsers
 * Requires req.restaurantId to be set (typically by checkCompany middleware)
 */
const getRestaurantUsers = async (req, res, next) => {
  try {
    const { restaurantId } = req;

    if (!restaurantId) {
      const error = new Error('Restaurant ID is required');
      error.statusCode = 400;
      error.code = 'MISSING_RESTAURANT_ID';
      return handleCompanyError(res, error, { logger: Logger });
    }

    // Fetch restaurant users using the service
    const users = await AdminUserService.getRestaurantUsers(restaurantId);

    // Attach to request object
    req.restaurantUsers = users;

    next();
  } catch (error) {
    return handleCompanyError(res, error, {
      context: { restaurantId: req.restaurantId },
      logger: Logger
    });
  }
};

module.exports = {
  getRestaurantUserById,
  getRestaurantUsers
};


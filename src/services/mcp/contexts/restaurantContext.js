/**
 * Restaurant Context Builder
 * Handles restaurant data retrieval and context building for MCP services
 */

const { prisma } = require('../../../db.js');

/**
 * Get restaurant data by ID
 */
async function getRestaurant(restaurantId) {
  try {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: parseInt(restaurantId) },
      include: { user: true }
    });

    if (!restaurant) {
      throw new Error(`Restaurant with ID ${restaurantId} not found`);
    }

    return restaurant;
  } catch (error) {
    console.error('❌ [Restaurant Context] Error fetching restaurant:', error);
    throw error;
  }
}

/**
 * Build restaurant context for MCP tools
 * locationId can be:
 * - A valid number (specific location)
 * - null (not specified - will be selected by user in frontend)
 * - undefined (not provided - will be selected by user in frontend)
 * We should NOT default to 1, as that might be incorrect
 */
function buildRestaurantContext(restaurant, restaurantUserId, locationId) {
  return {
    id: restaurant.id,
    name: restaurant.name,
    userId: restaurantUserId,
    locationId: locationId !== undefined ? locationId : null // Don't default to 1, let user select
  };
}

/**
 * Validate restaurant context
 */
function validateRestaurantContext(restaurantId, restaurantUserId) {
  const errors = [];

  if (!restaurantId) {
    errors.push('Restaurant ID is required');
  }

  if (!restaurantUserId) {
    errors.push('Restaurant user ID is required');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

module.exports = {
  getRestaurant,
  buildRestaurantContext,
  validateRestaurantContext
};


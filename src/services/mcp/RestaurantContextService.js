/**
 * Restaurant Context Service
 * Handles restaurant data retrieval and context building
 */

const { prisma } = require('../../db.js');

class RestaurantContextService {
  /**
   * Get restaurant data by ID
   */
  async getRestaurant(restaurantId) {
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
   */
  buildContext(restaurant, restaurantUserId, locationId) {
    return {
      id: restaurant.id,
      name: restaurant.name,
      userId: restaurantUserId,
      locationId: locationId || 1
    };
  }

  /**
   * Validate restaurant context
   */
  validateContext(restaurantId, restaurantUserId) {
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
}

module.exports = RestaurantContextService;

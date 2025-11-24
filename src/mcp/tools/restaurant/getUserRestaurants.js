const BaseTool = require('../baseTool');
const { prisma } = require('../../../db.js');

/**
 * Get User Restaurants Tool
 * Retrieves all restaurants a user has access to (as owner or staff)
 */
class GetUserRestaurantsTool extends BaseTool {
  constructor() {
    super(
      'get_user_restaurants',
      'Get all restaurants that a user has access to. Useful when user asks about "my restaurants" or needs to select a specific restaurant. Can use userId, restaurantId, or restaurantUserId.',
      {
        type: 'object',
        properties: {
          userId: { 
            type: 'number', 
            description: 'User ID to get restaurants for (optional if restaurantId or restaurantUserId provided)' 
          },
          restaurantId: {
            type: 'number',
            description: 'Restaurant ID - will get the user who owns/accesses this restaurant (optional)'
          },
          restaurantUserId: {
            type: 'number',
            description: 'Restaurant User ID - will get the user associated with this restaurant user record (optional)'
          }
        },
        required: []
      }
    );
  }

  async handle(args, { prisma: contextPrisma, restaurantContext }) {
    try {
      let { userId, restaurantId, restaurantUserId } = args;
      
      // If restaurantUserId provided, get userId from it
      if (restaurantUserId && !userId) {
        const ru = await contextPrisma.restaurantUser.findUnique({
          where: { id: parseInt(restaurantUserId) },
          select: { userId: true }
        });
        if (ru) {
          userId = ru.userId;
        }
      }
      
      // If restaurantId provided, get userId from restaurant
      if (restaurantId && !userId) {
        const restaurant = await contextPrisma.restaurant.findUnique({
          where: { id: parseInt(restaurantId) },
          select: { userId: true }
        });
        if (restaurant) {
          userId = restaurant.userId;
        }
      }
      
      // If still no userId, try restaurantContext
      if (!userId && restaurantContext) {
        // restaurantContext.userId is actually restaurantUserId, so look it up
        if (restaurantContext.userId) {
          const ru = await contextPrisma.restaurantUser.findUnique({
            where: { id: parseInt(restaurantContext.userId) },
            select: { userId: true }
          });
          if (ru) {
            userId = ru.userId;
          } else {
            // If not found, might be direct owner - get from restaurant
            const restaurant = await contextPrisma.restaurant.findUnique({
              where: { id: parseInt(restaurantContext.id) },
              select: { userId: true }
            });
            if (restaurant) {
              userId = restaurant.userId;
            }
          }
        }
      }
      
      if (!userId) {
        return this.createErrorResponse(
          'User ID is required. Please provide userId, restaurantId, restaurantUserId, or ensure restaurantContext is available.'
        );
      }

      // Get restaurants from RestaurantUser table (staff access)
      const restaurantUsers = await contextPrisma.restaurantUser.findMany({
        where: { 
          userId: parseInt(userId),
          restaurant: {
            deletedAt: null
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
      const ownedRestaurants = await contextPrisma.restaurant.findMany({
        where: { 
          userId: parseInt(userId),
          deletedAt: null
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

      const allRestaurants = [];
      
      // Add restaurants from RestaurantUser table (staff access)
      for (const ru of restaurantUsers) {
        allRestaurants.push({
          restaurantId: ru.restaurant.id,
          restaurantName: ru.restaurant.name,
          restaurantImage: ru.restaurant.profileImageUrl,
          description: ru.restaurant.description,
          specialty: ru.restaurant.specialty,
          format: ru.restaurant.format,
          region: ru.restaurant.region,
          comuna: ru.restaurant.comuna,
          accessType: 'staff',
          restaurantUserId: ru.id
        });
      }
      
      // Add owned restaurants (direct ownership)
      for (const restaurant of ownedRestaurants) {
        // Check if this restaurant is already in the list (avoid duplicates)
        const exists = allRestaurants.some(r => r.restaurantId === restaurant.id);
        if (!exists) {
          allRestaurants.push({
            restaurantId: restaurant.id,
            restaurantName: restaurant.name,
            restaurantImage: restaurant.profileImageUrl,
            description: restaurant.description,
            specialty: restaurant.specialty,
            format: restaurant.format,
            region: restaurant.region,
            comuna: restaurant.comuna,
            accessType: 'owner',
            restaurantUserId: null
          });
        }
      }

      return this.createSuccessResponse({
        message: `Found ${allRestaurants.length} restaurant(s) for user`,
        restaurants: allRestaurants,
        count: allRestaurants.length,
        userId: parseInt(userId)
      });
    } catch (error) {
      console.error('❌ [MCP] Error getting user restaurants:', error);
      return this.createErrorResponse(error);
    }
  }
}

module.exports = GetUserRestaurantsTool;


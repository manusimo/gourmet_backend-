/**
 * Restaurant Tools Registry
 * Central registry for all restaurant-related MCP tools
 */

const GetUserRestaurantsTool = require('./getUserRestaurants');
const GetRestaurantJobsTool = require('./getRestaurantJobs');

// Create tool instances
const getUserRestaurantsTool = new GetUserRestaurantsTool();
const getRestaurantJobsTool = new GetRestaurantJobsTool();

// Export tools and handlers
const tools = [
  getUserRestaurantsTool.getDefinition(),
  getRestaurantJobsTool.getDefinition()
];

const handlers = {
  get_user_restaurants: (args, context) => getUserRestaurantsTool.execute(args, context),
  get_restaurant_jobs: (args, context) => getRestaurantJobsTool.execute(args, context)
};

module.exports = {
  getTools: () => tools,
  getHandlers: () => handlers
};


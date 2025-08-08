const { PrismaClient } = require('@prisma/client');
const { parseIntervalToAverage } = require('../utils/parseIntervalToAverage.js');

const prisma = new PrismaClient();

async function getOrderByCriteriaCompanies(orderBy) {
  if (orderBy === 'popularity') {
    // First, query for job offers with a count of applications
    const popularRestaurants = await prisma.restaurant.findMany({
      select: {
        id: true,
        jobOffers: {
          select: {
            _count: {
              select: {
                applications: true, // Counting the number of applications
              },
            },
          },
        },
      },
    });

    // Sort restaurants based on the number of applications
    const sortedRestaurants = popularRestaurants
      .map((restaurant) => ({
        id: restaurant.id,
        applicationCount: restaurant.jobOffers.reduce(
          (sum, jobOffer) => sum + jobOffer._count.applications,
          0
        ),
      }))
      .sort((a, b) => b.applicationCount - a.applicationCount); // Sort by application count in descending order

    // Extract the sorted restaurant IDs
    const popularRestaurantIds = sortedRestaurants.map((r) => r.id);

    // Return the order criteria as an `in` filter for the `id` field
    return popularRestaurantIds.length > 0
      ? { id: { in: popularRestaurantIds } }
      : { id: { in: [] } }; // Empty array if no restaurants are popular
  }

  if (orderBy === 'scale') {
    const allRestaurants = await prisma.restaurant.findMany();

    const scaledRestaurants = allRestaurants
      .map((restaurant) => ({
        id: restaurant.id,
        scale:
          parseIntervalToAverage(restaurant.workers) +
          parseIntervalToAverage(restaurant.weeklyAverageClients),
      }))
      .sort((a, b) => b.scale - a.scale); // Sort by scale in descending order

    const scaledRestaurantIds = scaledRestaurants.map((r) => r.id);
    return { id: { in: scaledRestaurantIds } }; // Return scaled restaurant IDs
  }

  return {}; // Default case: no specific order
}

module.exports = { getOrderByCriteriaCompanies };

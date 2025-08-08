const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * Deletes locations that are no longer in the request
 */
async function deleteLocations(locationsToDelete) {
  if (locationsToDelete.length > 0) {
    await prisma.location.deleteMany({
      where: {
        id: {
          in: locationsToDelete.map(location => location.id),
        },
      },
    });
  }
}

/**
 * Updates the company profile and existing locations
 */
async function updateCompanyProfile(
  restaurantId,
  { region, comuna, legalName, rut, name, format, specialty, numberOfRestaurants, 
    workers, profileImageUrl, weeklyAverageClients, description, benefits, 
    existingLocations, profileCarouselUrls }
) {
  await prisma.restaurant.update({
    where: { id: parseInt(restaurantId, 10) },
    data: {
      legalName,
      rut,
      name,
      format,
      specialty,
      region,
      comuna,
      numberOfRestaurants: parseInt(numberOfRestaurants, 10),
      workers,
      profileImageUrl,
      weeklyAverageClients,
      description,
      benefits: {
        set: Object.keys(benefits).filter(benefit => benefits[benefit]),
      },
      locations: {
        updateMany: existingLocations.map(location => ({
          where: { id: location.id },
          data: {
            address: location.address,
            longitude: location.longitude,
            latitude: location.latitude,
          },
        })),
      },
      profileCarouselUrls: {
        set: profileCarouselUrls, 
      },
    },
  });
}

/**
 * Creates new locations
 */
async function createNewLocations(newLocations, restaurantId) {
  if (newLocations.length > 0) {
    await prisma.location.createMany({
      data: newLocations.map(location => ({
        address: location.address,
        latitude: location.latitude,
        longitude: location.longitude,
        restaurantId,
      })),
    });
  }
}

module.exports = {
  deleteLocations,
  updateCompanyProfile,
  createNewLocations,
};

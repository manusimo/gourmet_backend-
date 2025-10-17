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
      profileImageUrl: Array.isArray(profileImageUrl) ? profileImageUrl[0] || null : profileImageUrl,
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
            longitude: parseFloat(location.longitude),
            latitude: parseFloat(location.latitude),
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
    // Filter out locations with empty addresses
    const validLocations = newLocations.filter(location => 
      location.address && location.address.trim() !== ''
    );
    
    if (validLocations.length > 0) {
      await prisma.location.createMany({
        data: validLocations.map(location => {
          // Handle empty or invalid coordinates
          const lat = location.latitude && location.latitude.trim() !== '' 
            ? parseFloat(location.latitude) 
            : 0;
          const lng = location.longitude && location.longitude.trim() !== '' 
            ? parseFloat(location.longitude) 
            : 0;
          
          console.log('🔍 Creating location:', {
            address: location.address,
            latitude: lat,
            longitude: lng,
            restaurantId
          });
          
          return {
            address: location.address,
            latitude: isNaN(lat) ? 0 : lat,
            longitude: isNaN(lng) ? 0 : lng,
            restaurantId,
          };
        }),
      });
    }
  }
}

module.exports = {
  deleteLocations,
  updateCompanyProfile,
  createNewLocations,
};

const { prisma } = require("../db.js");
const jwt = require('jsonwebtoken');

/**
 * Get companies with filters and pagination
 * @param {Object} filters - Filter conditions
 * @param {Object} searchConditions - Search conditions
 * @param {number} limit - Number of items per page
 * @param {number} skip - Number of items to skip
 * @param {Object} [orderByCriteria] - Optional order by criteria (e.g., { id: { in: [...] } })
 * @returns {Array} Array of companies
 */
const getCompanies = async (filters, searchConditions, limit, skip, orderByCriteria = null) => {
  const whereClause = {
    ...searchConditions,
    ...filters,
    deletedAt: null, // Filter out soft-deleted restaurants
  };

  // Merge orderByCriteria if provided (used for popularity/scale ordering)
  if (orderByCriteria && Object.keys(orderByCriteria).length > 0) {
    Object.assign(whereClause, orderByCriteria);
  }

  return await prisma.restaurant.findMany({
    where: whereClause,
    include: {
      locations: true,
      jobOffers: {
        where: { deletedAt: null },
        include: {
          applications: { where: { deletedAt: null } },
        },
      },
      _count: { select: { jobOffers: true } },
    },
    orderBy: orderByCriteria && orderByCriteria.id ? undefined : { id: 'desc' },
    skip,
    take: limit,
  });
};

/**
 * Count total companies with filters
 * @param {Object} filters - Filter conditions
 * @param {Object} searchConditions - Search conditions
 * @returns {number} Total count
 */
const getTotalCompanies = async (filters, searchConditions) => {
  return await prisma.restaurant.count({
    where: {
      ...searchConditions,
      ...filters,
      deletedAt: null, // Filter out soft-deleted restaurants
    },
  });
};

/**
 * Get restaurant user by user ID
 * @param {number} userId - User ID
 * @returns {Object|null} Restaurant user or null if not found
 */
const getRestaurantUserByUserId = async (userId) => {
  return await prisma.restaurantUser.findFirst({
    where: { userId: Number(userId) },
    include: {
      restaurant: { include: { locations: true } },
    },
  });
};

/**
 * Get company locations
 * @param {number} restaurantId - Restaurant ID
 * @returns {Array} Array of locations
 */
const getCompanyLocations = async (restaurantId) => {
  return await prisma.location.findMany({
    where: { restaurantId: Number(restaurantId) },
  });
};

/**
 * Format locations for response
 * @param {Array} locations - Array of location objects
 * @returns {Array} Formatted locations
 */
const formatLocations = (locations) => {
  return locations.map(({ id, address, region, comuna }) => ({ id, address, region, comuna }));
};

/**
 * Get top rated companies
 * @param {number} limit - Number of companies to return
 * @param {number} skip - Number of companies to skip
 * @returns {Array} Array of top rated companies
 */
const getTopRatedCompanies = async (limit, skip) => {
  return await prisma.restaurant.findMany({
    include: {
      locations: true,
      jobOffers: {
        where: { deletedAt: null },
        include: {
          applications: { where: { deletedAt: null } },
        },
      },
      _count: { select: { jobOffers: true } },
    },
    orderBy: { jobOffers: { _count: 'desc' } },
    skip,
    take: limit,
  });
};

/**
 * Get total companies count
 * @returns {number} Total number of companies
 */
const getTotalCompaniesCount = async () => {
  return await prisma.restaurant.count();
};

/**
 * Get talents applications for a company
 * @param {number} restaurantId - Restaurant ID
 * @returns {Array} Array of talent applications
 */
const getTalentsApplications = async (restaurantId) => {
  console.log('🔍 getTalentsApplications called with restaurantId:', restaurantId);
  
  const result = await prisma.talentPool.findMany({
    where: { 
      restaurantId: Number(restaurantId),
      status: 'pendent',  // Only get applications with 'pendent' status
      deletedAt: null     // Exclude soft-deleted records
    },
    include: {
      employee: {
        include: {
          educations: true,
          experiences: true,
        },
      },
    },
  });
  
  console.log('🔍 getTalentsApplications found:', result.length, 'applications');
  console.log('🔍 Applications:', result);
  
  return result;
};

/**
 * Create company profile
 * @param {Object} companyData - Company data
 * @returns {Object} Created company
 */
const createCompanyProfile = async (companyData) => {
  console.log('🏗️ [createCompanyProfile] Starting company creation with data:', companyData);
  
  const {
    name,
    specialty,
    format,
    description,
    rut,
    legalName,
    region,
    comuna,
    numberOfRestaurants,
    workers,
    weeklyAverageClients,
    benefits,
    locations,
    jobOffers,
    profileImageUrl,
    profileCarouselUrls,
    userId
  } = companyData;

  console.log('🏗️ [createCompanyProfile] Extracted data:', {
    name,
    specialty,
    format,
    description,
    rut,
    legalName,
    region,
    comuna,
    numberOfRestaurants,
    workers,
    weeklyAverageClients,
    benefits,
    locations,
    jobOffers,
    profileImageUrl,
    profileCarouselUrls,
    userId
  });

  console.log('🏗️ [createCompanyProfile] About to create restaurant in database...');
  
  try {
    // Create restaurant first
    const restaurant = await prisma.restaurant.create({
      data: {
        name,
        specialty,
        format,
        description,
        rut,
        legalName,
        region,
        comuna,
        numberOfRestaurants: Number(numberOfRestaurants),
        workers: String(workers),
        weeklyAverageClients: String(weeklyAverageClients),
        benefits,
        profileImageUrl,
        profileCarouselUrls,
        user: { connect: { id: userId } },
      },
    });

    console.log('✅ [createCompanyProfile] Restaurant created successfully:', {
      id: restaurant.id,
      name: restaurant.name,
      specialty: restaurant.specialty
    });

  // Create locations separately if they exist
  if (locations && locations.length > 0) {
    console.log('🏗️ [createCompanyProfile] Creating locations:', locations.length);
    console.log('🏗️ [createCompanyProfile] Locations type:', typeof locations);
    console.log('🏗️ [createCompanyProfile] Locations data:', locations);
    
    // Ensure locations is an array
    let locationsArray = locations;
    if (typeof locations === 'string') {
      try {
        locationsArray = JSON.parse(locations);
        console.log('🏗️ [createCompanyProfile] Parsed locations from string:', locationsArray);
      } catch (error) {
        console.error('🏗️ [createCompanyProfile] Error parsing locations string:', error);
        locationsArray = [];
      }
    }
    
    if (Array.isArray(locationsArray) && locationsArray.length > 0) {
      const locationData = locationsArray.map(location => ({
        address: location.address || '',
        latitude: location.latitude ? parseFloat(location.latitude) : 0,
        longitude: location.longitude ? parseFloat(location.longitude) : 0,
        restaurantId: restaurant.id
      }));

      console.log('🏗️ [createCompanyProfile] Location data to create:', locationData);

      await prisma.location.createMany({
        data: locationData
      });
      
      console.log('✅ [createCompanyProfile] Locations created successfully');
    } else {
      console.log('ℹ️ [createCompanyProfile] No valid locations to create');
    }
  } else {
    console.log('ℹ️ [createCompanyProfile] No locations to create');
  }

    console.log('✅ [createCompanyProfile] Company profile creation completed successfully');
    return restaurant;
  } catch (error) {
    console.error('❌ [createCompanyProfile] Error creating company profile:', error);
    throw error;
  }
};

/**
 * Create restaurant user association
 * @param {number} userId - User ID
 * @param {number} restaurantId - Restaurant ID
 * @returns {Object} Created restaurant user
 */
const createRestaurantUser = async (userId, restaurantId) => {
  return await prisma.restaurantUser.create({
    data: {
      user: { connect: { id: userId } },
      restaurant: { connect: { id: restaurantId } },
    },
  });
};

/**
 * Update user with restaurant connection
 * @param {number} userId - User ID
 * @param {number} restaurantId - Restaurant ID
 * @returns {Object} Updated user
 */
const updateUserWithRestaurant = async (userId, restaurantId) => {
  return await prisma.user.update({
    where: { id: userId },
    data: { restaurant: { connect: { id: restaurantId } } },
  });
};

/**
 * Generate JWT token for company user
 * @param {Object} tokenData - Token data
 * @returns {string} JWT token
 */
const generateCompanyToken = (tokenData) => {
  return jwt.sign(tokenData, process.env.JWT_SECRET, { expiresIn: '7d' });
};

/**
 * Get company by ID
 * @param {number} companyId - Company ID
 * @returns {Object|null} Company or null if not found
 */
const getCompanyById = async (companyId) => {
  console.log('🔍 [getCompanyById] Starting database query for company ID:', companyId);
  console.log('🔍 [getCompanyById] Converted to number:', Number(companyId));
  
  try {
    const result = await prisma.restaurant.findFirst({
      where: { 
        id: Number(companyId),
        deletedAt: null // Filter out soft-deleted restaurants
      },
      include: {
        locations: true,
        jobOffers: {
          where: { deletedAt: null },
          include: {
            applications: { where: { deletedAt: null } },
          },
        },
      },
    });
    
    console.log('🔍 [getCompanyById] Database query result:', result ? 'Found' : 'Not found');
    if (result) {
      console.log('🔍 [getCompanyById] Company data structure:', {
        id: result.id,
        name: result.name,
        hasLocations: result.locations ? result.locations.length : 0,
        hasJobOffers: result.jobOffers ? result.jobOffers.length : 0,
        profileImageUrl: result.profileImageUrl,
        profileCarouselUrls: result.profileCarouselUrls,
        benefits: result.benefits
      });
    }
    
    return result;
  } catch (error) {
    console.error('❌ [getCompanyById] Database error:', error);
    throw error;
  }
};

/**
 * Get company by restaurant ID
 * @param {number} restaurantId - Restaurant ID
 * @returns {Object|null} Company or null if not found
 */
const getCompanyByRestaurantId = async (restaurantId) => {
  return await prisma.restaurant.findFirst({
    where: { 
      id: Number(restaurantId),
      deletedAt: null // Filter out soft-deleted restaurants
    },
    include: {
      locations: true,
      jobOffers: {
        where: { deletedAt: null },
        include: {
          applications: { where: { deletedAt: null } },
        },
      },
    },
  });
};

/**
 * Get current locations for a company
 * @param {number} restaurantId - Restaurant ID
 * @returns {Array} Array of current locations
 */
const getCurrentLocations = async (restaurantId) => {
  return await prisma.location.findMany({
    where: { restaurantId: Number(restaurantId) },
  });
};

/**
 * Filter new locations from locations array
 * @param {Array} locations - All locations
 * @returns {Array} New locations (without ID)
 */
const filterNewLocations = (locations) => {
  return locations.filter(location => !location.id).map(location => ({ address: location.address }));
};

/**
 * Filter existing locations from locations array
 * @param {Array} locations - All locations
 * @returns {Array} Existing locations (with ID)
 */
const filterExistingLocations = (locations) => {
  return locations.filter(location => location.id);
};

/**
 * Find locations to delete
 * @param {Array} currentLocations - Current locations in database
 * @param {Array} locations - Updated locations from request
 * @returns {Array} Locations to delete
 */
const findLocationsToDelete = (currentLocations, locations) => {
  return currentLocations.filter(currentLocation =>
    !locations.some(location => location.id === currentLocation.id)
  );
};

/**
 * Get plan names mapping
 * @returns {Object} Plan names mapping
 */
const getPlanNames = () => {
  return {
    'starter': 'STARTER',
    'pro': 'PRO',
    'plus': 'PLUS',
    'premium': 'PREMIUM'
  };
};

/**
 * Generate plan info for response
 * @param {string} paymentStatus - User payment status
 * @param {number} requestedLocations - Number of requested locations
 * @param {number} locationLimit - Location limit for plan
 * @returns {Object} Plan info object
 */
const generatePlanInfo = (paymentStatus, requestedLocations, locationLimit) => {
  const planNames = getPlanNames();
  const currentPlan = planNames[paymentStatus] || 'STARTER';
  let upgradeMessage;
  let remainingLocations = locationLimit - requestedLocations;
  if (remainingLocations === 0) {
    let nextPlan;
    if (paymentStatus === 'starter') {
      nextPlan = 'PRO';
    } else if (paymentStatus === 'pro') {
      nextPlan = 'PLUS';
    } else {
      nextPlan = 'PREMIUM';
    }
    upgradeMessage = `Has usado todas tus ubicaciones. Actualiza a ${nextPlan} para más.`;
  } else {
    upgradeMessage = `Te quedan ${remainingLocations} ubicaciones de tu plan ${currentPlan}.`;
  }
  return {
    currentPlan,
    requestedLocations,
    locationLimit,
    remainingLocations,
    upgradeMessage
  };
};

/**
 * Generate update plan info for response
 * @param {string} paymentStatus - User payment status
 * @param {number} requestedLocations - Number of requested locations
 * @param {number} locationLimit - Location limit for plan
 * @returns {Object} Plan info object
 */
const generateUpdatePlanInfo = (paymentStatus, requestedLocations, locationLimit) => {
  const planNames = getPlanNames();
  const currentPlan = planNames[paymentStatus] || 'STARTER';
  let upgradeMessage;
  let remainingLocations = locationLimit - requestedLocations;
  if (remainingLocations === 0) {
    let nextPlan;
    if (paymentStatus === 'starter') {
      nextPlan = 'PRO';
    } else if (paymentStatus === 'pro') {
      nextPlan = 'PLUS';
    } else {
      nextPlan = 'PREMIUM';
    }
    upgradeMessage = `Has usado todas tus ubicaciones. Actualiza a ${nextPlan} para más.`;
  } else {
    upgradeMessage = `Te quedan ${remainingLocations} ubicaciones de tu plan ${currentPlan}.`;
  }
  return {
    currentPlan,
    requestedLocations,
    locationLimit,
    remainingLocations,
    upgradeMessage
  };
}; 

module.exports = {
  getCompanies,
  getTotalCompanies,
  getRestaurantUserByUserId,
  getCompanyLocations,
  formatLocations,
  getTopRatedCompanies,
  getTotalCompaniesCount,
  getTalentsApplications,
  createCompanyProfile,
  createRestaurantUser,
  updateUserWithRestaurant,
  generateCompanyToken,
  getCompanyById,
  getCompanyByRestaurantId,
  getCurrentLocations,
  filterNewLocations,
  filterExistingLocations,
  findLocationsToDelete,
  getPlanNames,
  generatePlanInfo,
  generateUpdatePlanInfo,
}; 
import { prisma } from "../db.js";
import jwt from 'jsonwebtoken';

/**
 * Get companies with filters and pagination
 * @param {Object} filters - Filter conditions
 * @param {Object} searchConditions - Search conditions
 * @param {number} limit - Number of items per page
 * @param {number} skip - Number of items to skip
 * @returns {Array} Array of companies
 */
export const getCompanies = async (filters, searchConditions, limit, skip) => {
  return await prisma.restaurant.findMany({
    where: {
      ...filters,
      ...searchConditions,
    },
    take: limit,
    skip: skip,
  });
};

/**
 * Count total companies with filters
 * @param {Object} filters - Filter conditions
 * @param {Object} searchConditions - Search conditions
 * @returns {number} Total count
 */
export const getTotalCompanies = async (filters, searchConditions) => {
  return await prisma.restaurant.count({
    where: {
      ...filters,
      ...searchConditions,
    },
  });
};

/**
 * Get restaurant user by user ID
 * @param {number} userId - User ID
 * @returns {Object|null} Restaurant user or null if not found
 */
export const getRestaurantUserByUserId = async (userId) => {
  return await prisma.restaurantUser.findUnique({
    where: {
      userId: parseInt(userId),
    },
    include: {
      user: true,
      restaurant: true,
    },
  });
};

/**
 * Get company locations
 * @param {number} restaurantId - Restaurant ID
 * @returns {Array} Array of locations
 */
export const getCompanyLocations = async (restaurantId) => {
  return await prisma.location.findMany({
    where: { restaurantId: parseInt(restaurantId) },
    select: { id: true, address: true },
  });
};

/**
 * Format locations for response
 * @param {Array} locations - Array of location objects
 * @returns {Array} Formatted locations
 */
export const formatLocations = (locations) => {
  return locations.map(({ id, address }) => ({
    locationId: id,
    address
  }));
};

/**
 * Get top rated companies
 * @param {number} limit - Number of companies to return
 * @param {number} skip - Number of companies to skip
 * @returns {Array} Array of top rated companies
 */
export const getTopRatedCompanies = async (limit, skip) => {
  return await prisma.restaurant.findMany({
    orderBy: {
      jobOffers: {
        _count: 'desc',
      },
    },
    take: parseInt(limit, 10),
    skip: skip,
    include: {
      _count: {
        select: { jobOffers: { where: { deletedAt: null } } },
      },
    },
  });
};

/**
 * Get total companies count
 * @returns {number} Total number of companies
 */
export const getTotalCompaniesCount = async () => {
  return await prisma.restaurant.count();
};

/**
 * Get talents applications for a company
 * @param {number} restaurantId - Restaurant ID
 * @returns {Array} Array of talent applications
 */
export const getTalentsApplications = async (restaurantId) => {
  return await prisma.talentPool.findMany({
    where: {
      status: "pendent",
      restaurantId: parseInt(restaurantId, 10),
    },
    include: {
      employee: true,
    }
  });
};

/**
 * Create company profile
 * @param {Object} companyData - Company data
 * @returns {Object} Created company
 */
export const createCompanyProfile = async (companyData) => {
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

  const benefitsArray = Object.keys(benefits).filter(benefit => benefits[benefit]);

  const formattedLocations = locations.map(location => ({
    address: location.address,
    longitude: parseFloat(location.longitude),
    latitude: parseFloat(location.latitude),
  }));

  return await prisma.restaurant.create({
    data: {
      name,
      specialty,
      format,
      description,
      rut,
      legalName,
      region,
      comuna,
      numberOfRestaurants: parseInt(numberOfRestaurants, 10),
      workers,
      weeklyAverageClients,
      profileImageUrl,
      profileCarouselUrls,
      benefits: benefitsArray,
      locations: { create: formattedLocations },
      jobOffers: { create: jobOffers },
      userId,
    },
  });
};

/**
 * Create restaurant user association
 * @param {number} userId - User ID
 * @param {number} restaurantId - Restaurant ID
 * @returns {Object} Created restaurant user
 */
export const createRestaurantUser = async (userId, restaurantId) => {
  return await prisma.restaurantUser.create({
    data: {
      userId,
      restaurantId: restaurantId,
      role: 'admin'
    }
  });
};

/**
 * Update user with restaurant connection
 * @param {number} userId - User ID
 * @param {number} restaurantId - Restaurant ID
 * @returns {Object} Updated user
 */
export const updateUserWithRestaurant = async (userId, restaurantId) => {
  return await prisma.user.update({
    where: { id: userId },
    data: {
      restaurant: { connect: { id: restaurantId } }
    }
  });
};

/**
 * Generate JWT token for company user
 * @param {Object} tokenData - Token data
 * @returns {string} JWT token
 */
export const generateCompanyToken = (tokenData) => {
  const { userId, restaurantId, restaurantUserId, role } = tokenData;
  
  return jwt.sign({
    userId: userId,
    userType: 'empresas',
    restaurantId: restaurantId,
    restaurantUserId: restaurantUserId,
    role: role,
  }, process.env.JWT_SECRET);
};

/**
 * Get company by ID
 * @param {number} companyId - Company ID
 * @returns {Object|null} Company or null if not found
 */
export const getCompanyById = async (companyId) => {
  return await prisma.restaurant.findUnique({
    where: {
      id: parseInt(companyId),
    },
    include: {
      locations: true,
      jobOffers: { where: { deletedAt: null } },
    },
  });
};

/**
 * Get company by restaurant ID
 * @param {number} restaurantId - Restaurant ID
 * @returns {Object|null} Company or null if not found
 */
export const getCompanyByRestaurantId = async (restaurantId) => {
  return await prisma.restaurant.findUnique({
    where: {
      id: parseInt(restaurantId),
    },
    include: {
      locations: true,
      jobOffers: { where: { deletedAt: null } },
    },
  });
};

/**
 * Get current locations for a company
 * @param {number} restaurantId - Restaurant ID
 * @returns {Array} Array of current locations
 */
export const getCurrentLocations = async (restaurantId) => {
  return await prisma.location.findMany({
    where: { restaurantId },
  });
};

/**
 * Filter new locations from locations array
 * @param {Array} locations - All locations
 * @returns {Array} New locations (without ID)
 */
export const filterNewLocations = (locations) => {
  return locations.filter(location => !location.id).map(location => ({
    ...location,
    longitude: parseFloat(location.longitude),
    latitude: parseFloat(location.latitude),
  }));
};

/**
 * Filter existing locations from locations array
 * @param {Array} locations - All locations
 * @returns {Array} Existing locations (with ID)
 */
export const filterExistingLocations = (locations) => {
  return locations.filter(location => location.id);
};

/**
 * Find locations to delete
 * @param {Array} currentLocations - Current locations in database
 * @param {Array} locations - Updated locations from request
 * @returns {Array} Locations to delete
 */
export const findLocationsToDelete = (currentLocations, locations) => {
  return currentLocations.filter(currentLocation =>
    !locations.some(location => location.id === currentLocation.id)
  );
};

/**
 * Get plan names mapping
 * @returns {Object} Plan names mapping
 */
export const getPlanNames = () => {
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
export const generatePlanInfo = (paymentStatus, requestedLocations, locationLimit) => {
  const planNames = getPlanNames();
  const currentPlan = planNames[paymentStatus] || 'STARTER';
  
  let upgradeMessage;
  if (requestedLocations === locationLimit) {
    let nextPlan;
    if (paymentStatus === 'starter') {
      nextPlan = 'PRO';
    } else if (paymentStatus === 'pro') {
      nextPlan = 'PLUS';
    } else {
      nextPlan = 'PREMIUM';
    }
    upgradeMessage = `Has usado todas tus ubicaciones permitidas. Actualiza a ${nextPlan} para más ubicaciones.`;
  } else {
    upgradeMessage = `Has creado ${requestedLocations} ubicaciones de tu plan ${currentPlan}.`;
  }

  return {
    currentPlan,
    locationsCreated: requestedLocations,
    locationLimit,
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
export const generateUpdatePlanInfo = (paymentStatus, requestedLocations, locationLimit) => {
  const planNames = getPlanNames();
  const currentPlan = planNames[paymentStatus] || 'STARTER';
  
  let upgradeMessage;
  if (requestedLocations === locationLimit) {
    let nextPlan;
    if (paymentStatus === 'starter') {
      nextPlan = 'PRO';
    } else if (paymentStatus === 'pro') {
      nextPlan = 'PLUS';
    } else {
      nextPlan = 'PREMIUM';
    }
    upgradeMessage = `Has usado todas tus ubicaciones permitidas. Actualiza a ${nextPlan} para más ubicaciones.`;
  } else {
    upgradeMessage = `Has actualizado ${requestedLocations} ubicaciones de tu plan ${currentPlan}.`;
  }

  return {
    currentPlan,
    locationsUpdated: requestedLocations,
    locationLimit,
    upgradeMessage
  };
}; 
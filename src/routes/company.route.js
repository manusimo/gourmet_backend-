const express = require('express');
const csrf = require('csurf');
const { prisma } = require('../db.js');
const { checkCompany } = require('../helpers/authenticateToken.js');
const { requireRole, requirePermission, setUserRole } = require('../middleware/auth.js');
const { getUserIdFromCookie, getAuthFromCookie } = require('../helpers/cookies.js');
const { requirePlan, checkLocationLimit } = require('../middleware/checkPlan.js');
const { buildFilters, buildSearchConditions } = require('../helpers/filterHelpers.js');
const { deleteLocations, updateCompanyProfile, createNewLocations } = require('../helpers/company.js');
const { getOrderByCriteriaCompanies } = require('../helpers/orderBy.js');
const { verifyCSRFToken } = require('../helpers/csrf.js');
const {
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
  generatePlanInfo,
  generateUpdatePlanInfo
} = require('../helpers/companyHelpers.js');

const csrfProtection = csrf({ cookie: true });
const router = express.Router();

// GET /companies - Get companies with filters and pagination
router.get('/companies', async (req, res) => {
  try {
    const {
      q,
      page = 1,
      limit = 10,
      orderBy
    } = req.query;

    const pageInt = parseInt(page, 10);
    const limitInt = parseInt(limit, 10);

    if (orderBy && !['popularity', 'scale'].includes(orderBy)) {
      console.error(`Invalid orderBy value: ${orderBy}`);
      return res.status(400).json({ 
        success: false,
        error: "Invalid orderBy value. Must be 'popularity' or 'scale'" 
      });
    }

    const filters = buildFilters(req.query, ['format', 'specialty', 'region', 'comuna', 'benefits', 'workers', 'weeklyAverageClients']);
    const searchConditions = buildSearchConditions(q, 'name');
    console.log('🔍 [Companies API] Query params:', req.query);
    console.log('🔍 [Companies API] Filters:', filters);
    console.log('🔍 [Companies API] Search Conditions:', searchConditions);

    const companies = await getCompanies(filters, searchConditions, limitInt, (pageInt - 1) * limitInt);
    const totalCompanies = await getTotalCompanies(filters, searchConditions);

    res.json({
      success: true,
      data: companies,
      totalCompanies,
      currentPage: pageInt,
      totalPages: Math.ceil(totalCompanies / limitInt),
    });
  } catch (error) {
    console.error('Internal Server Error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal Server Error' 
    });
  }
});

// GET /api/restaurant/:restaurantUserId - Get restaurant information by restaurantUserId
router.get('/api/restaurant/:restaurantUserId', async (req, res) => {
  try {
    const { restaurantUserId } = req.params;

    if (!restaurantUserId || isNaN(restaurantUserId)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid or missing restaurantUserId' 
      });
    }

    // Get restaurant user information
    const restaurantUser = await prisma.restaurantUser.findUnique({
      where: { id: parseInt(restaurantUserId) },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            surname: true,
            profileImageUrl: true
          }
        },
        restaurant: {
          select: {
            id: true,
            name: true,
            description: true,
            profileImageUrl: true,
            location: true
          }
        }
      }
    });

    if (!restaurantUser) {
      return res.status(404).json({ 
        success: false,
        error: 'Restaurant user not found' 
      });
    }

    // Format the response
    const restaurantInfo = {
      id: restaurantUser.id,
      name: restaurantUser.user.name,
      surname: restaurantUser.user.surname,
      email: restaurantUser.user.email,
      profileImageUrl: restaurantUser.user.profileImageUrl || restaurantUser.restaurant.profileImageUrl,
      position: restaurantUser.position || 'Staff Member',
      location: restaurantUser.restaurant.location || 'Location not specified',
      restaurantName: restaurantUser.restaurant.name,
      restaurantDescription: restaurantUser.restaurant.description
    };

    return res.status(200).json({ 
      success: true,
      data: restaurantInfo 
    });
  } catch (error) {
    console.error('Error fetching restaurant information:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Failed to fetch restaurant information' 
    });
  }
});

// GET /api/company/restaurantUser/:userId - Get restaurant user by user ID
router.get('/api/company/restaurantUser/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId || isNaN(userId)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid or missing userId' 
      });
    }

    const restaurantUser = await getRestaurantUserByUserId(userId);

    if (!restaurantUser) {
      return res.status(404).json({ 
        success: false,
        error: 'Restaurant user not found' 
      });
    }

    return res.status(200).json({ 
      success: true,
      data: restaurantUser 
    });
  } catch (error) {
    console.error('Error fetching restaurant user:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Failed to fetch restaurant user' 
    });
  }
});

// GET /company/locations - Get company locations
router.get('/company/locations', getAuthFromCookie, async (req, res) => {
  try {
    const restaurantId = req.restaurantId;

    if (!restaurantId) {
      return res.status(400).json({
        success: false,
        message: 'companyId is required',
      });
    }

    const locations = await getCompanyLocations(restaurantId);

    if (!locations.length) {
      return res.status(404).json({
        success: false,
        message: 'No locations found for this company.',
      });
    }

    const formattedLocations = formatLocations(locations);

    return res.status(200).json({
      success: true,
      data: formattedLocations
    });
  } catch (error) {
    console.error('Error fetching company locations:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

// GET /company/top-rated-companies - Get top rated companies
router.get('/company/top-rated-companies', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 4,
    } = req.query;

    const skip = (page - 1) * limit;

    const companies = await getTopRatedCompanies(limit, skip);
    const totalCompanies = await getTotalCompaniesCount();

    res.json({
      success: true,
      data: companies.map(company => ({ // Use consistent 'data' property
        ...company,
        jobOffersCount: company._count.jobOffers,
      })),
      totalCompanies,
      currentPage: page,
      totalPages: Math.ceil(totalCompanies / limit),
    });
  } catch (error) {
    console.error('Error fetching top-rated companies:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal Server Error' 
    });
  }
});

// GET /company/talents-application - Get talents applications
router.get('/company/talents-application', getAuthFromCookie, async (req, res) => {
  try {
    const restaurantId = req.restaurantId;
    const talents = await getTalentsApplications(restaurantId);

    console.log('here you have some talents', talents);

    res.status(200).json({ 
      success: true,
      message: 'Some talents want to be part of this company', 
      data: talents 
    });
  } catch (error) {
    console.error('Error fetching talents:', error);
    res.status(500).json({ 
      success: false,
      message: "Internal Server Error" 
    });
  }
});

// POST /company - Create company (require admin or manager role)
router.post('/company', (req, res, next) => {
  console.log('🚨 POST /company route HIT - Request received!');
  console.log('🚨 Method:', req.method);
  console.log('🚨 URL:', req.url);
  console.log('🚨 Headers:', req.headers);
  next();
}, getUserIdFromCookie, setUserRole, requirePermission('create_company'), checkLocationLimit(), async (req, res) => {
  try {
    console.log('🏢 POST /company - Creating company profile');
    console.log('🏢 Request cookies:', req.cookies);
    console.log('🏢 User ID from middleware:', req.userId);
    console.log('🏢 User type from middleware:', req.userType);
    console.log('🏢 User role from middleware:', req.userRole);
    console.log('🏢 Request body keys:', Object.keys(req.body));

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
      profileCarouselUrls
    } = req.body;

    const userId = req.userId;
    const role = req.userRole;

    console.log('🏢 About to create company profile for userId:', userId);
    console.log('🏢 Request body data:', {
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
      profileCarouselUrls
    });

    // Data validation and conversion
    const processedData = {
      name: name || '',
      specialty: specialty || '',
      format: format || '',
      description: description || 'No hay descripción',
      rut: rut || 'No rut to show',
      legalName: legalName || 'No legal name to show',
      region: region || 'No hay',
      comuna: comuna || 'No hay', // Handle empty string
      numberOfRestaurants: numberOfRestaurants ? parseInt(numberOfRestaurants, 10) : 1,
      workers: workers || '',
      weeklyAverageClients: weeklyAverageClients || '',
      benefits: Array.isArray(benefits) ? benefits : (benefits ? Object.keys(benefits).filter(key => benefits[key]) : []),
      locations: locations || [],
      jobOffers: jobOffers || [],
      profileImageUrl: profileImageUrl || 'No photo',
      profileCarouselUrls: Array.isArray(profileCarouselUrls) ? profileCarouselUrls : [],
      userId
    };

    console.log('🏢 Processed data for Prisma:', processedData);

    // Check if user already has a restaurant
    const existingRestaurant = await prisma.restaurant.findUnique({
      where: { userId: userId }
    });
    console.log('🏢 Existing restaurant for user:', existingRestaurant ? 'Found' : 'None');

    if (existingRestaurant) {
      console.log('🏢 User already has restaurant ID:', existingRestaurant.id);
      return res.status(409).json({
        success: false,
        message: 'User already has a restaurant profile',
        data: { restaurantId: existingRestaurant.id }
      });
    }

    const companyProfile = await createCompanyProfile(processedData);

    // For admin users, don't create RestaurantUser record - they remain as admin users
    // For staff users, create RestaurantUser record for chat functionality
    let restaurantUserId = null;
    if (req.role === 'staff') {
      const restaurantUser = await createRestaurantUser(userId, companyProfile.id);
      restaurantUserId = restaurantUser.id;
    }

    const newToken = generateCompanyToken({
      userId,
      userType: req.userType, // Include userType from request
      role: req.role, // Include role from request  
      restaurantId: companyProfile.id,
      restaurantUserId: restaurantUserId, // null for admin users, actual ID for staff
    });

    res.cookie('manu', newToken, {
      httpOnly: true,
      sameSite: 'None',
      secure: true,
    });

    const planInfo = generatePlanInfo(req.user.payment_status, req.requestedLocations, req.locationLimit);

    res.status(201).json({ 
      success: true,
      message: 'Company created successfully', 
      data: companyProfile,
      planInfo
    });
  } catch (error) {
    console.error('Error creating company:', error.message, error.stack);
    res.status(500).json({ 
      success: false,
      message: 'Internal Server Error' 
    });
  }
});

// GET /company/:id - Get company by ID
router.get('/company/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const restaurant = await getCompanyById(id);

    if (restaurant) {
      console.log('this is the restaurant', restaurant.benefits);
      res.status(200).json({ 
        success: true,
        data: restaurant 
      });
    } else {
      res.status(404).json({ 
        success: false,
        error: 'Restaurant not found' 
      });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ 
      success: false,
      message: 'Internal Server Error' 
    });
  }
});

// GET /company - Get current company
router.get('/company', getAuthFromCookie, async (req, res) => {
  try {
    const restaurantId = req.restaurantId;
    const company = await getCompanyByRestaurantId(restaurantId);

    if (company) {
      res.status(200).json({
        success: true,
        data: company
      });
    } else {
      res.status(404).json({ 
        success: false,
        error: 'Company not found' 
      });
    }
  } catch (error) {
    res.status(401).json({ 
      success: false,
      message: 'Invalid token' 
    });
  }
});

// PATCH /company - Update company (require permission to edit company)
router.patch('/company', getAuthFromCookie, requirePermission('edit_company'), checkLocationLimit(), async (req, res) => {
  try {
    const {
      legalName,
      rut,
      name,
      format,
      specialty,
      region,
      comuna,
      numberOfRestaurants,
      workers,
      weeklyAverageClients,
      description,
      benefits,
      locations,
      profileImageUrl,
      profileCarouselUrls,
    } = req.body;

    const restaurantId = req.restaurantId;

    const newLocations = filterNewLocations(locations);
    const existingLocations = filterExistingLocations(locations);
    const currentLocations = await getCurrentLocations(restaurantId);
    const locationsToDelete = findLocationsToDelete(currentLocations, locations);

    await prisma.$transaction(async () => {
      await deleteLocations(locationsToDelete);
      await updateCompanyProfile(restaurantId, {
        legalName,
        rut,
        name,
        format,
        specialty,
        numberOfRestaurants,
        workers,
        profileImageUrl,
        weeklyAverageClients,
        description,
        region,
        comuna,
        benefits,
        existingLocations,
        profileCarouselUrls,
      });
      await createNewLocations(newLocations, restaurantId);
    });

    const planInfo = generateUpdatePlanInfo(req.user.payment_status, req.requestedLocations, req.locationLimit);

    res.status(200).json({ 
      success: true,
      message: 'Company profile updated successfully',
      planInfo
    });
  } catch (error) {
    console.error('Error updating company profile:', error.message, error.stack);
    res.status(500).json({ 
      success: false,
      message: 'Internal Server Error' 
    });
  }
});

module.exports = router;

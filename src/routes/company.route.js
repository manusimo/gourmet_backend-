const express = require('express');
const csrf = require('csurf');
const { prisma } = require('../db.js');

console.log('🔍 Company route - Prisma imported:', typeof prisma, prisma ? 'defined' : 'undefined');
const { checkCompany } = require('../helpers/authenticateToken.js');
const { requireRole, requirePermission, setUserRole } = require('../middleware/auth.js');
const { getUserIdFromCookie, getAuthFromCookie } = require('../helpers/cookies.js');
// const { requirePlan, checkLocationLimit } = require('../middleware/checkPlan.js'); // Temporarily disabled
const { buildFilters, buildSearchConditions } = require('../helpers/filterHelpers.js');
const { deleteLocations, updateCompanyProfile, createNewLocations } = require('../helpers/company.js');
const { getOrderByCriteriaCompanies } = require('../helpers/orderBy.js');
const { verifyCSRFToken } = require('../helpers/csrf.js');
const { setSecureAuthCookie } = require('../helpers/secureCookie.js');
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
  // generatePlanInfo, // Temporarily disabled
  // generateUpdatePlanInfo // Temporarily disabled
} = require('../helpers/companyHelpers.js');

const csrfProtection = csrf({ cookie: true });
const router = express.Router();

// Test endpoint to check database connection
router.get('/test-db', async (req, res) => {
  try {
    console.log('🔍 Testing database connection...');
    const result = await prisma.$queryRaw`SELECT 1 as test`;
    console.log('✅ Database connection successful:', result);
    res.json({ success: true, message: 'Database connection working', result });
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

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

// GET /restaurant/:restaurantUserId - Get restaurant information by restaurantUserId
router.get('/restaurant/:restaurantUserId', async (req, res) => {
  try {
    const { restaurantUserId } = req.params;
    
    console.log('🔍 Restaurant route called with restaurantUserId:', restaurantUserId);

    if (!restaurantUserId || isNaN(restaurantUserId)) {
      console.log('❌ Invalid restaurantUserId:', restaurantUserId);
      return res.status(400).json({ 
        success: false,
        error: 'Invalid or missing restaurantUserId' 
      });
    }

    console.log('🔍 Looking up restaurant user with ID:', parseInt(restaurantUserId));

    // Get restaurant user information
    const restaurantUser = await prisma.restaurantUser.findUnique({
      where: { id: parseInt(restaurantUserId) },
      include: {
        user: true,
        restaurant: true
      }
    });

    console.log('🔍 Restaurant user found:', restaurantUser);

    if (!restaurantUser) {
      console.log('❌ Restaurant user not found for ID:', restaurantUserId);
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
      profileImageUrl: restaurantUser.restaurant.profileImageUrl,
      position: restaurantUser.position || 'Staff Member',
      location: restaurantUser.restaurant.location || 'Location not specified',
      restaurantName: restaurantUser.restaurant.name,
      restaurantDescription: restaurantUser.restaurant.description
    };

    console.log('✅ Returning restaurant info:', restaurantInfo);

    return res.status(200).json({ 
      success: true,
      data: restaurantInfo 
    });
  } catch (error) {
    console.error('❌ Error fetching restaurant information:', error);
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
    console.log('🔍 /company/locations endpoint called');
    console.log('🔍 Request user info:', { 
      userId: req.userId, 
      userType: req.userType, 
      role: req.role,
      restaurantId: req.restaurantId,
      restaurantUserId: req.restaurantUserId 
    });

    const { restaurantId: queryRestaurantId } = req.query;
    const { restaurantId: jwtRestaurantId } = req;
    
    // Use query parameter if provided, otherwise fall back to JWT token
    const restaurantId = queryRestaurantId ? parseInt(queryRestaurantId) : jwtRestaurantId;
    
    console.log('🔍 [Company Locations API] Fetching locations:');
    console.log('  - Query restaurantId:', queryRestaurantId);
    console.log('  - JWT restaurantId:', jwtRestaurantId);
    console.log('  - Using restaurantId:', restaurantId);

    if (!restaurantId) {
      console.log('❌ No restaurantId found in request');
      return res.status(400).json({
        success: false,
        message: 'companyId is required',
      });
    }

    console.log('🔍 Fetching locations for restaurantId:', restaurantId);
    const locations = await getCompanyLocations(restaurantId);
    console.log('🔍 Found locations:', locations.length);

    if (!locations.length) {
      console.log('❌ No locations found for restaurantId:', restaurantId);
      return res.status(404).json({
        success: false,
        message: 'No locations found for this company.',
      });
    }

    const formattedLocations = formatLocations(locations);
    console.log('🔍 Formatted locations:', formattedLocations.length);

    return res.status(200).json({
      success: true,
      data: formattedLocations
    });
  } catch (error) {
    console.error('❌ Error fetching company locations:', error.message);
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
    const { restaurantId: queryRestaurantId } = req.query;
    
    // Use restaurantId from query parameter if provided, otherwise use from JWT token
    const restaurantId = queryRestaurantId ? parseInt(queryRestaurantId) : req.restaurantId;
    
    console.log('🔍 [Talents Application API] Fetching applications for restaurantId:', restaurantId);
    console.log('🔍 [Talents Application API] Using restaurantId from:', queryRestaurantId ? 'query parameter' : 'JWT token');
    
    const talents = await getTalentsApplications(restaurantId);

    console.log('🔍 [Talents Application API] Found applications:', talents.length);

    res.status(200).json({ 
      success: true,
      message: 'Some talents want to be part of this company', 
      data: talents 
    });
  } catch (error) {
    console.error('🔍 [Talents Application API] Error:', error);
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
}, getUserIdFromCookie, setUserRole, requirePermission('create_company'), async (req, res) => {
  
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
    const role = req.role;

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

    // Allow multiple restaurants per user - no need to check for existing company
    console.log('🏢 Creating restaurant for user (multiple restaurants allowed)');

    const companyProfile = await createCompanyProfile(processedData);

    // Admin users don't need RestaurantUser record - they remain as admin users
    const restaurantUserId = null;

    const newToken = generateCompanyToken({
      userId,
      userType: req.userType, // Include userType from request
      role: req.role, // Include role from request  
      restaurantId: companyProfile.id,
      restaurantUserId: restaurantUserId, // null for admin users, actual ID for staff
    });

    // Set secure authentication cookie (cross-domain support)
    setSecureAuthCookie(res, newToken);

    res.status(201).json({ 
      success: true,
      message: 'Company created successfully', 
      data: companyProfile
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
    const { restaurantId: queryRestaurantId } = req.query;
    const { restaurantId: jwtRestaurantId } = req;
    
    // Use query parameter if provided, otherwise fall back to JWT token
    const restaurantId = queryRestaurantId ? parseInt(queryRestaurantId) : jwtRestaurantId;
    
    console.log('🔍 [Company Profile API] Fetching company profile:');
    console.log('  - Query restaurantId:', queryRestaurantId);
    console.log('  - JWT restaurantId:', jwtRestaurantId);
    console.log('  - Using restaurantId:', restaurantId);
    
    const company = await getCompanyByRestaurantId(restaurantId);

    if (company) {
      console.log('🔍 [Company Profile API] Found company:', company.name);
      res.status(200).json({
        success: true,
        data: company
      });
    } else {
      console.log('🔍 [Company Profile API] Company not found for restaurantId:', restaurantId);
      res.status(404).json({ 
        success: false,
        error: 'Company not found' 
      });
    }
  } catch (error) {
    console.error('🔍 [Company Profile API] Error:', error);
    res.status(401).json({ 
      success: false,
      message: 'Invalid token' 
    });
  }
});

// PATCH /company - Update company (require permission to edit company)
router.patch('/company', getAuthFromCookie, requirePermission('edit_company'), async (req, res) => {
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

    const { restaurantId: queryRestaurantId } = req.query;
    const { restaurantId: jwtRestaurantId } = req;
    
    // Use query parameter if provided, otherwise fall back to JWT token
    const restaurantId = queryRestaurantId ? parseInt(queryRestaurantId) : jwtRestaurantId;
    
    console.log('🔍 [Company Update API] Updating company profile:');
    console.log('  - Query restaurantId:', queryRestaurantId);
    console.log('  - JWT restaurantId:', jwtRestaurantId);
    console.log('  - Using restaurantId:', restaurantId);

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

    res.status(200).json({ 
      success: true,
      message: 'Company profile updated successfully'
    });
  } catch (error) {
    console.error('Error updating company profile:', error.message, error.stack);
    res.status(500).json({ 
      success: false,
      message: 'Internal Server Error' 
    });
  }
});

// DELETE /company/:id - Delete restaurant/company
router.delete('/company/:id', getAuthFromCookie, async (req, res) => {
  try {
    const restaurantId = parseInt(req.params.id, 10);
    const userId = req.userId;

    if (!restaurantId || isNaN(restaurantId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid restaurant ID'
      });
    }

    console.log('🗑️ [Delete Restaurant] Attempting to delete restaurant:', {
      restaurantId,
      userId
    });

    // Verify the restaurant exists and user owns it
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        id: true,
        name: true,
        userId: true
      }
    });

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Restaurant not found'
      });
    }

    // Check if user owns this restaurant
    if (restaurant.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to delete this restaurant'
      });
    }

    console.log('🗑️ [Delete Restaurant] Restaurant found, starting cascade delete...');

    // Delete all related data in a transaction
    await prisma.$transaction(async (tx) => {
      // Get all job offers for this restaurant
      const jobOffers = await tx.jobOffer.findMany({
        where: { restaurantId: restaurantId }
      });

      console.log('🗑️ [Delete Restaurant] Found job offers:', jobOffers.length);

      // For each job offer: delete dependent entities
      for (const jobOffer of jobOffers) {
        // Get applications for this job offer
        const applications = await tx.application.findMany({
          where: { jobPostId: jobOffer.id }
        });

        // Delete answers for applications
        for (const application of applications) {
          await tx.answer.deleteMany({
            where: { applicationId: application.id }
          });
        }

        // Delete applications
        await tx.application.deleteMany({
          where: { jobPostId: jobOffer.id }
        });

        // Delete questions
        await tx.question.deleteMany({
          where: { jobOfferId: jobOffer.id }
        });

        // Delete favourite jobs
        await tx.favouriteJob.deleteMany({
          where: { jobOfferId: jobOffer.id }
        });
      }

      // Delete all job offers
      await tx.jobOffer.deleteMany({
        where: { restaurantId: restaurantId }
      });

      // Delete locations
      await tx.location.deleteMany({
        where: { restaurantId: restaurantId }
      });

      // Delete messages and conversations
      const conversations = await tx.conversation.findMany({
        where: { restaurantId: restaurantId }
      });

      for (const conversation of conversations) {
        await tx.message.deleteMany({
          where: { conversationId: conversation.id }
        });
      }

      await tx.conversation.deleteMany({
        where: { restaurantId: restaurantId }
      });

      // Delete talent pool entries
      await tx.talentPool.deleteMany({
        where: { restaurantId: restaurantId }
      });

      // Delete restaurant user associations
      await tx.restaurantUser.deleteMany({
        where: { restaurantId: restaurantId }
      });

      // Delete AI agents
      await tx.aiAgent.deleteMany({
        where: { restaurantId: restaurantId }
      });

      // Delete scheduled calls
      await tx.scheduledCall.deleteMany({
        where: { restaurantId: restaurantId }
      });

      // Finally delete the restaurant
      await tx.restaurant.delete({
        where: { id: restaurantId }
      });

      console.log('✅ [Delete Restaurant] Restaurant and all related data deleted successfully');
    });

    res.status(200).json({
      success: true,
      message: 'Restaurant deleted successfully'
    });
  } catch (error) {
    console.error('❌ [Delete Restaurant] Error deleting restaurant:', error);
    res.status(500).json({
      success: false,
      message: 'Internal Server Error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;

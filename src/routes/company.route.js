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
const { convertImageUrls } = require('../utils/imageUrlUtils.js');
const { uploadFile, uploadMultipleFiles, extractKeyFromUrl } = require('../services/uploadService.js');
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

    // Convert image keys to actual signed URLs for each company
    const companiesWithSignedUrls = await Promise.all(
      companies.map(async (company) => {
        return await convertImageUrls(company, ['profileImageUrl', 'profileCarouselUrls']);
      })
    );

    res.json({
      success: true,
      data: companiesWithSignedUrls,
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

    // Convert image keys to signed URLs for each company
    const companiesWithSignedUrls = await Promise.all(
      companies.map(async (company) => {
        const companyWithUrls = await convertImageUrls(company, ['profileImageUrl', 'profileCarouselUrls']);
        return {
          ...companyWithUrls,
          jobOffersCount: company._count.jobOffers,
        };
      })
    );

    res.json({
      success: true,
      data: companiesWithSignedUrls,
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
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🏢 POST /company - Creating company profile');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🏢 [POST /company] Request cookies:', req.cookies);
    console.log('🏢 [POST /company] User ID from middleware:', req.userId);
    console.log('🏢 [POST /company] User type from middleware:', req.userType);
    console.log('🏢 [POST /company] User role from middleware:', req.userRole);
    console.log('🏢 [POST /company] Request body keys:', Object.keys(req.body));
    console.log('🏢 [POST /company] Request files count:', req.files ? req.files.length : 0);
    console.log('🏢 [POST /company] Request files:', req.files ? req.files.map(f => ({ 
      fieldname: f.fieldname, 
      originalname: f.originalname, 
      mimetype: f.mimetype,
      size: f.size,
      bufferSize: f.buffer ? f.buffer.length : 'no buffer'
    })) : 'No files');

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

    // Log initial locations type and value
    console.log('🏢 [POST /company] Initial locations type:', typeof locations);
    console.log('🏢 [POST /company] Initial locations value:', locations);
    console.log('🏢 [POST /company] Is locations an array?', Array.isArray(locations));

    // Parse JSON strings from FormData (locations, benefits, profileCarouselUrls)
    if (typeof locations === 'string') {
      try {
        locations = JSON.parse(locations);
        console.log('🏢 [POST /company] Parsed locations from JSON string');
        console.log('🏢 [POST /company] Parsed locations type:', typeof locations);
        console.log('🏢 [POST /company] Parsed locations is array?', Array.isArray(locations));
      } catch (error) {
        console.error('🏢 [POST /company] Error parsing locations:', error.message);
        locations = [];
      }
    }
    
    // Ensure locations is always an array (handle null, undefined, objects, etc.)
    if (!Array.isArray(locations)) {
      console.log('🏢 [POST /company] Locations is not an array after parsing, converting. Type:', typeof locations);
      if (locations === null || locations === undefined) {
        locations = [];
      } else if (typeof locations === 'object') {
        // If it's an object, try to convert to array
        locations = Object.keys(locations).length > 0 ? [locations] : [];
      } else {
        locations = [];
      }
      console.log('🏢 [POST /company] Locations after conversion:', locations);
    }
    
    if (typeof benefits === 'string') {
      try {
        benefits = JSON.parse(benefits);
        console.log('🏢 [POST /company] Parsed benefits from JSON string');
      } catch (error) {
        console.error('🏢 [POST /company] Error parsing benefits:', error.message);
        benefits = {};
      }
    }
    
    if (typeof profileCarouselUrls === 'string') {
      try {
        profileCarouselUrls = JSON.parse(profileCarouselUrls);
        console.log('🏢 [POST /company] Parsed profileCarouselUrls from JSON string');
      } catch (error) {
        console.error('🏢 [POST /company] Error parsing profileCarouselUrls:', error.message);
        profileCarouselUrls = [];
      }
    }

    // Handle file upload for profile image
    let finalProfileImageUrl = (() => {
      if (!profileImageUrl) return profileImageUrl;
      if (typeof profileImageUrl === 'string' && profileImageUrl.includes('/api/company/signed-url/')) {
        return profileImageUrl.split('/api/company/signed-url/')[1];
      }
      const maybeKey = extractKeyFromUrl(profileImageUrl);
      return maybeKey || profileImageUrl;
    })();

    const profileImageFile = req.files && req.files.find(file => file.fieldname === 'profileImage');
    if (profileImageFile) {
      console.log('📤 [POST /company] Uploading profile image...');
      console.log('📤 [POST /company] File details:', {
        originalname: profileImageFile.originalname,
        mimetype: profileImageFile.mimetype,
        size: profileImageFile.size,
        bufferSize: profileImageFile.buffer ? profileImageFile.buffer.length : 'no buffer'
      });
      
      const profileImageResult = await uploadFile(profileImageFile, 'company-profiles');
      if (profileImageResult.success) {
        finalProfileImageUrl = profileImageResult.key;
        console.log('✅ [POST /company] Profile image uploaded successfully, key stored:', finalProfileImageUrl);
      } else {
        console.error('❌ [POST /company] Profile image upload failed:', profileImageResult.error);
        return res.status(400).json({
          success: false,
          message: 'Failed to upload profile image',
          error: profileImageResult.error
        });
      }
    } else {
      console.log('📤 [POST /company] No profile image file uploaded, using existing URL or default');
    }

    // Handle gallery/carousel images upload
    const galleryImageFiles = req.files && req.files.filter(file => file.fieldname === 'galleryImages');
    let finalProfileCarouselUrls = Array.isArray(profileCarouselUrls) ? profileCarouselUrls : [];
    
    if (galleryImageFiles && galleryImageFiles.length > 0) {
      console.log('📤 [POST /company] Uploading gallery images...');
      console.log('📤 [POST /company] Gallery files count:', galleryImageFiles.length);
      console.log('📤 [POST /company] Gallery files details:', galleryImageFiles.map(f => ({
        originalname: f.originalname,
        mimetype: f.mimetype,
        size: f.size
      })));
      
      const galleryUploadResult = await uploadMultipleFiles(galleryImageFiles, 'company-gallery');
      if (galleryUploadResult.success) {
        const newGalleryKeys = galleryUploadResult.files.map(file => file.key);
        // Combine existing URLs (if any) with new uploaded keys
        // Filter out blob URLs (previews) and keep only existing keys/URLs
        const existingUrls = finalProfileCarouselUrls.filter(url => 
          !url.startsWith('blob:') && !url.includes('signed-url')
        );
        finalProfileCarouselUrls = [...existingUrls, ...newGalleryKeys];
        console.log('✅ [POST /company] Gallery images uploaded successfully, total URLs:', finalProfileCarouselUrls.length);
        console.log('✅ [POST /company] Gallery keys:', newGalleryKeys);
      } else {
        console.error('❌ [POST /company] Gallery images upload failed:', galleryUploadResult.error);
        return res.status(400).json({
          success: false,
          message: 'Failed to upload gallery images',
          error: galleryUploadResult.error
        });
      }
    } else {
      console.log('📤 [POST /company] No gallery images uploaded, using existing URLs');
      // Process existing carousel URLs to extract keys if needed
      finalProfileCarouselUrls = finalProfileCarouselUrls.map(url => {
        if (url.includes('/api/company/signed-url/')) {
          return url.split('/api/company/signed-url/')[1];
        }
        const maybeKey = extractKeyFromUrl(url);
        return maybeKey || url;
      });
    }

    const userId = req.userId;
    const role = req.role;

    console.log('🏢 [POST /company] About to create company profile for userId:', userId);
    console.log('🏢 [POST /company] Request body data:', {
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
      benefits: Array.isArray(benefits) ? benefits.length : 'not array',
      locations: Array.isArray(locations) ? locations.length : 'not array',
      jobOffers: Array.isArray(jobOffers) ? jobOffers.length : 'not array',
      profileImageUrl: profileImageUrl ? 'provided' : 'not provided',
      profileCarouselUrls: Array.isArray(profileCarouselUrls) ? profileCarouselUrls.length : 'not array'
    });

    // Data validation and conversion
    console.log('🏢 [POST /company] Processing and validating data...');
    
    // Final safety check: ensure locations is an array
    if (!Array.isArray(locations)) {
      console.warn('⚠️ [POST /company] WARNING: locations is not an array before processedData. Type:', typeof locations, 'Value:', locations);
      if (typeof locations === 'string') {
        try {
          locations = JSON.parse(locations);
          console.log('🔄 [POST /company] Re-parsed locations from string in final check');
        } catch (e) {
          console.error('❌ [POST /company] Failed to parse locations in final check:', e.message);
          locations = [];
        }
      } else {
        locations = [];
      }
    }
    console.log('🏢 [POST /company] Final locations check - is array:', Array.isArray(locations), 'count:', locations.length);
    
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
      locations: Array.isArray(locations) ? locations : [],
      jobOffers: Array.isArray(jobOffers) ? jobOffers : [],
      profileImageUrl: finalProfileImageUrl || 'No photo',
      profileCarouselUrls: finalProfileCarouselUrls,
      userId
    };

    console.log('🏢 [POST /company] Processed data summary:');
    console.log('  - Name:', processedData.name);
    console.log('  - Format:', processedData.format);
    console.log('  - Specialty:', processedData.specialty);
    console.log('  - Region:', processedData.region);
    console.log('  - Comuna:', processedData.comuna);
    console.log('  - Locations count:', processedData.locations.length);
    console.log('  - Benefits count:', processedData.benefits.length);
    console.log('  - Final profileImageUrl:', processedData.profileImageUrl);
    console.log('  - Final profileCarouselUrls count:', processedData.profileCarouselUrls.length);

    // Allow multiple restaurants per user - no need to check for existing company
    console.log('🏢 [POST /company] Creating restaurant for user (multiple restaurants allowed)');
    console.log('🏢 [POST /company] Calling createCompanyProfile...');
    
    const companyProfile = await createCompanyProfile(processedData);
    console.log('✅ [POST /company] Company profile created successfully!');
    console.log('  - Company ID:', companyProfile.id);
    console.log('  - Company Name:', companyProfile.name);
    console.log('  - Created At:', companyProfile.createdAt);

    // Admin users don't need RestaurantUser record - they remain as admin users
    const restaurantUserId = null;

    console.log('🏢 Generating company token...');
    const newToken = generateCompanyToken({
      userId,
      userType: req.userType, // Include userType from request
      role: req.role, // Include role from request  
      restaurantId: companyProfile.id,
      restaurantUserId: restaurantUserId, // null for admin users, actual ID for staff
    });
    console.log('✅ [POST /company] Token generated successfully');

    // Set secure authentication cookie (subdomain support)
    setSecureAuthCookie(res, newToken);
    console.log('✅ [POST /company] Authentication cookie set');

    console.log('✅ [POST /company] Company creation completed successfully');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    res.status(201).json({ 
      success: true,
      message: 'Company created successfully', 
      data: {
        ...companyProfile,
        token: newToken // Include token for mobile browsers that can't use cookies
      }
    });
  } catch (error) {
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('❌ [POST /company] ERROR creating company:');
    console.error('  - Error message:', error.message);
    console.error('  - Error stack:', error.stack);
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
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
      console.log('🔍 [GET /company/:id] Company found:', restaurant.name);
      console.log('🔍 [GET /company/:id] Converting image URLs to signed URLs...');
      
      // Convert image keys to signed URLs
      const companyWithSignedUrls = await convertImageUrls(restaurant, ['profileImageUrl', 'profileCarouselUrls']);
      
      res.status(200).json({ 
        success: true,
        data: companyWithSignedUrls 
      });
    } else {
      res.status(404).json({ 
        success: false,
        error: 'Restaurant not found' 
      });
    }
  } catch (error) {
    console.error('❌ [GET /company/:id] Error:', error);
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
      console.log('🔍 [Company Profile API] Converting image URLs to signed URLs...');
      
      // Convert image keys to signed URLs
      const companyWithSignedUrls = await convertImageUrls(company, ['profileImageUrl', 'profileCarouselUrls']);
      
      res.status(200).json({
        success: true,
        data: companyWithSignedUrls
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
    
    let {
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

    // Parse JSON strings from FormData (locations, benefits, profileCarouselUrls)
    if (typeof locations === 'string') {
      try {
        locations = JSON.parse(locations);
        console.log('🔄 [PATCH /company] Parsed locations from JSON string');
        console.log('🔄 [PATCH /company] Parsed locations type:', typeof locations);
        console.log('🔄 [PATCH /company] Parsed locations is array?', Array.isArray(locations));
      } catch (error) {
        console.error('🔄 [PATCH /company] Error parsing locations:', error.message);
        locations = [];
      }
    }
    
    // Ensure locations is always an array (handle null, undefined, objects, etc.)
    if (!Array.isArray(locations)) {
      console.log('🔄 [PATCH /company] Locations is not an array after parsing, converting. Type:', typeof locations);
      if (locations === null || locations === undefined) {
        locations = [];
      } else if (typeof locations === 'object') {
        // If it's an object, try to convert to array
        locations = Object.keys(locations).length > 0 ? [locations] : [];
      } else {
        locations = [];
      }
      console.log('🔄 [PATCH /company] Locations after conversion:', locations);
    }
    
    if (typeof benefits === 'string') {
      try {
        benefits = JSON.parse(benefits);
        console.log('🔄 [PATCH /company] Parsed benefits from JSON string');
      } catch (error) {
        console.error('🔄 [PATCH /company] Error parsing benefits:', error.message);
        benefits = {};
      }
    }
    
    if (typeof profileCarouselUrls === 'string') {
      try {
        profileCarouselUrls = JSON.parse(profileCarouselUrls);
        console.log('🔄 [PATCH /company] Parsed profileCarouselUrls from JSON string');
      } catch (error) {
        console.error('🔄 [PATCH /company] Error parsing profileCarouselUrls:', error.message);
        profileCarouselUrls = [];
      }
    }

    const { restaurantId: queryRestaurantId } = req.query;
    const { restaurantId: jwtRestaurantId } = req;
    
    // Use query parameter if provided, otherwise fall back to JWT token
    const restaurantId = queryRestaurantId ? parseInt(queryRestaurantId) : jwtRestaurantId;
    
    console.log('🔄 [PATCH /company] Updating company profile:');
    console.log('  - Query restaurantId:', queryRestaurantId);
    console.log('  - JWT restaurantId:', jwtRestaurantId);
    console.log('  - Using restaurantId:', restaurantId);
    console.log('  - Company name:', name);
    console.log('  - Format:', format);
    console.log('  - Specialty:', specialty);
    console.log('  - Region:', region);
    console.log('  - Comuna:', comuna);
    console.log('  - Current profileImageUrl from body:', profileImageUrl);
    console.log('  - Current profileCarouselUrls from body:', Array.isArray(profileCarouselUrls) ? profileCarouselUrls.length : 'not array');

    // Handle file upload for profile image
    let finalProfileImageUrl = (() => {
      if (!profileImageUrl) return profileImageUrl;
      if (typeof profileImageUrl === 'string' && profileImageUrl.includes('/api/company/signed-url/')) {
        return profileImageUrl.split('/api/company/signed-url/')[1];
      }
      const maybeKey = extractKeyFromUrl(profileImageUrl);
      return maybeKey || profileImageUrl;
    })();

    const profileImageFile = req.files && req.files.find(file => file.fieldname === 'profileImage');
    if (profileImageFile) {
      console.log('📤 [PATCH /company] Uploading updated profile image...');
      console.log('📤 [PATCH /company] File details:', {
        originalname: profileImageFile.originalname,
        mimetype: profileImageFile.mimetype,
        size: profileImageFile.size,
        bufferSize: profileImageFile.buffer ? profileImageFile.buffer.length : 'no buffer'
      });
      
      const profileImageResult = await uploadFile(profileImageFile, 'company-profiles');
      if (profileImageResult.success) {
        finalProfileImageUrl = profileImageResult.key;
        console.log('✅ [PATCH /company] Profile image updated successfully, key stored:', finalProfileImageUrl);
      } else {
        console.error('❌ [PATCH /company] Profile image upload failed:', profileImageResult.error);
        return res.status(400).json({
          success: false,
          message: 'Failed to upload profile image',
          error: profileImageResult.error
        });
      }
    } else {
      console.log('📤 [PATCH /company] No profile image file uploaded, keeping existing:', finalProfileImageUrl);
    }

    // Handle gallery/carousel images upload
    const galleryImageFiles = req.files && req.files.filter(file => file.fieldname === 'galleryImages');
    let finalProfileCarouselUrls = Array.isArray(profileCarouselUrls) ? profileCarouselUrls : [];
    
    if (galleryImageFiles && galleryImageFiles.length > 0) {
      console.log('📤 [PATCH /company] Uploading gallery images...');
      console.log('📤 [PATCH /company] Gallery files count:', galleryImageFiles.length);
      console.log('📤 [PATCH /company] Gallery files details:', galleryImageFiles.map(f => ({
        originalname: f.originalname,
        mimetype: f.mimetype,
        size: f.size
      })));
      
      const galleryUploadResult = await uploadMultipleFiles(galleryImageFiles, 'company-gallery');
      if (galleryUploadResult.success) {
        const newGalleryKeys = galleryUploadResult.files.map(file => file.key);
        // Combine existing URLs (if any) with new uploaded keys
        // Filter out blob URLs (previews) and keep only existing keys/URLs
        const existingUrls = finalProfileCarouselUrls.filter(url => 
          !url.startsWith('blob:') && !url.includes('signed-url')
        );
        finalProfileCarouselUrls = [...existingUrls, ...newGalleryKeys];
        console.log('✅ [PATCH /company] Gallery images uploaded successfully, total URLs:', finalProfileCarouselUrls.length);
        console.log('✅ [PATCH /company] Gallery keys:', newGalleryKeys);
      } else {
        console.error('❌ [PATCH /company] Gallery images upload failed:', galleryUploadResult.error);
        return res.status(400).json({
          success: false,
          message: 'Failed to upload gallery images',
          error: galleryUploadResult.error
        });
      }
    } else {
      console.log('📤 [PATCH /company] No gallery images uploaded, using existing URLs');
      // Process existing carousel URLs to extract keys if needed
      finalProfileCarouselUrls = finalProfileCarouselUrls.map(url => {
        if (url.includes('/api/company/signed-url/')) {
          return url.split('/api/company/signed-url/')[1];
        }
        const maybeKey = extractKeyFromUrl(url);
        return maybeKey || url;
      });
    }

    console.log('🔄 [PATCH /company] Processing locations...');
    console.log('  - Locations type:', typeof locations);
    console.log('  - Locations is array?', Array.isArray(locations));
    console.log('  - Locations count:', locations.length);
    console.log('  - Locations value:', JSON.stringify(locations, null, 2));
    const newLocations = filterNewLocations(locations);
    const existingLocations = filterExistingLocations(locations);
    const currentLocations = await getCurrentLocations(restaurantId);
    const locationsToDelete = findLocationsToDelete(currentLocations, locations);
    console.log('🔄 [PATCH /company] Locations breakdown:');
    console.log('  - Current locations in DB:', currentLocations.length);
    console.log('  - New locations to create:', newLocations.length);
    console.log('  - Existing locations to update:', existingLocations.length);
    console.log('  - Locations to delete:', locationsToDelete.length);

    console.log('🔄 [PATCH /company] Starting database transaction...');
    console.log('🔄 [PATCH /company] Final profileImageUrl to save:', finalProfileImageUrl);
    console.log('🔄 [PATCH /company] Final profileCarouselUrls to save:', finalProfileCarouselUrls.length, 'images');
    
    await prisma.$transaction(async () => {
      await deleteLocations(locationsToDelete);
      console.log('✅ [PATCH /company] Deleted locations');
      
      await updateCompanyProfile(restaurantId, {
        legalName,
        rut,
        name,
        format,
        specialty,
        numberOfRestaurants,
        workers,
        profileImageUrl: finalProfileImageUrl,
        weeklyAverageClients,
        description,
        region,
        comuna,
        benefits,
        existingLocations,
        profileCarouselUrls: finalProfileCarouselUrls,
      });
      console.log('✅ [PATCH /company] Updated company profile');
      
      await createNewLocations(newLocations, restaurantId);
      console.log('✅ [PATCH /company] Created new locations');
    });

    console.log('✅ [PATCH /company] Company profile updated successfully');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    res.status(200).json({ 
      success: true,
      message: 'Company profile updated successfully'
    });
  } catch (error) {
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('❌ [PATCH /company] ERROR updating company profile:');
    console.error('  - Error message:', error.message);
    console.error('  - Error stack:', error.stack);
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
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

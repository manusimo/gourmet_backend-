const express = require('express');
const csrf = require('csurf');
const multer = require('multer');
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
const { convertImageUrls, convertImageKeyToSignedUrl } = require('../utils/imageUrlUtils.js');

const csrfProtection = csrf({ cookie: true });
const router = express.Router();

// Import upload service
const { uploadFile, uploadMultipleFiles, extractKeyFromUrl } = require('../services/uploadService.js');

// Multer is configured globally in index.js


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
        const updatedCompany = { ...company };
        
        // Convert profile image URL
        if (updatedCompany.profileImageUrl) {
          updatedCompany.profileImageUrl = await convertImageKeyToSignedUrl(updatedCompany.profileImageUrl);
        }
        
        // Convert carousel image URLs
        if (updatedCompany.profileCarouselUrls && Array.isArray(updatedCompany.profileCarouselUrls)) {
          updatedCompany.profileCarouselUrls = await Promise.all(
            updatedCompany.profileCarouselUrls.map(url => convertImageKeyToSignedUrl(url))
          );
        }
        
        return updatedCompany;
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
router.get('/company/restaurantUser/:userId', async (req, res) => {
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

    // Convert employee profile image URLs to actual signed URLs
    const talentsWithSignedUrls = await Promise.all(
      talents.map(async (talent) => {
        const convertedTalent = { ...talent };
        if (talent.employee) {
          convertedTalent.employee = await convertImageUrls(talent.employee, ['profileImageUrl']);
        }
        return convertedTalent;
      })
    );

    res.status(200).json({ 
      success: true,
      message: 'Some talents want to be part of this company', 
      data: talentsWithSignedUrls 
    });
  } catch (error) {
    console.error('🔍 [Talents Application API] Error:', error);
    res.status(500).json({ 
      success: false,
      message: "Internal Server Error" 
    });
  }
});

// Middleware for company creation (multer is handled globally)

const createCompanyMiddleware = [
  (req, res, next) => {
    console.log('🚨 POST /company route HIT - Request received!');
    console.log('🚨 Method:', req.method);
    console.log('🚨 URL:', req.url);
    console.log('🚨 Headers:', req.headers);
    next();
  },
  getUserIdFromCookie,
  setUserRole,
  requirePermission('create_company'),
  (req, res, next) => {
    // Log what global multer parsed into body/files
    try {
      console.log('🧩 Global multer parsing complete for POST /company');
      console.log('🧩 req.body keys:', Object.keys(req.body || {}));
      if (req.files) {
        console.log('🧩 req.files count:', req.files.length);
        console.log('🧩 req.files details:', req.files.map(f => ({ 
          fieldname: f.fieldname, 
          originalname: f.originalname, 
          mimetype: f.mimetype, 
          size: f.size 
        })));
      } else {
        console.log('🧩 req.files is undefined/null');
      }
    } catch (e) {
      console.log('🧩 Error while logging multer results:', e.message);
    }
    next();
  }
];

// POST /company - Create company (require admin or manager role)
router.post('/company', ...createCompanyMiddleware, async (req, res) => {
  
  try {
    console.log('🏢 POST /company - Creating company profile');
    console.log('🏢 Request cookies:', req.cookies);
    console.log('🏢 User ID from middleware:', req.userId);
    console.log('🏢 User type from middleware:', req.userType);
    console.log('🏢 User role from middleware:', req.userRole);
    console.log('🏢 Request body keys:', Object.keys(req.body));
    console.log('🏢 Files present?', !!req.files, 'Keys:', req.files ? Object.keys(req.files) : null);
    if (req.files && req.files.profileImage && req.files.profileImage[0]) {
      console.log('🏢 profileImage[0] buffer bytes:', req.files.profileImage[0].buffer ? req.files.profileImage[0].buffer.length : 'no buffer');
    }
    if (req.files && req.files.galleryImages && req.files.galleryImages.length) {
      console.log('🏢 galleryImages buffers:', req.files.galleryImages.map(f => f.buffer ? f.buffer.length : 'no buffer'));
    }

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
      benefits: benefitsRaw,
      locations: locationsRaw,
      jobOffers,
      profileImageUrl,
      profileCarouselUrls: profileCarouselUrlsRaw
    } = req.body;

    // Parse JSON strings from FormData
    const benefits = typeof benefitsRaw === 'string' ? JSON.parse(benefitsRaw) : benefitsRaw;
    const locations = typeof locationsRaw === 'string' ? JSON.parse(locationsRaw) : locationsRaw;
    const profileCarouselUrls = typeof profileCarouselUrlsRaw === 'string' ? JSON.parse(profileCarouselUrlsRaw) : profileCarouselUrlsRaw;

    const userId = req.userId;
    const role = req.role;

    // Handle file uploads
    let finalProfileImageUrl = 'No photo'; // Start with default, will be updated if file is uploaded
    let finalProfileCarouselUrls = Array.isArray(profileCarouselUrls) ? profileCarouselUrls : [];


    

    // Process files from global multer (all files in req.files array)
    if (req.files && req.files.length > 0) {
      console.log('📤 Processing files from global multer:', req.files.length);
      
      // Separate profile image from gallery images
      const profileImageFile = req.files.find(file => file.fieldname === 'profileImage');
      const galleryImageFiles = req.files.filter(file => file.fieldname === 'galleryImages');
      
      console.log('📤 Profile image found:', !!profileImageFile);
      console.log('📤 Gallery images found:', galleryImageFiles.length);
      
      // Upload profile image if provided
      if (profileImageFile) {
        console.log('📤 Uploading profile image...');
        const profileImageResult = await uploadFile(profileImageFile, 'company-profiles');
        if (profileImageResult.success) {
          finalProfileImageUrl = profileImageResult.key;
          console.log('✅ Profile image uploaded, key stored:', finalProfileImageUrl);
        } else {
          console.error('❌ Profile image upload failed:', profileImageResult.error);
          return res.status(400).json({
            success: false,
            message: 'Failed to upload profile image',
            error: profileImageResult.error
          });
        }
      }
      
      // Upload gallery images if provided
      if (galleryImageFiles.length > 0) {
        console.log('📤 Uploading gallery images...', galleryImageFiles.length);
        const galleryResult = await uploadMultipleFiles(galleryImageFiles, 'company-gallery');
        console.log('📤 Gallery upload result:', galleryResult);
        
        if (galleryResult.success) {
          const galleryKeys = galleryResult.files.map(file => file.key);
          console.log('📤 Gallery keys generated:', galleryKeys);
          finalProfileCarouselUrls = [...finalProfileCarouselUrls, ...galleryKeys];
          console.log('✅ Gallery images uploaded, keys stored:', galleryKeys.length);
        } else {
          console.error('❌ Gallery images upload failed:', galleryResult.error);
          return res.status(400).json({
            success: false,
            message: 'Failed to upload gallery images',
            error: galleryResult.error
          });
        }
      }
    } else {
      console.log('📤 No files provided in request');
    }

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
    
    console.log('🏢 Final processed data before database save:');
    console.log('  - finalProfileImageUrl:', finalProfileImageUrl);
    console.log('  - finalProfileCarouselUrls:', finalProfileCarouselUrls);
    console.log('  - finalProfileCarouselUrls length:', finalProfileCarouselUrls.length);

    // Data validation and conversion
    // Normalize image fields: drop blob: URLs and convert full URLs to keys
    const normalizeToKey = (value) => {
      if (!value) return value;
      if (typeof value !== 'string') return value;
      if (value.startsWith('blob:')) return null; // ignore preview blobs
      const maybeKey = extractKeyFromUrl(value);
      return maybeKey || value;
    };

    // Handle existing profile image URL from form (if no new file was uploaded)
    if (finalProfileImageUrl === 'No photo' && profileImageUrl && !profileImageUrl.startsWith('blob:')) {
      const existingKey = normalizeToKey(profileImageUrl);
      if (existingKey) {
        finalProfileImageUrl = existingKey;
      }
    }

    const normalizedCarouselKeys = (finalProfileCarouselUrls || [])
      .map(normalizeToKey)
      .filter(Boolean);

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
      locations: typeof locations === 'string' ? JSON.parse(locations) : (locations || []),
      jobOffers: jobOffers || [],
      profileImageUrl: finalProfileImageUrl,
      profileCarouselUrls: normalizedCarouselKeys,
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

    res.cookie('manu', newToken, {
      httpOnly: true,
      sameSite: 'None',
      secure: true,
    });

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
      console.log('🏢 [Company GET] Restaurant data before conversion:', {
        id: restaurant.id,
        name: restaurant.name,
        profileImageUrl: restaurant.profileImageUrl,
        profileCarouselUrls: restaurant.profileCarouselUrls,
        profileCarouselUrlsType: typeof restaurant.profileCarouselUrls,
        profileCarouselUrlsIsArray: Array.isArray(restaurant.profileCarouselUrls)
      });
      
      // Convert image keys to actual signed URLs
      const restaurantWithSignedUrls = await convertImageUrls(restaurant, ['profileImageUrl', 'profileCarouselUrls']);
      
      console.log('🏢 [Company GET] Restaurant data after conversion:', {
        id: restaurantWithSignedUrls.id,
        name: restaurantWithSignedUrls.name,
        profileImageUrl: restaurantWithSignedUrls.profileImageUrl,
        profileCarouselUrls: restaurantWithSignedUrls.profileCarouselUrls,
        profileCarouselUrlsType: typeof restaurantWithSignedUrls.profileCarouselUrls,
        profileCarouselUrlsIsArray: Array.isArray(restaurantWithSignedUrls.profileCarouselUrls)
      });
      
      res.status(200).json({ 
        success: true,
        data: restaurantWithSignedUrls 
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
      
      // Convert image keys to actual signed URLs
      if (company.profileImageUrl) {
        company.profileImageUrl = await convertImageKeyToSignedUrl(company.profileImageUrl);
      }
      
      if (company.profileCarouselUrls && Array.isArray(company.profileCarouselUrls)) {
        company.profileCarouselUrls = await Promise.all(
          company.profileCarouselUrls.map(url => convertImageKeyToSignedUrl(url))
        );
      }
      
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

// Middleware for company update (multer is handled globally)
const updateCompanyMiddleware = [
  getAuthFromCookie,
  requirePermission('edit_company')
];

// PATCH /company - Update company (require permission to edit company)
router.patch('/company', ...updateCompanyMiddleware, async (req, res) => {
  try {
    console.log('🔍 [Company Update API] Request received');
    console.log('🔍 Request body keys:', Object.keys(req.body));
    console.log('🔍 Files present?', !!req.files, 'Count:', req.files ? req.files.length : 0);
    if (req.files && req.files.length > 0) {
      console.log('🔍 Files details:', req.files.map(f => ({ fieldname: f.fieldname, originalname: f.originalname, size: f.size })));
    }

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
      benefits: benefitsRaw,
      locations: locationsRaw,
      profileImageUrl,
      profileCarouselUrls: profileCarouselUrlsRaw,
    } = req.body;

    // Parse JSON strings from FormData
    const benefits = typeof benefitsRaw === 'string' ? JSON.parse(benefitsRaw) : benefitsRaw;
    const locations = typeof locationsRaw === 'string' ? JSON.parse(locationsRaw) : locationsRaw;
    const profileCarouselUrls = typeof profileCarouselUrlsRaw === 'string' ? JSON.parse(profileCarouselUrlsRaw) : profileCarouselUrlsRaw;

    const { restaurantId: queryRestaurantId } = req.query;
    const { restaurantId: jwtRestaurantId } = req;
    
    // Use query parameter if provided, otherwise fall back to JWT token
    const restaurantId = queryRestaurantId ? parseInt(queryRestaurantId) : jwtRestaurantId;
    
    console.log('🔍 [Company Update API] Updating company profile:');
    console.log('  - Query restaurantId:', queryRestaurantId);
    console.log('  - JWT restaurantId:', jwtRestaurantId);
    console.log('  - Using restaurantId:', restaurantId);

    // Handle file uploads - similar to POST route
    let finalProfileImageUrl = profileImageUrl; // Start with existing URL
    let finalProfileCarouselUrls = Array.isArray(profileCarouselUrls) ? profileCarouselUrls : [];

    // Process files from global multer (all files in req.files array)
    if (req.files && req.files.length > 0) {
      console.log('📤 [Company Update] Processing files from global multer:', req.files.length);
      
      // Separate profile image from gallery images
      const profileImageFile = req.files.find(file => file.fieldname === 'profileImage');
      const galleryImageFiles = req.files.filter(file => file.fieldname === 'galleryImages');
      
      console.log('📤 [Company Update] Profile image found:', !!profileImageFile);
      console.log('📤 [Company Update] Gallery images found:', galleryImageFiles.length);
      
      // Upload profile image if provided
      if (profileImageFile) {
        console.log('📤 [Company Update] Uploading profile image...');
        const profileImageResult = await uploadFile(profileImageFile, 'company-profiles');
        if (profileImageResult.success) {
          finalProfileImageUrl = profileImageResult.key;
          console.log('✅ [Company Update] Profile image uploaded, key stored:', finalProfileImageUrl);
        } else {
          console.error('❌ [Company Update] Profile image upload failed:', profileImageResult.error);
          return res.status(400).json({
            success: false,
            message: 'Failed to upload profile image',
            error: profileImageResult.error
          });
        }
      }
      
      // Upload gallery images if provided
      if (galleryImageFiles.length > 0) {
        console.log('📤 [Company Update] Uploading gallery images...');
        const galleryUploadPromises = galleryImageFiles.map(async (file) => {
          const result = await uploadFile(file, 'company-gallery');
          if (result.success) {
            console.log('✅ [Company Update] Gallery image uploaded:', result.key);
            return result.key;
          } else {
            console.error('❌ [Company Update] Gallery image upload failed:', result.error);
            throw new Error(`Failed to upload gallery image: ${result.error}`);
          }
        });
        
        try {
          const newGalleryKeys = await Promise.all(galleryUploadPromises);
          finalProfileCarouselUrls = [...finalProfileCarouselUrls, ...newGalleryKeys];
          console.log('✅ [Company Update] All gallery images uploaded successfully');
        } catch (galleryError) {
          console.error('❌ [Company Update] Gallery upload error:', galleryError);
          return res.status(400).json({
            success: false,
            message: 'Failed to upload gallery images',
            error: galleryError.message
          });
        }
      }
    }

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
        profileImageUrl: finalProfileImageUrl, // Use processed image URL
        weeklyAverageClients,
        description,
        region,
        comuna,
        benefits,
        existingLocations,
        profileCarouselUrls: finalProfileCarouselUrls, // Use processed gallery URLs
      });
      await createNewLocations(newLocations, restaurantId);
    });

    console.log('✅ [Company Update] Company profile updated successfully');
    res.status(200).json({ 
      success: true,
      message: 'Company profile updated successfully'
    });
  } catch (error) {
    console.error('❌ [Company Update] Error updating company profile:', error.message, error.stack);
    res.status(500).json({ 
      success: false,
      message: 'Internal Server Error' 
    });
  }
});

// DELETE /company/:id - Soft delete restaurant
router.delete('/company/:id', getAuthFromCookie, requirePermission('delete_company'), async (req, res) => {
  try {
    const { id } = req.params;
    const restaurantId = parseInt(id);
    
    console.log('🗑️ [Delete Restaurant API] Soft deleting restaurant:', restaurantId);
    console.log('🗑️ Request user info:', { 
      userId: req.userId, 
      userType: req.userType, 
      role: req.role,
      restaurantId: req.restaurantId 
    });

    if (!restaurantId || isNaN(restaurantId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid restaurant ID'
      });
    }

    // Check if the restaurant exists and belongs to the user
    const restaurant = await prisma.restaurant.findFirst({
      where: {
        id: restaurantId,
        userId: req.userId,
        deletedAt: null // Only find non-deleted restaurants
      }
    });

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        error: 'Restaurant not found or you do not have permission to delete it'
      });
    }

    // Soft delete the restaurant by setting deletedAt
    await prisma.restaurant.update({
      where: { id: restaurantId },
      data: { deletedAt: new Date() }
    });

    console.log('✅ [Delete Restaurant API] Restaurant soft deleted successfully:', restaurantId);

    res.status(200).json({
      success: true,
      message: 'Restaurant deleted successfully'
    });
  } catch (error) {
    console.error('❌ [Delete Restaurant API] Error deleting restaurant:', error);
    res.status(500).json({
      success: false,
      message: 'Internal Server Error'
    });
  }
});

module.exports = router;
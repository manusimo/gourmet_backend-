const express = require('express');
const csrf = require('csurf');
const { prisma } = require('../db.js');

console.log('🔍 Company route - Prisma imported:', typeof prisma, prisma ? 'defined' : 'undefined');
const { checkCompany } = require('../helpers/authenticateToken.js');
const { requireRole, requirePermission, setUserRole } = require('../middleware/auth.js');
const { getUserIdFromCookie, getAuthFromCookie } = require('../helpers/cookies.js');
// const { requirePlan, checkLocationLimit } = require('../middleware/checkPlan.js'); // Temporarily disabled
const { verifyCSRFToken } = require('../helpers/csrf.js');
const { setSecureAuthCookie } = require('../helpers/secureCookie.js');
const { convertImageUrls } = require('../utils/imageUrlUtils.js');
const { uploadFile, uploadMultipleFiles, extractKeyFromUrl } = require('../services/uploadService.js');
const {
  createRestaurantUser,
  updateUserWithRestaurant,
  generateCompanyToken,
  getCompanyByRestaurantId,
  // generatePlanInfo, // Temporarily disabled
  // generateUpdatePlanInfo // Temporarily disabled
} = require('../helpers/companyHelpers.js');
const CompanyService = require('../services/companyService.js');
const {
  sendSuccessResponse,
  handleCompanyError
} = require('../utils/responseHelpers.js');
const { Logger } = require('../middleware/errorTracking.js');
const { getRestaurantUserById } = require('../middleware/company.js');

const csrfProtection = csrf({ cookie: true });
const router = express.Router();


router.get('/companies', async (req, res) => {
  try {
    const {
      q,
      page = 1,
      limit = 10,
      orderBy
    } = req.query;

    const result = await CompanyService.getCompanies({
      q,
      page,
      limit,
      orderBy,
      query: req.query
    });

    sendSuccessResponse(res, 200, null, result);
  } catch (error) {
    handleCompanyError(res, error, {
      context: {
        q: req.query.q,
        page: req.query.page,
        limit: req.query.limit,
        orderBy: req.query.orderBy
      },
      logger: Logger
    });
  }
});

// GET /restaurant/:restaurantUserId - Get restaurant information by restaurantUserId
router.get('/restaurant/:restaurantUserId', getRestaurantUserById, async (req, res) => {
  try {
    const restaurantInfo = await CompanyService.formatRestaurantUserInfo(req.restaurantUser);

    sendSuccessResponse(res, 200, null, restaurantInfo);
  } catch (error) {
    handleCompanyError(res, error, {
      context: {
        restaurantUserId: req.restaurantUserId
      },
      logger: Logger
    });
  }
});

// GET /api/company/restaurantUser/:restaurantUserId - Get restaurant user by restaurantUserId
router.get('/api/company/restaurantUser/:restaurantUserId', getRestaurantUserById, async (req, res) => {
  try {
    sendSuccessResponse(res, 200, null, req.restaurantUser);
  } catch (error) {
    handleCompanyError(res, error, {
      context: {
        restaurantUserId: req.restaurantUserId
      },
      logger: Logger
    });
  }
});

// GET /company/locations - Get company locations
router.get('/company/locations', getAuthFromCookie, async (req, res) => {
  try {
    const { restaurantId: queryRestaurantId } = req.query;
    const { restaurantId: jwtRestaurantId } = req;

    // Use query parameter if provided, otherwise fall back to JWT token
    const restaurantId = queryRestaurantId ? parseInt(queryRestaurantId) : jwtRestaurantId;

    const locations = await CompanyService.getCompanyLocations({ restaurantId });

    sendSuccessResponse(res, 200, null, locations);
  } catch (error) {
    handleCompanyError(res, error, {
      context: {
        restaurantId: req.query.restaurantId || req.restaurantId
      },
      logger: Logger
    });
  }
});

// GET /company/top-rated-companies - Get top rated companies
router.get('/company/top-rated-companies', async (req, res) => {
  try {
    const { page = 1, limit = 4 } = req.query;

    const result = await CompanyService.getTopRatedCompanies({ page, limit });

    sendSuccessResponse(res, 200, null, result);
  } catch (error) {
    handleCompanyError(res, error, {
      context: {
        page: req.query.page,
        limit: req.query.limit
      },
      logger: Logger
    });
  }
});

// GET /company/talents-application - Get talents applications
router.get('/company/talents-application', getAuthFromCookie, async (req, res) => {
  try {
    const { restaurantId: queryRestaurantId } = req.query;

    // Use restaurantId from query parameter if provided, otherwise use from JWT token
    const restaurantId = queryRestaurantId ? parseInt(queryRestaurantId) : req.restaurantId;

    const talents = await CompanyService.getTalentsApplications({ restaurantId });

    sendSuccessResponse(res, 200, 'Some talents want to be part of this company', talents);
  } catch (error) {
    handleCompanyError(res, error, {
      context: {
        restaurantId: req.query.restaurantId || req.restaurantId
      },
      logger: Logger
    });
  }
});

// POST /company - Create company (require admin or manager role)
router.post('/company', (req, res, next) => {
  next();
}, getUserIdFromCookie, setUserRole, requirePermission('create_company'), async (req, res) => {
  try {
    const result = await CompanyService.createCompany({
      body: req.body,
      files: req.files,
      userId: req.userId,
      userType: req.userType,
      role: req.role
    });

    // Set secure authentication cookie
    setSecureAuthCookie(res, result.token);

    sendSuccessResponse(res, 201, 'Company created successfully', result);
  } catch (error) {
    handleCompanyError(res, error, {
      context: {
        userId: req.userId,
        userType: req.userType,
        role: req.role
      },
      logger: Logger
    });
  }
});

// GET /company/:id - Get company by ID
router.get('/company/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const company = await CompanyService.getCompanyById({ companyId: id });

    sendSuccessResponse(res, 200, null, company);
  } catch (error) {
    handleCompanyError(res, error, {
      context: {
        companyId: req.params.id
      },
      logger: Logger
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
     
    const company = await getCompanyByRestaurantId(restaurantId);

    if (company) {
      // Convert image keys to signed URLs
      const companyWithSignedUrls = await convertImageUrls(company, ['profileImageUrl', 'profileCarouselUrls']);
      
      res.status(200).json({
        success: true,
        data: companyWithSignedUrls
      });
    } else {
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
    const { restaurantId: queryRestaurantId } = req.query;
    const { restaurantId: jwtRestaurantId } = req;

    // Use query parameter if provided, otherwise fall back to JWT token
    const restaurantId = queryRestaurantId ? parseInt(queryRestaurantId) : jwtRestaurantId;

    const result = await CompanyService.updateCompany({
      body: req.body,
      files: req.files,
      restaurantId
    });

    sendSuccessResponse(res, 200, result.message);
  } catch (error) {
    handleCompanyError(res, error, {
      context: {
        restaurantId: req.query.restaurantId || req.restaurantId,
        userId: req.userId
      },
      logger: Logger
    });
  }
});

// DELETE /company/:id - Delete restaurant/company
router.delete('/company/:id', getAuthFromCookie, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await CompanyService.deleteCompany({
      restaurantId: id,
      userId: req.userId
    });

    sendSuccessResponse(res, 200, result.message);
  } catch (error) {
    handleCompanyError(res, error, {
      context: {
        restaurantId: req.params.id,
        userId: req.userId
      },
      logger: Logger
    });
  }
});

module.exports = router;

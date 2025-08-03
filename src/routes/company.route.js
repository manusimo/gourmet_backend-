import Router from "express";
import csrf from 'csurf';
import { checkCompany, setUserRole } from '../helpers/authenticateToken.js';
import { getUserIdFromCookie, getRestaurantIdFromCookie } from '../helpers/cookies.js';
import { requirePlan, checkLocationLimit } from '../middleware/checkPlan.js';
import { buildFilters, buildSearchConditions } from "../helpers/filterHelpers.js";
import { deleteLocations, updateCompanyProfile, createNewLocations } from '../helpers/company.js';
import { getOrderByCriteriaCompanies } from '../helpers/orderBy.js';
import { verifyCSRFToken } from "../helpers/csrf.js";
import {
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
} from '../helpers/companyHelpers.js';

const csrfProtection = csrf({ cookie: true });
const router = Router();

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

    const filters = buildFilters(req.query, ['format', 'specialty']);
    const searchConditions = buildSearchConditions(q, 'name');
    console.log('Filters:', filters);
    console.log('Search Conditions:', searchConditions);

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
router.get('/company/locations', getRestaurantIdFromCookie, async (req, res) => {
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
      data: companies.map(company => ({
        ...company,
        jobOffersCount: company._count.jobOffers,
      })),
      totalCompanies,
      currentPage: page,
      totalPages: Math.ceil(totalCompanies / limit),
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: 'Internal Server Error' 
    });
  }
});

// GET /company/talents-application - Get talents applications
router.get('/company/talents-application', getRestaurantIdFromCookie, async (req, res) => {
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

// POST /company - Create company
router.post('/company', checkCompany, getUserIdFromCookie, setUserRole, checkLocationLimit(), async (req, res) => {
  try {
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

    const companyProfile = await createCompanyProfile({
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

    const restaurantUser = await createRestaurantUser(userId, companyProfile.id);
    await updateUserWithRestaurant(userId, companyProfile.id);

    const newToken = generateCompanyToken({
      userId,
      restaurantId: companyProfile.id,
      restaurantUserId: restaurantUser.id,
      role
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

    console.log('this is the restaurant', restaurant.benefits);

    if (restaurant) {
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
router.get('/company', getRestaurantIdFromCookie, async (req, res) => {
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

// PATCH /company - Update company
router.patch('/company', checkCompany, getRestaurantIdFromCookie, checkLocationLimit(), async (req, res) => {
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

export default router;

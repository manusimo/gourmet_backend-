const express = require('express');
const { prisma } = require('../db.js');
const { checkCompany, checkEmployee } = require('../helpers/authenticateToken.js');
const { getUserIdFromCookie, getAuthFromCookie, getEmployeeIdFromCookie, getRestaurantUserIdFromCookie, optionalAuth } = require('../helpers/cookies.js');
const { buildFilters, buildSearchConditions } = require('../helpers/filterHelpers.js');
const { checkJobOfferLimit } = require('../middleware/checkPlan.js');
const { convertJobsImageUrls, convertJobImageUrls, convertApplicationsRestaurantImageUrls } = require('../utils/imageUrlUtils.js');
const {
  fetchTopRatedJobs,
  fetchJobsByNameAndLocation,
  softDeleteJobCascade,
  updateJobOffer,
} = require('../helpers/jobs.js');
const {
  createJobOffer,
  getJobOfferWithLocation,
  generateJobPlanInfo,
  getEmployeeById,
  getEmployeeApplications,
  getJobsWithFilters,
  getTotalJobsCount,
  getRestaurantJobOffers,
  getJobOfferById,
  getRestaurantUserWithDetails,
  getRestaurantWithLocations,
  generateCompletePlanInfo
} = require('../helpers/jobHelpers.js');

const router = express.Router();

// POST /job - Create job offer
router.post('/job', checkCompany, getAuthFromCookie, getRestaurantUserIdFromCookie, checkJobOfferLimit(), async (req, res) => {
  try {
    const {
      position,
      locationId,
      schedule,
      contract,
      vacancies,
      yearsOfExperience,
      description,
      questions,
      requirements,
      salary,
      propina,
      functions,
      restaurantId: requestRestaurantId,
    } = req.body;

    // Use restaurantId from request body if provided (for holding companies), otherwise use from middleware
    const restaurantId = requestRestaurantId || req.restaurantId;
    const restaurantUserId = req.restaurantUserId;

    console.log('this is the locationId', locationId);
    console.log('this is the restaurantId', restaurantId);

    if (!locationId) {
      return res.status(400).json({
        success: false,
        message: 'locationId is required',
      });
    }

    // For now, allow all users to have access to all restaurants
    // TODO: Implement proper restaurant access control later
    if (requestRestaurantId) {
      console.log(`✅ Allowing access to restaurant ${requestRestaurantId} for user ${req.userId}`);
    }

    const jobOffer = await createJobOffer({
      position,
      locationId,
      schedule,
      contract,
      vacancies,
      yearsOfExperience,
      description,
      questions,
      requirements,
      salary,
      propina,
      functions,
      restaurantId,
      restaurantUserId
    });

    const jobOfferCheck = await getJobOfferWithLocation(jobOffer.id);

    console.log('this is the job offer', jobOfferCheck);

    res.status(201).json({
      success: true,
      message: 'Job offer created successfully',
      data: jobOffer
    });
  } catch (error) {
    console.error('Error creating job offer:', error);
    res.status(500).json({ 
      success: false,
      message: 'Internal Server Error' 
    });
  }
});

// GET /jobs/recommended-jobs - Get recommended jobs
router.get('/jobs/recommended-jobs', optionalAuth, async (req, res) => {
  try {
    const { jobName, location, limit = 4 } = req.query;
    const userId = req.userId;
    const userType = req.userType;
    const finishedDateParsed = new Date(new Date().setDate(new Date().getDate() - 30));

    let formattedJobs;

    formattedJobs = await fetchJobsByNameAndLocation(jobName, location, null, finishedDateParsed);

    res.json({
      success: true,
      data: formattedJobs, // Use consistent 'data' property
    });
  } catch (error) {
    console.error('Error fetching recommended jobs:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal Server Error' 
    });
  }
});

// GET /jobs/top-rated-jobs-carousel - Get top rated jobs
router.get('/jobs/top-rated-jobs-carousel', optionalAuth, async (req, res) => {
  try {
    const { limit = 4 } = req.query; // Default limit of 4 jobs
    const userId = req.userId;
    const userType = req.userType;
    const finishedDateParsed = new Date(new Date().setDate(new Date().getDate() - 60)); // Extended to 60 days

    console.log('🔍 /jobs/top-rated-jobs-carousel called with:', { limit, userId, userType, finishedDateParsed });

    let formattedJobs;

    formattedJobs = await fetchTopRatedJobs(limit, finishedDateParsed);
    
    console.log('🔍 Returning formatted jobs:', formattedJobs.length);

    res.json({
      success: true,
      data: formattedJobs, // Use consistent 'data' property
    });
  } catch (error) {
    console.error('Error fetching top-rated jobs:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal Server Error' 
    });
  }
});

// PATCH /job/:id - Update job offer
router.patch('/job/:id', checkCompany, getAuthFromCookie, async (req, res) => {
  try {
    const jobId = parseInt(req.params.id, 10);
    const updated = await updateJobOffer(jobId, req.restaurantId, req.body);
    res.status(200).json({
      success: true,
      message: 'Job offer updated successfully',
      data: updated,
    });
  } catch (error) {
    console.error('[PATCH /job/:id]', error);
    res.status(400).json({ 
      success: false,
      message: error.message 
    });
  }
});

// GET /jobs/applied - Get applied jobs for employee
router.get('/jobs/applied', checkEmployee, getEmployeeIdFromCookie, async (req, res) => {
  try {
    const employeeId = req.employeeId;

    const employeeExists = await getEmployeeById(employeeId);
    console.log('herok');
    
    if (!employeeExists) {
      return res.status(404).json({ 
        success: false,
        message: 'Employee not found' 
      });
    }

    const applications = await getEmployeeApplications(employeeId);

    // Convert restaurant image keys to signed URL endpoints via helper
    const applicationsWithSignedUrls = convertApplicationsRestaurantImageUrls(applications);

    res.json({
      success: true,
      data: applicationsWithSignedUrls
    });
  } catch (error) {
    console.error('Error fetching applications:', error);
    res.status(500).json({ 
      success: false,
      message: 'Internal Server Error' 
    });
  }
});

// GET /jobs - Get jobs with filters and pagination
router.get('/jobs', async (req, res) => {
  try {
    const {
      locationId,
      schedule,
      period,
      format,
      contract,
      region,
      comuna,
      q,
      page,
      limit = 10,
      orderBy,
      finishedDate,
    } = req.query;

    const finishedDateParsed = finishedDate
      ? new Date(finishedDate)
      : new Date(new Date().setDate(new Date().getDate() - 30));

    const pageNumber = Math.max(parseInt(page, 10), 1);
    const limitNumber = Math.max(parseInt(limit, 10), 1);
    const skip = (pageNumber - 1) * limitNumber;

    const restaurantFilterFields = [
      'specialty',
      'format',
      'benefits',
      'region',
      'comuna',
    ];
    const restaurantFilter = buildFilters(req.query, restaurantFilterFields);
    const searchConditions = buildSearchConditions(q, 'position');

    let orderByCriteria = { createdAt: 'desc' };

    if (orderBy === 'applications') {
      orderByCriteria = {
        applications: {
          _count: 'desc',
        },
      };
    }

    if (orderBy === 'date') {
      orderByCriteria = {
        createdAt: 'desc',
      };
    }

    const [jobs, totalJobs] = await Promise.all([
      getJobsWithFilters(restaurantFilter, searchConditions, orderByCriteria, limitNumber, skip),
      getTotalJobsCount(restaurantFilter, searchConditions),
    ]);

    // Convert image keys to signed URL endpoints for each job
    const jobsWithSignedUrls = convertJobsImageUrls(jobs);

    const totalPages = Math.ceil(totalJobs / limitNumber);

    res.status(200).json({
      success: true,
      data: jobsWithSignedUrls,
      totalPages,
      totalJobs,
      currentPage: pageNumber,
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: error.message || 'Internal Server Error' 
    });
  }
});

// GET /jobs/restaurant - Get restaurant job offers
router.get('/jobs/restaurant', checkCompany, getAuthFromCookie, async (req, res) => {
  try {
    const userId = req.userId;
    const { restaurantId } = req.query; // Get restaurant ID from query parameter
    
    // Get all restaurants the user has access to
    const userRestaurants = await prisma.restaurantUser.findMany({
      where: { userId: userId },
      select: { restaurantId: true }
    });
    
    // Also check if user owns restaurants directly
    const ownedRestaurants = await prisma.restaurant.findMany({
      where: { userId: userId },
      select: { id: true }
    });
    
    // Combine all restaurant IDs the user has access to
    const allRestaurantIds = [
      ...userRestaurants.map(ur => ur.restaurantId),
      ...ownedRestaurants.map(or => or.id)
    ];
    
    // If a specific restaurant ID is provided, filter to that restaurant
    let targetRestaurantIds = allRestaurantIds;
    if (restaurantId) {
      const requestedRestaurantId = parseInt(restaurantId);
      
      // Verify the user has access to the requested restaurant
      if (!allRestaurantIds.includes(requestedRestaurantId)) {
        return res.status(403).json({
          success: false,
          error: 'You do not have access to this restaurant'
        });
      }
      
      targetRestaurantIds = [requestedRestaurantId];
    }
    
    // Get jobs for the target restaurants
    const jobOffers = await prisma.jobOffer.findMany({
      where: {
        restaurantId: { in: targetRestaurantIds },
        deletedAt: null,
      },
      include: {
        restaurant: true,
        questions: true,
        location: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    
    // Convert image keys to signed URL endpoints for each job
    const jobOffersWithSignedUrls = convertJobsImageUrls(jobOffers);
    
    res.status(200).json({
      success: true,
      data: jobOffersWithSignedUrls
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ 
      success: false,
      error: 'Internal Server Error' 
    });
  }
});

// GET /jobs/:jobId - Get job offer by ID
router.get('/jobs/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;

    const jobOffer = await getJobOfferById(jobId);

    console.log('this is the job offer', jobOffer);

    if (jobOffer) {
      // Convert image keys to signed URL endpoints
      convertJobImageUrls(jobOffer);
      
      res.json({
        success: true,
        data: {
          ...jobOffer,
          applicationsCount: jobOffer.applications.length,
          createdAt: jobOffer.createdAt.toISOString().slice(0, 10),
        }
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Job offer not found'
      });
    }
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// DELETE /job/:id - Delete job offer
router.delete('/job/:id', checkCompany, getAuthFromCookie, async (req, res) => {
  try {
    const jobId = parseInt(req.params.id, 10);
    const restaurantId = req.restaurantId;

    const deletedJob = await softDeleteJobCascade(jobId, restaurantId);

    res.status(200).json({
      success: true,
      message: 'Job offer soft deleted successfully',
      data: deletedJob,
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: error.message || 'Internal Server Error' 
    });
  }
});

// GET /my-plan-info - Get plan info and job offers
router.get('/my-plan-info', checkCompany, getRestaurantUserIdFromCookie, async (req, res) => {
  try {
    const restaurantUserId = req.restaurantUserId;

    if (!restaurantUserId) {
      return res.status(401).json({ 
        success: false,
        message: 'No autenticado como usuario de restaurante' 
      });
    }

    // Buscar el usuario de restaurante y su usuario asociado
    const restaurantUser = await getRestaurantUserWithDetails(restaurantUserId);

    if (!restaurantUser || !restaurantUser.user) {
      return res.status(401).json({ 
        success: false,
        message: 'Usuario de restaurante no encontrado' 
      });
    }

    const user = restaurantUser.user;
    const currentJobOffers = restaurantUser.jobOffers.length;

    // Obtener información de ubicaciones
    const restaurant = await getRestaurantWithLocations(restaurantUser.restaurantId);
    const currentLocations = restaurant ? restaurant.locations.length : 0;

    const planInfo = generateCompletePlanInfo({
      user,
      restaurantUser,
      restaurant,
      currentJobOffers,
      currentLocations
    });

    res.status(200).json(planInfo);
  } catch (error) {
    console.error('Error getting plan info:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error interno del servidor' 
    });
  }
});

module.exports = router;
import Router from "express";
import { checkCompany, checkEmployee } from '../helpers/authenticateToken.js';
import { getUserIdFromCookie, getRestaurantIdFromCookie, getEmployeeIdFromCookie, getRestaurantUserIdFromCookie, optionalAuth } from '../helpers/cookies.js';
import { buildFilters, buildSearchConditions } from '../helpers/filterHelpers.js';
import { checkJobOfferLimit } from '../middleware/checkPlan.js';
import {
  fetchTopRatedJobs,
  fetchJobsByNameAndLocation,
  softDeleteJobCascade,
  updateJobOffer,
} from '../helpers/jobs.js';
import {
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
} from '../helpers/jobHelpers.js';

const router = Router();

// POST /job - Create job offer
router.post('/job', checkCompany, getRestaurantIdFromCookie, getRestaurantUserIdFromCookie, checkJobOfferLimit(), async (req, res) => {
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
    } = req.body;

    const restaurantId = req.restaurantId;
    const restaurantUserId = req.restaurantUserId;

    console.log('this is the locationId', locationId);

    if (!locationId) {
      return res.status(400).json({
        success: false,
        message: 'locationId is required',
      });
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

    // Calcular ofertas restantes
    const remainingJobOffers = req.remainingJobOffers - 1;

    const planInfo = generateJobPlanInfo({
      paymentStatus: req.user.payment_status,
      remainingJobOffers,
      jobOfferLimit: req.jobOfferLimit
    });

    res.status(201).json({
      success: true,
      message: 'Job offer created successfully',
      data: jobOffer,
      planInfo
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

    res.status(200).json({
      success: true,
      data: formattedJobs,
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
    const { limit = 4 } = req.query;
    const userId = req.userId;
    const userType = req.userType;
    const finishedDateParsed = new Date(new Date().setDate(new Date().getDate() - 30));

    let formattedJobs;

    formattedJobs = await fetchTopRatedJobs(limit, finishedDateParsed);

    res.json({
      success: true,
      data: formattedJobs,
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
router.patch('/job/:id', checkCompany, getRestaurantIdFromCookie, async (req, res) => {
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

    res.json({
      success: true,
      data: applications
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

    const totalPages = Math.ceil(totalJobs / limitNumber);

    res.status(200).json({
      success: true,
      data: jobs,
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
router.get('/jobs/restaurant', checkCompany, getRestaurantIdFromCookie, async (req, res) => {
  try {
    const restaurantId = req.restaurantId;
    const jobOffers = await getRestaurantJobOffers(restaurantId);
    
    res.status(200).json({
      success: true,
      data: jobOffers
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
router.delete('/job/:id', checkCompany, getRestaurantIdFromCookie, async (req, res) => {
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

export default router;

const express = require('express');
const { checkCompany, checkEmployee } = require('../helpers/authenticateToken.js');
const { getUserIdFromCookie, getAuthFromCookie, getEmployeeIdFromCookie, getRestaurantUserIdFromCookie, optionalAuth } = require('../helpers/cookies.js');
const { checkJobOfferLimit } = require('../middleware/checkPlan.js');
const {
  fetchJobsByNameAndLocation,
} = require('../helpers/jobs.js');
const {
  generateJobPlanInfo,
  getRestaurantUserWithDetails,
  getRestaurantWithLocations,
  generateCompletePlanInfo
} = require('../helpers/jobHelpers.js');

const router = express.Router();

const JobService = require('../services/jobService.js');
const EmployeeService = require('../services/employeeService.js');
const {
  sendSuccessResponse,
  handleCompanyError,
  handleEmployeeError
} = require('../utils/responseHelpers.js');
const { Logger } = require('../middleware/errorTracking.js');

// POST /job - Create job offer
router.post('/job', checkCompany, getAuthFromCookie, getRestaurantUserIdFromCookie, checkJobOfferLimit(), async (req, res) => {
  try {
    const jobOffer = await JobService.createJob({
      body: req.body,
      restaurantId: req.restaurantId,
      restaurantUserId: req.restaurantUserId
    });

    sendSuccessResponse(res, 201, 'Job offer created successfully', jobOffer);
  } catch (error) {
    handleCompanyError(res, error, {
      context: {
        restaurantId: req.restaurantId,
        restaurantUserId: req.restaurantUserId
      },
      logger: Logger
    });
  }
});

// GET /jobs/recommended-jobs - Get recommended jobs
router.get('/jobs/recommended-jobs', optionalAuth, async (req, res) => {
  try {
    const jobs = await JobService.getRecommendedJobs({
      jobName: req.query.jobName,
      location: req.query.location,
      limit: req.query.limit ? parseInt(req.query.limit, 10) : 4
    });

    sendSuccessResponse(res, 200, null, jobs);
  } catch (error) {
    handleCompanyError(res, error, {
      context: {
        userId: req.userId,
        userType: req.userType,
        query: req.query
      },
      logger: Logger
    });
  }
});

// GET /jobs/top-rated-jobs-carousel - Get top rated jobs
router.get('/jobs/top-rated-jobs-carousel', optionalAuth, async (req, res) => {
  try {
    const jobs = await JobService.getTopRatedJobs({
      limit: req.query.limit ? parseInt(req.query.limit, 10) : 4
    });

    sendSuccessResponse(res, 200, null, jobs);
  } catch (error) {
    handleCompanyError(res, error, {
      context: {
        userId: req.userId,
        userType: req.userType,
        limit: req.query.limit
      },
      logger: Logger
    });
  }
});

// PATCH /job/:id - Update job offer
router.patch('/job/:id', checkCompany, getAuthFromCookie, async (req, res) => {
  try {
    const updated = await JobService.updateJob({
      jobId: req.params.id,
      restaurantId: req.restaurantId,
      body: req.body
    });

    sendSuccessResponse(res, 200, 'Job offer updated successfully', updated);
  } catch (error) {
    handleCompanyError(res, error, {
      context: {
        jobId: req.params.id,
        restaurantId: req.restaurantId
      },
      logger: Logger
    });
  }
});

// GET /jobs/applied - Get applied jobs for employee
router.get('/jobs/applied', checkEmployee, getEmployeeIdFromCookie, async (req, res) => {
  try {
    const applications = await EmployeeService.getEmployeeApplications({
      employeeId: req.employeeId
    });

    sendSuccessResponse(res, 200, null, applications);
  } catch (error) {
    handleEmployeeError(res, error, {
      context: {
        employeeId: req.employeeId
      },
      logger: Logger
    });
  }
});

// GET /jobs - Get jobs with filters and pagination
router.get('/jobs', async (req, res) => {
  try {
    const result = await JobService.getJobs({ query: req.query });

    sendSuccessResponse(res, 200, null, result);
  } catch (error) {
    handleCompanyError(res, error, {
      context: {
        query: req.query
      },
      logger: Logger
    });
  }
});

// GET /jobs/restaurant - Get restaurant job offers
router.get('/jobs/restaurant', checkCompany, getAuthFromCookie, async (req, res) => {
  try {
    const jobOffers = await JobService.getRestaurantJobOffers({
      userId: req.userId,
      restaurantId: req.query.restaurantId
    });

    sendSuccessResponse(res, 200, null, jobOffers);
  } catch (error) {
    handleCompanyError(res, error, {
      context: {
        userId: req.userId,
        restaurantId: req.query.restaurantId
      },
      logger: Logger
    });
  }
});

// GET /jobs/:jobId - Get job offer by ID
router.get('/jobs/:jobId', async (req, res) => {
  try {
    const jobOffer = await JobService.getJobById({
      jobId: req.params.jobId
    });

    sendSuccessResponse(res, 200, null, jobOffer);
  } catch (error) {
    handleCompanyError(res, error, {
      context: {
        jobId: req.params.jobId
      },
      logger: Logger
    });
  }
});

// DELETE /job/:id - Delete job offer
router.delete('/job/:id', checkCompany, getAuthFromCookie, async (req, res) => {
  try {
    const deletedJob = await JobService.deleteJob({
      jobId: req.params.id,
      restaurantId: req.restaurantId
    });

    sendSuccessResponse(res, 200, 'Job offer soft deleted successfully', deletedJob);
  } catch (error) {
    handleCompanyError(res, error, {
      context: {
        jobId: req.params.id,
        restaurantId: req.restaurantId
      },
      logger: Logger
    });
  }
});

module.exports = router;
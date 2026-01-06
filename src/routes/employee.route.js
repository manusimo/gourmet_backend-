const express = require('express');
const multer = require('multer');
const { checkEmployee, checkCompany, setUserRole } = require('../helpers/authenticateToken.js');
const { getEmployeeIdFromCookie, getRestaurantIdFromCookie, getRestaurantUserIdFromCookie, getUserIdFromCookie } = require('../helpers/cookies.js');
const { requirePlan } = require('../middleware/checkPlan.js');
const { setSecureAuthCookie } = require('../helpers/secureCookie.js');
const {
  createExperience,
  createEducation
} = require('../helpers/employeeHelpers.js');

const router = express.Router();

const EmployeeService = require('../services/employeeService.js');
const {
  sendSuccessResponse,
  handleEmployeeError
} = require('../utils/responseHelpers.js');
const { Logger } = require('../middleware/errorTracking.js');
const { getEmployeeById } = require('../middleware/employee.js');

// Use shared normalization helper from uploadService

// Multer is configured globally in index.js

// GET /employee/:id - Get employee by ID
router.get('/employee/:id', getEmployeeById, async (req, res) => {
  try {
    const employee = await EmployeeService.formatEmployeeInfo(req.employee);

    sendSuccessResponse(res, 200, null, employee);
  } catch (error) {
    handleEmployeeError(res, error, {
      context: {
        employeeId: req.employeeId
      },
      logger: Logger
    });
  }
});

// Middleware for employee creation (multer is handled globally)
const createEmployeeMiddleware = [
  checkEmployee,
  getUserIdFromCookie
];

// POST /employee - Create employee profile
router.post('/employee', ...createEmployeeMiddleware, async (req, res) => {
  try {
    const employee = await EmployeeService.createEmployee({
      body: req.body,
      files: req.files,
      userId: req.userId
    });

    // Set secure authentication cookie (subdomain support)
    setSecureAuthCookie(res, employee.token);

    sendSuccessResponse(res, 201, 'Employee created successfully', employee);
  } catch (error) {
    handleEmployeeError(res, error, {
      context: {
        userId: req.userId
      },
      logger: Logger
    });
  }
});

// GET /employee - Get current employee profile
router.get('/employee', getEmployeeIdFromCookie, async (req, res) => {
  try {
    const employee = await EmployeeService.getCurrentEmployeeProfile({
      employeeId: req.employeeId
    });

    sendSuccessResponse(res, 200, null, employee);
  } catch (error) {
    handleEmployeeError(res, error, {
      context: {
        employeeId: req.employeeId
      },
      logger: Logger
    });
  }
});

// Middleware for employee update with file uploads
const updateEmployeeMiddleware = [
  checkEmployee,
  getEmployeeIdFromCookie
];

// PATCH /employee - Update employee profile
router.patch('/employee', ...updateEmployeeMiddleware, async (req, res) => {
  try {
    const employee = await EmployeeService.updateEmployee({
      body: req.body,
      files: req.files,
      employeeId: req.employeeId
    });

    sendSuccessResponse(res, 200, 'Employee profile updated successfully.', employee);
  } catch (error) {
    handleEmployeeError(res, error, {
      context: {
        employeeId: req.employeeId
      },
      logger: Logger
    });
  }
});

// GET /employees/:employeeId/applications - Get employee applications
router.get('/employees/:employeeId/applications', async (req, res) => {
  try {
    const applications = await EmployeeService.getEmployeeApplications({
      employeeId: req.params.employeeId
    });

    sendSuccessResponse(res, 200, null, applications);
  } catch (error) {
    handleEmployeeError(res, error, {
      context: {
        employeeId: req.params.employeeId
      },
      logger: Logger
    });
  }
});

// GET /employees/:employeeId/job-posts/:jobPostId/application - Get specific application
router.get('/employees/:employeeId/job-posts/:jobPostId/application', async (req, res) => {
  try {
    const application = await EmployeeService.getApplicationByEmployeeAndJobPost({
      employeeId: req.params.employeeId,
      jobPostId: req.params.jobPostId
    });

    sendSuccessResponse(res, 200, null, application);
  } catch (error) {
    handleEmployeeError(res, error, {
      context: {
        employeeId: req.params.employeeId,
        jobPostId: req.params.jobPostId
      },
      logger: Logger
    });
  }
});

// GET /employees/search - Search employees
router.get('/employees/search', checkCompany, getUserIdFromCookie, getRestaurantUserIdFromCookie, setUserRole, async (req, res) => {
  try {
    const employees = await EmployeeService.searchEmployees({
      position: req.query.position,
      experience: req.query.experience,
      region: req.query.region,
      comuna: req.query.comuna,
      available: req.query.available,
      schedule: req.query.schedule
    });

    sendSuccessResponse(res, 200, null, employees);
  } catch (error) {
    handleEmployeeError(res, error, {
      context: {
        userId: req.userId,
        restaurantUserId: req.restaurantUserId,
        query: req.query
      },
      logger: Logger
    });
  }
});

// POST /employees/favorite-jobs/:jobPostId - Add favorite job
router.post('/employees/favorite-jobs/:jobPostId', checkEmployee, getEmployeeIdFromCookie, async (req, res) => {
  try {
    const favoriteJob = await EmployeeService.addFavoriteJob({
      employeeId: req.employeeId,
      jobPostId: req.params.jobPostId
    });

    sendSuccessResponse(res, 201, 'Job post added to favorites', favoriteJob);
  } catch (error) {
    handleEmployeeError(res, error, {
      context: {
        employeeId: req.employeeId,
        jobPostId: req.params.jobPostId
      },
      logger: Logger
    });
  }
});

// DELETE /employees/favorite-jobs/:jobPostId - Remove favorite job
router.delete('/employees/favorite-jobs/:jobPostId', checkEmployee, getEmployeeIdFromCookie, async (req, res) => {
  try {
    await EmployeeService.deleteFavoriteJob({
      employeeId: req.employeeId,
      jobPostId: req.params.jobPostId
    });

    sendSuccessResponse(res, 200, 'Favourite Job deleted successfully', null);
  } catch (error) {
    handleEmployeeError(res, error, {
      context: {
        employeeId: req.employeeId,
        jobPostId: req.params.jobPostId
      },
      logger: Logger
    });
  }
});

// GET /employees/favorite-jobs - Get all favorite jobs
router.get('/employees/favorite-jobs', checkEmployee, getEmployeeIdFromCookie, async (req, res) => {
  try {
    const favoriteJobs = await EmployeeService.getFavoriteJobs({
      employeeId: req.employeeId
    });

    sendSuccessResponse(res, 200, null, favoriteJobs);
  } catch (error) {
    handleEmployeeError(res, error, {
      context: {
        employeeId: req.employeeId
      },
      logger: Logger
    });
  }
});

// GET /employees/favorite-jobs/:jobPostId - Check if job is favorite
router.get('/employees/favorite-jobs/:jobPostId', checkEmployee, getEmployeeIdFromCookie, async (req, res) => {
  try {
    const result = await EmployeeService.checkFavoriteJob({
      employeeId: req.employeeId,
      jobPostId: req.params.jobPostId
    });

    // Return 200 with isSaved status (not 404 when not found, as it's a check operation)
    sendSuccessResponse(res, 200, result.message, result);
  } catch (error) {
    handleEmployeeError(res, error, {
      context: {
        employeeId: req.employeeId,
        jobPostId: req.params.jobPostId
      },
      logger: Logger
    });
  }
});

// POST /employee/talent-pool - Add to talent pool
router.post('/employee/talent-pool', getEmployeeIdFromCookie, async (req, res) => {
  try {
    const talentPoolRecord = await EmployeeService.addToTalentPool({
      employeeId: req.employeeId,
      restaurantId: req.body.restaurantId
    });

    sendSuccessResponse(res, 201, 'Talent pool record created successfully', talentPoolRecord);
  } catch (error) {
    handleEmployeeError(res, error, {
      context: {
        employeeId: req.employeeId,
        restaurantId: req.body.restaurantId
      },
      logger: Logger
    });
  }
});

// GET /employee/talent-pool/check - Check talent pool status
router.get('/employee/talent-pool/check', getEmployeeIdFromCookie, async (req, res) => {
  try {
    const result = await EmployeeService.checkTalentPoolStatus({
      employeeId: req.employeeId,
      restaurantId: req.query.restaurantId
    });

    sendSuccessResponse(res, 200, result.message, result);
  } catch (error) {
    handleEmployeeError(res, error, {
      context: {
        employeeId: req.employeeId,
        restaurantId: req.query.restaurantId
      },
      logger: Logger
    });
  }
});

module.exports = router;
const express = require('express');
const { getRestaurantIdFromCookie, getAuthFromCookie } = require('../helpers/cookies.js');
const { checkCompany } = require('../helpers/authenticateToken.js');
const ApplicationService = require('../services/applicationService.js');
const { authenticateAndValidateApplication } = require('../middleware/application.js');
const {
  requireValidId,
  sendSuccessResponse,
  handleApplicationError
} = require('../utils/responseHelpers.js');
const { Logger } = require('../middleware/errorTracking.js');

const router = express.Router();

// POST /application - Create a new application
router.post('/application', authenticateAndValidateApplication, async (req, res) => {
  const { jobPostId, answers } = req.body;
  const employeeId = req.employeeId;

  try {
    const application = await ApplicationService.createApplication({
      jobPostId,
      employeeId,
      answers
    });

    sendSuccessResponse(res, 201, 'Postulaste exitosamente.', application);
  } catch (error) {
    handleApplicationError(res, error, {
      context: { jobPostId, employeeId },
      customMessages: {
        'P2025': 'Este trabajo ya no está disponible.',
        'P2003': 'Referencia inválida al trabajo o empleado.'
      },
      logger: Logger
    });
  }
});

// GET /applications/:applicationId - Get application by ID
router.get('/applications/:applicationId', getAuthFromCookie, async (req, res) => {
  try {
    const { applicationId } = req.params;

    // Validate application ID
    const parsedId = requireValidId(res, applicationId, 'ID de postulación');
    if (!parsedId) return;

    // Get application with authorization check and image URL conversion
    const application = await ApplicationService.getApplication({
      applicationId: parsedId,
      employeeId: req.employeeId,
      restaurantId: req.restaurantId,
      userType: req.userType
    });

    sendSuccessResponse(res, 200, null, application);
  } catch (error) {
    handleApplicationError(res, error, {
      context: { applicationId: req.params.applicationId, userId: req.userId },
      logger: Logger
    });
  }
});

// GET /job-offers/:jobOfferId/applicants - Get applicants for a job offer
router.get('/job-offers/:jobOfferId/applicants', checkCompany, getRestaurantIdFromCookie, async (req, res) => {
  try {
    const { jobOfferId } = req.params;
    const { restaurantId: queryRestaurantId } = req.query;
    const { restaurantId: jwtRestaurantId } = req;

    // Validate job offer ID
    const parsedJobOfferId = requireValidId(res, jobOfferId, 'ID de oferta de trabajo');
    if (!parsedJobOfferId) return;

    // Use restaurantId from query parameter if provided, otherwise use from JWT token
    const restaurantId = queryRestaurantId ? parseInt(queryRestaurantId) : jwtRestaurantId;

    // Get applicants with authorization check
    const applications = await ApplicationService.getApplicantsForJobOffer({
      jobOfferId: parsedJobOfferId,
      restaurantId
    });

    sendSuccessResponse(res, 200, null, {
      data: applications,
      count: applications.length
    });
  } catch (error) {
    handleApplicationError(res, error, {
      context: { 
        jobOfferId: req.params.jobOfferId, 
        restaurantId: req.restaurantId,
        userId: req.userId 
      },
      logger: Logger
    });
  }
});

module.exports = router;

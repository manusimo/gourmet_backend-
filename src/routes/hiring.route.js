const express = require('express');
const { checkCompany, checkEmployee } = require('../helpers/authenticateToken.js');
const { getAuthFromCookie, getEmployeeIdFromCookie, getRestaurantUserIdFromCookie } = require('../helpers/cookies.js');
const { sendSuccessResponse, handleCompanyError, handleEmployeeError } = require('../utils/responseHelpers.js');
const Logger = require('../utils/logger.js');
const HiringService = require('../services/hiringService.js');
const {
  getHiringById,
  getEffectiveHiringValues
} = require('../helpers/hiringHelpers.js');

const router = express.Router();

// POST /hirings - Create hiring offer
router.post('/hirings', checkCompany, getAuthFromCookie, getRestaurantUserIdFromCookie, async (req, res) => {
  try {
    const hiring = await HiringService.createHiringOffer({
      employeeId: req.body.employeeId,
      conversationId: req.body.conversationId,
      jobOfferId: req.body.jobOfferId,
      startDate: req.body.startDate,
      endDate: req.body.endDate,
      restaurantUserId: req.restaurantUserId,
      restaurantId: req.restaurantId
    });

    sendSuccessResponse(res, 201, 'Hiring offer created and message sent successfully', hiring);
  } catch (error) {
    handleCompanyError(res, error, {
      context: {
        employeeId: req.body.employeeId,
        conversationId: req.body.conversationId,
        restaurantUserId: req.restaurantUserId,
        restaurantId: req.restaurantId
      },
      logger: Logger
    });
  }
});

// POST /hirings/:hiringId/accept - Accept hiring offer
router.post('/hirings/:hiringId/accept', checkEmployee, getEmployeeIdFromCookie, async (req, res) => {
  try {
    const updatedHiring = await HiringService.acceptHiringOffer({
      hiringId: req.params.hiringId,
      employeeId: req.employeeId,
      startDate: req.body.startDate,
      endDate: req.body.endDate
    });

    sendSuccessResponse(res, 200, 'Hiring offer accepted successfully', updatedHiring);
  } catch (error) {
    handleEmployeeError(res, error, {
      context: {
        hiringId: req.params.hiringId,
        employeeId: req.employeeId
      },
      logger: Logger
    });
  }
});

// POST /hirings/:hiringId/reject - Reject hiring offer
router.post('/hirings/:hiringId/reject', checkEmployee, getEmployeeIdFromCookie, async (req, res) => {
  try {
    const updatedHiring = await HiringService.rejectHiringOffer({
      hiringId: req.params.hiringId,
      employeeId: req.employeeId
    });

    sendSuccessResponse(res, 200, 'Hiring offer rejected successfully', updatedHiring);
  } catch (error) {
    handleEmployeeError(res, error, {
      context: {
        hiringId: req.params.hiringId,
        employeeId: req.employeeId
      },
      logger: Logger
    });
  }
});

// GET /hirings/active - Get active hirings
router.get('/hirings/active', async (req, res) => {
  try {
    const hirings = await HiringService.getActiveHirings({
      userType: req.query.userType,
      userId: req.query.userId
    });

    sendSuccessResponse(res, 200, null, hirings);
  } catch (error) {
    // Use appropriate error handler based on user type
    const errorHandler = req.query.userType === 'profesionales' 
      ? handleEmployeeError 
      : handleCompanyError;

    errorHandler(res, error, {
      context: {
        userType: req.query.userType,
        userId: req.query.userId
      },
      logger: Logger
    });
  }
});

// GET /hirings/conversation/:conversationId - Get hiring by conversation ID
router.get('/hirings/conversation/:conversationId', async (req, res) => {
  try {
    const hiring = await HiringService.getHiringByConversationId({
      conversationId: req.params.conversationId
    });

    sendSuccessResponse(res, 200, null, hiring);
  } catch (error) {
    handleCompanyError(res, error, {
      context: {
        conversationId: req.params.conversationId
      },
      logger: Logger
    });
  }
});

// GET /hirings/job/:jobOfferId - Get all hirings for a job offer
router.get('/hirings/job/:jobOfferId', checkCompany, getAuthFromCookie, async (req, res) => {
  try {
    const hirings = await HiringService.getHiringsByJobOfferId({
      jobOfferId: req.params.jobOfferId
    });

    sendSuccessResponse(res, 200, null, hirings);
  } catch (error) {
    handleCompanyError(res, error, {
      context: {
        jobOfferId: req.params.jobOfferId
      },
      logger: Logger
    });
  }
});

// PATCH /hirings/:hiringId - Update hiring offer (only startDate and endDate)
router.patch('/hirings/:hiringId', checkCompany, getAuthFromCookie, getRestaurantUserIdFromCookie, async (req, res) => {
  try {
    const updatedHiring = await HiringService.updateHiringOffer({
      hiringId: req.params.hiringId,
      startDate: req.body.startDate,
      endDate: req.body.endDate,
      restaurantId: req.restaurantId,
      restaurantUserId: req.restaurantUserId
    });

    sendSuccessResponse(res, 200, 'Hiring offer updated successfully', updatedHiring);
  } catch (error) {
    handleCompanyError(res, error, {
      context: {
        hiringId: req.params.hiringId,
        restaurantId: req.restaurantId,
        restaurantUserId: req.restaurantUserId
      },
      logger: Logger
    });
  }
});

module.exports = router;


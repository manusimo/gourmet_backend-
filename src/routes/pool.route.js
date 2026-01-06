const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { checkCompany, setUserRole } = require('../helpers/authenticateToken.js');
const { getUserIdFromCookie, getRestaurantIdFromCookie, getRestaurantUserIdFromCookie } = require('../helpers/cookies.js');
const { sendSuccessResponse, handleCompanyError } = require('../utils/responseHelpers.js');
const Logger = require('../utils/logger.js');
const PoolService = require('../services/poolService.js');

const prisma = new PrismaClient();
const {
  getTalentPoolEntryWithConversations
} = require('../helpers/poolHelpers.js');

const router = express.Router();

// GET /talent-pool/check - Check if talent pool entry exists
router.get('/talent-pool/check', checkCompany, getRestaurantIdFromCookie, async (req, res) => {
  try {
    const result = await PoolService.checkTalentPoolEntry({
      employeeId: req.query.employeeId,
      restaurantId: req.restaurantId
    });

    sendSuccessResponse(res, 200, null, result);
  } catch (error) {
    handleCompanyError(res, error, {
      context: {
        employeeId: req.query.employeeId,
        restaurantId: req.restaurantId
      },
      logger: Logger
    });
  }
});

// POST /talent-pool - Add employee to talent pool
router.post('/talent-pool', checkCompany, getUserIdFromCookie, async (req, res) => {
  try {
    const talentEntry = await PoolService.addToTalentPool({
      employeeId: req.body.employeeId,
      bodyRestaurantId: req.body.restaurantId,
      userId: req.userId
    });

    sendSuccessResponse(res, 201, 'Employee added to talent pool successfully', talentEntry);
  } catch (error) {
    handleCompanyError(res, error, {
      context: {
        employeeId: req.body.employeeId,
        bodyRestaurantId: req.body.restaurantId,
        userId: req.userId
      },
      logger: Logger
    });
  }
});

// GET /talent-pool - Get talent pool with filters
router.get('/talent-pool', setUserRole, getRestaurantIdFromCookie, getRestaurantUserIdFromCookie, async (req, res) => {
  try {
    const { position, experience, region, comuna, available, schedule, restaurantId: queryRestaurantId } = req.query;

    const talents = await PoolService.getTalentPool({
      queryRestaurantId: queryRestaurantId ? parseInt(queryRestaurantId) : undefined,
      jwtRestaurantId: req.restaurantId,
      position,
      experience,
      region,
      comuna,
      available,
      schedule
    });

    sendSuccessResponse(res, 200, null, talents);
  } catch (error) {
    handleCompanyError(res, error, {
      context: {
        queryRestaurantId: req.query.restaurantId,
        jwtRestaurantId: req.restaurantId,
        filters: {
          position: req.query.position,
          experience: req.query.experience,
          region: req.query.region,
          comuna: req.query.comuna,
          available: req.query.available,
          schedule: req.query.schedule
        }
      },
      logger: Logger
    });
  }
});

// DELETE /talent-pool/:talentId - Remove talent from pool
router.delete('/talent-pool/:talentId', checkCompany, getRestaurantIdFromCookie, async (req, res) => {
  try {
    await PoolService.deleteTalentPoolEntry({
      talentId: req.params.talentId
    });

    sendSuccessResponse(res, 200, 'Talent and associated conversations successfully removed from the pool (soft deleted).');
  } catch (error) {
    handleCompanyError(res, error, {
      context: {
        talentId: req.params.talentId,
        restaurantId: req.restaurantId
      },
      logger: Logger
    });
  }
});

// PATCH /talent-pool/:id/approve - Approve talent pool entry
router.patch('/talent-pool/:id/approve', checkCompany, getRestaurantIdFromCookie, getRestaurantUserIdFromCookie, async (req, res) => {
  try {
    const talentEntry = await PoolService.approveTalentPoolEntry({
      talentId: req.params.id,
      restaurantUserId: req.restaurantUserId
    });

    sendSuccessResponse(res, 200, 'Talent pool entry approved successfully', talentEntry);
  } catch (error) {
    handleCompanyError(res, error, {
      context: {
        talentId: req.params.id,
        restaurantUserId: req.restaurantUserId,
        restaurantId: req.restaurantId
      },
      logger: Logger
    });
  }
});

module.exports = router;
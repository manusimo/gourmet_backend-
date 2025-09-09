const express = require('express');
const { checkCompany, setUserRole } = require('../helpers/authenticateToken.js');
const { getUserIdFromCookie, getRestaurantIdFromCookie, getRestaurantUserIdFromCookie } = require('../helpers/cookies.js');
const { getTalentPool } = require('../helpers/pool.js');
const {
  checkTalentPoolEntry,
  createTalentPoolEntry,
  buildTalentPoolFilters,
  getTalentPoolEntryWithConversations,
  deleteTalentPoolEntry,
  approveTalentPoolEntry
} = require('../helpers/poolHelpers.js');

const router = express.Router();

// GET /talent-pool/check - Check if talent pool entry exists
router.get('/talent-pool/check', checkCompany, getRestaurantIdFromCookie, async (req, res) => {
  try {
    const { employeeId } = req.query;
    const restaurantId = req.restaurantId;

    const existingEntry = await checkTalentPoolEntry(employeeId, restaurantId);

    if (existingEntry) {
      console.log('Talent pool entry exists for employeeId:', employeeId);
      return res.status(200).json({ 
        success: true,
        exists: true 
      });
    } else {
      console.log('No talent pool entry found for employeeId:', employeeId);
      return res.status(200).json({ 
        success: true,
        exists: false 
      });
    }
  } catch (error) {
    console.error('Error checking talent existence:', error);
    res.status(500).json({ 
      success: false,
      message: "Internal Server Error" 
    });
  }
});

// POST /talent-pool - Add employee to talent pool
router.post('/talent-pool', checkCompany, getRestaurantIdFromCookie, getRestaurantUserIdFromCookie, async (req, res) => {
  try {
    const { employeeId } = req.body;
    const restaurantId = parseInt(req.restaurantId);
    const restaurantUserId = parseInt(req.restaurantUserId);

    console.log('🔍 [Talent Pool API] Saving talent:', { employeeId, restaurantId, restaurantUserId });

    const existingEntry = await checkTalentPoolEntry(employeeId, restaurantId);

    if (existingEntry) {
      console.log('🔍 [Talent Pool API] Employee already exists in the talent pool');
      return res.status(409).json({ 
        success: false,
        message: "Employee already exists in the talent pool." 
      });
    }

    const talentEntry = await createTalentPoolEntry({
      employeeId,
      restaurantId,
      restaurantUserId
    });

    console.log('🔍 [Talent Pool API] Talent saved successfully:', talentEntry);

    res.status(201).json({ 
      success: true,
      message: "Employee added to talent pool successfully", 
      data: talentEntry 
    });
  } catch (error) {
    console.error('🔍 [Talent Pool API] Error saving talent:', error);
    res.status(500).json({ 
      success: false,
      message: "Internal Server Error" 
    });
  }
});

// GET /talent-pool - Get talent pool with filters
router.get('/talent-pool', setUserRole, getRestaurantIdFromCookie, getRestaurantUserIdFromCookie, async (req, res) => {
  try {
    const { restaurantUserId, userRole } = req;
    const { position, experience, region, comuna, available, schedule, restaurantId: queryRestaurantId } = req.query;
    
    // Use restaurantId from query parameter if provided, otherwise use from JWT token
    const restaurantId = queryRestaurantId ? parseInt(queryRestaurantId) : req.restaurantId;

    console.log('🔍 [Talent Pool API] Fetching talents for restaurantId:', restaurantId);
    console.log('🔍 [Talent Pool API] Query filters:', { position, experience, region, comuna, available, schedule });
    console.log('🔍 [Talent Pool API] Using restaurantId from:', queryRestaurantId ? 'query parameter' : 'JWT token');

    const filter = buildTalentPoolFilters({
      position,
      experience,
      region,
      comuna,
      available,
      schedule
    });

    const talentPool = await getTalentPool(restaurantId, filter);
    console.log('🔍 [Talent Pool API] Found talents:', talentPool.length);
    console.log('🔍 [Talent Pool API] Talents data:', talentPool);

    res.status(200).json({
      success: true,
      data: talentPool
    });
  } catch (error) {
    console.error('🔍 [Talent Pool API] Error:', error);
    res.status(500).json({ 
      success: false,
      message: "Internal Server Error" 
    });
  }
});

// DELETE /talent-pool/:talentId - Remove talent from pool
router.delete('/talent-pool/:talentId', checkCompany, getRestaurantIdFromCookie, async (req, res) => {
  try {
    const talentId = parseInt(req.params.talentId);

    await deleteTalentPoolEntry(talentId);

    res.status(200).json({ 
      success: true,
      message: "Talent and associated conversations successfully removed from the pool (soft deleted)." 
    });
  } catch (error) {
    console.error('Error removing talent:', error);
    
    if (error.message === 'Talent not found in the pool or already deleted.') {
      return res.status(404).json({ 
        success: false,
        message: "Talent not found in the pool or already deleted." 
      });
    }
    
    res.status(500).json({ 
      success: false,
      message: "Internal Server Error" 
    });
  }
});

// PATCH /talent-pool/:id/approve - Approve talent pool entry
router.patch('/talent-pool/:id/approve', checkCompany, getRestaurantIdFromCookie, getRestaurantUserIdFromCookie, async (req, res) => {
  try {
    const { id } = req.params;
    const restaurantUserId = req.restaurantUserId;

    const talentEntry = await approveTalentPoolEntry(id, restaurantUserId);

    res.status(200).json({ 
      success: true,
      message: "Talent pool entry approved successfully", 
      data: talentEntry 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ 
      success: false,
      message: "Internal Server Error" 
    });
  }
});

module.exports = router;

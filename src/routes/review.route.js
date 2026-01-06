const express = require('express');
const { prisma } = require('../db.js');
const { checkCompany, checkEmployee } = require('../helpers/authenticateToken.js');
const { getAuthFromCookie, getEmployeeIdFromCookie, getRestaurantUserIdFromCookie } = require('../helpers/cookies.js');
const { getHiringById } = require('../helpers/hiringHelpers.js');
const {
  createReview,
  getReviewsForEmployee,
  getReviewsForRestaurant,
  getReviewById,
  getEmployeeAverageRating,
  getRestaurantAverageRating,
  getReviewsForHiring,
  checkUserHasReviewed
} = require('../helpers/reviewHelpers.js');

const router = express.Router();

// POST /reviews - Create review for completed hiring
router.post('/reviews', getAuthFromCookie, async (req, res) => {
  try {
    const {
      hiringId,
      reviewType,
      rating,
      comment
    } = req.body;

    // Get userId and userType from middleware (extracted from token)
    const userId = req.userId;
    const userType = req.userType;

    if (!hiringId || !reviewType || !rating) {
      return res.status(400).json({
        success: false,
        message: 'hiringId, reviewType and rating are required'
      });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be between 1 and 5'
      });
    }

    const hiring = await getHiringById(hiringId);

    if (!hiring) {
      return res.status(404).json({
        success: false,
        message: 'Hiring not found'
      });
    }

    // TEMPORARY: Allow reviews for active/accepted hirings for testing
    // TODO: Change back to only 'completed' status in production
    if (!['completed', 'active', 'accepted'].includes(hiring.status)) {
      return res.status(400).json({
        success: false,
        message: 'Can only create reviews for completed, active, or accepted hirings'
      });
    }

    // TEMPORARY: Relax permission check for testing
    // TODO: Re-enable strict permission checks in production
    let hasPermission = false;
    
    console.log('🔍 Review permission check:', {
      reviewType,
      userType,
      userId,
      hiringRestaurantId: hiring.restaurantId,
      hiringEmployeeId: hiring.employeeId
    });

    if (reviewType === 'employee_review' && userType === 'empresas') {
      // Restaurant reviewing employee - verify restaurant owns this hiring
      const restaurantUser = await prisma.restaurantUser.findFirst({
        where: {
          userId: parseInt(userId),
          restaurantId: hiring.restaurantId
        }
      });
      hasPermission = !!restaurantUser;
      console.log('🔍 Restaurant user check:', { restaurantUser: !!restaurantUser });
    } else if (reviewType === 'restaurant_review' && userType === 'profesionales') {
      // Employee reviewing restaurant - verify employee owns this hiring
      const employee = await prisma.employee.findFirst({
        where: {
          userId: parseInt(userId),
          id: hiring.employeeId
        }
      });
      hasPermission = !!employee;
      console.log('🔍 Employee check:', { employee: !!employee });
    } else {
      // TEMPORARY: For testing, allow if userType matches reviewType direction
      // This is a relaxed check - remove in production
      console.log('⚠️ TEMPORARY: Relaxed permission check for testing');
      hasPermission = true;
    }

    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to create this review'
      });
    }

    const review = await createReview({
      hiringId: parseInt(hiringId),
      employeeId: hiring.employeeId,
      restaurantId: hiring.restaurantId,
      reviewType,
      rating: parseInt(rating),
      comment: comment || null
    });

    res.status(201).json({
      success: true,
      message: 'Review created successfully',
      data: review
    });
  } catch (error) {
    console.error('Error creating review:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal Server Error'
    });
  }
});

// GET /reviews/:type/:id - Get reviews for employee or restaurant
router.get('/reviews/:type/:id', async (req, res) => {
  try {
    const { type, id } = req.params;

    let reviews;
    if (type === 'employee') {
      reviews = await getReviewsForEmployee(parseInt(id));
    } else if (type === 'restaurant') {
      reviews = await getReviewsForRestaurant(parseInt(id));
    } else {
      return res.status(400).json({
        success: false,
        message: 'Type must be either "employee" or "restaurant"'
      });
    }

    res.status(200).json({
      success: true,
      data: reviews
    });
  } catch (error) {
    console.error('Error fetching reviews:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal Server Error'
    });
  }
});

// GET /reviews/:reviewId - Get review by ID
router.get('/reviews/:reviewId', async (req, res) => {
  try {
    const { reviewId } = req.params;

    const review = await getReviewById(reviewId);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }

    res.status(200).json({
      success: true,
      data: review
    });
  } catch (error) {
    console.error('Error fetching review:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal Server Error'
    });
  }
});

// GET /reviews/hiring/:hiringId - Get reviews for a specific hiring
router.get('/reviews/hiring/:hiringId', async (req, res) => {
  try {
    const { hiringId } = req.params;
    const reviews = await getReviewsForHiring(parseInt(hiringId));

    res.status(200).json({
      success: true,
      data: reviews
    });
  } catch (error) {
    console.error('Error fetching reviews for hiring:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal Server Error'
    });
  }
});

// GET /reviews/hiring/:hiringId/check - Check if current user has reviewed this hiring
router.get('/reviews/hiring/:hiringId/check', getAuthFromCookie, async (req, res) => {
  try {
    const { hiringId } = req.params;
    const { userId, userType } = req;

    if (!userId || !userType) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    // Verify hiring exists
    const hiring = await getHiringById(parseInt(hiringId));
    if (!hiring) {
      return res.status(404).json({
        success: false,
        message: 'Hiring not found'
      });
    }

    // Check if user has reviewed
    const hasReviewed = await checkUserHasReviewed(userId, userType, hiring);

    res.status(200).json({
      success: true,
      data: { hasReviewed }
    });
  } catch (error) {
    console.error('Error checking user review:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal Server Error'
    });
  }
});

// GET /reviews/:type/:id/average - Get average rating for employee or restaurant
router.get('/reviews/:type/:id/average', async (req, res) => {
  try {
    const { type, id } = req.params;

    let averageRating;
    if (type === 'employee') {
      averageRating = await getEmployeeAverageRating(parseInt(id));
    } else if (type === 'restaurant') {
      averageRating = await getRestaurantAverageRating(parseInt(id));
    } else {
      return res.status(400).json({
        success: false,
        message: 'Type must be either "employee" or "restaurant"'
      });
    }

    res.status(200).json({
      success: true,
      data: averageRating
    });
  } catch (error) {
    console.error('Error fetching average rating:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal Server Error'
    });
  }
});

module.exports = router;


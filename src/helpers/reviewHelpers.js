const { prisma } = require('../db.js');

/**
 * Create a review
 * @param {Object} reviewData - Review data
 * @returns {Object} Created review
 */
const createReview = async (reviewData) => {
  const {
    hiringId,
    employeeId,
    restaurantId,
    reviewType,
    rating,
    comment
  } = reviewData;

  // Validate rating
  if (rating < 1 || rating > 5) {
    throw new Error('Rating must be between 1 and 5');
  }

  // Validate review type
  if (reviewType !== 'employee_review' && reviewType !== 'restaurant_review') {
    throw new Error('Review type must be either "employee_review" or "restaurant_review"');
  }

  const review = await prisma.review.create({
    data: {
      hiringId: parseInt(hiringId),
      employeeId: parseInt(employeeId),
      restaurantId: parseInt(restaurantId),
      reviewType,
      rating: parseInt(rating),
      comment: comment || null
    },
    include: {
      hiring: true,
      employee: true,
      restaurant: true
    }
  });

  return review;
};

/**
 * Get reviews for employee
 * @param {number} employeeId - Employee ID
 * @returns {Array} Array of reviews
 */
const getReviewsForEmployee = async (employeeId) => {
  return await prisma.review.findMany({
    where: {
      employeeId: parseInt(employeeId),
      reviewType: 'employee_review' // Reviews about the employee
    },
    include: {
      restaurant: {
        include: {
          locations: true
        }
      },
      hiring: {
        include: {
          jobOffer: {
            include: {
              location: true
            }
          }
        }
      }
    },
    orderBy: {
      createdAt: 'desc'
    }
  });
};

/**
 * Get reviews for restaurant
 * @param {number} restaurantId - Restaurant ID
 * @returns {Array} Array of reviews
 */
const getReviewsForRestaurant = async (restaurantId) => {
  return await prisma.review.findMany({
    where: {
      restaurantId: parseInt(restaurantId),
      reviewType: 'restaurant_review' // Reviews about the restaurant
    },
    include: {
      employee: {
        include: {
          user: true
        }
      },
      hiring: {
        include: {
          jobOffer: {
            include: {
              location: true
            }
          }
        }
      }
    },
    orderBy: {
      createdAt: 'desc'
    }
  });
};

/**
 * Get review by ID
 * @param {number} reviewId - Review ID
 * @returns {Object|null} Review or null if not found
 */
const getReviewById = async (reviewId) => {
  return await prisma.review.findUnique({
    where: { id: parseInt(reviewId) },
    include: {
      hiring: {
        include: {
          jobOffer: true,
          employee: true,
          restaurant: true
        }
      },
      employee: {
        include: {
          user: true
        }
      },
      restaurant: true
    }
  });
};

/**
 * Get average rating for employee
 * @param {number} employeeId - Employee ID
 * @returns {Object} Average rating and count
 */
const getEmployeeAverageRating = async (employeeId) => {
  const reviews = await prisma.review.findMany({
    where: {
      employeeId: parseInt(employeeId),
      reviewType: 'employee_review'
    },
    select: {
      rating: true
    }
  });

  if (reviews.length === 0) {
    return {
      average: 0,
      count: 0
    };
  }

  const sum = reviews.reduce((acc, review) => acc + review.rating, 0);
  const average = sum / reviews.length;

  return {
    average: Math.round(average * 10) / 10, // Round to 1 decimal
    count: reviews.length
  };
};

/**
 * Get average rating for restaurant
 * @param {number} restaurantId - Restaurant ID
 * @returns {Object} Average rating and count
 */
const getRestaurantAverageRating = async (restaurantId) => {
  const reviews = await prisma.review.findMany({
    where: {
      restaurantId: parseInt(restaurantId),
      reviewType: 'restaurant_review'
    },
    select: {
      rating: true
    }
  });

  if (reviews.length === 0) {
    return {
      average: 0,
      count: 0
    };
  }

  const sum = reviews.reduce((acc, review) => acc + review.rating, 0);
  const average = sum / reviews.length;

  return {
    average: Math.round(average * 10) / 10, // Round to 1 decimal
    count: reviews.length
  };
};

module.exports = {
  createReview,
  getReviewsForEmployee,
  getReviewsForRestaurant,
  getReviewById,
  getEmployeeAverageRating,
  getRestaurantAverageRating
};


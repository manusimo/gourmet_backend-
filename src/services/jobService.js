const Logger = require('../utils/logger.js');
const { convertImageUrls } = require('../utils/imageUrlUtils.js');
const { buildFilters, buildSearchConditions } = require('../helpers/filterHelpers.js');
const { prisma } = require('../db.js');
const {
  createJobOffer: createJobOfferHelper,
  getJobOfferWithLocation: getJobOfferWithLocationHelper,
  getJobsWithFilters: getJobsWithFiltersHelper,
  getTotalJobsCount: getTotalJobsCountHelper,
  getUserRestaurantIds: getUserRestaurantIdsHelper,
  getJobOfferById: getJobOfferByIdHelper
} = require('../helpers/jobHelpers.js');
const {
  fetchJobsByNameAndLocation: fetchJobsByNameAndLocationHelper,
  fetchTopRatedJobs: fetchTopRatedJobsHelper,
  updateJobOffer: updateJobOfferHelper,
  softDeleteJobCascade: softDeleteJobCascadeHelper
} = require('../helpers/jobs.js');

/**
 * Job Service
 * Handles business logic for job-related operations
 */
class JobService {
  /**
   * Create a new job offer
   * @param {Object} params - Create job offer parameters
   * @param {Object} params.body - Request body data
   * @param {number} params.restaurantId - Restaurant ID
   * @param {number} params.restaurantUserId - Restaurant user ID
   * @returns {Promise<Object>} Created job offer
   * @throws {Error} If validation fails or creation fails
   */
  static async createJob({ body, restaurantId, restaurantUserId }) {
    Logger.info('Creating job offer', { restaurantId, restaurantUserId });

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
      startDate,
      endDate
    } = body;

    // Use restaurantId from request body or from middleware
    const finalRestaurantId = requestRestaurantId || restaurantId;

    // Validate locationId
    if (locationId !== null && locationId !== -1 && (!locationId || locationId <= 0)) {
      const error = new Error('locationId must be a valid location ID, -1 (todas las sucursales), or null (no especificado)');
      error.statusCode = 400;
      error.code = 'INVALID_LOCATION_ID';
      throw error;
    }

    // Create job offer
    const jobOffer = await createJobOfferHelper({
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
      restaurantId: finalRestaurantId,
      restaurantUserId,
      startDate,
      endDate
    });

    // Get job offer with location for verification
    await getJobOfferWithLocationHelper(jobOffer.id);

    Logger.info('Job offer created successfully', {
      jobOfferId: jobOffer.id,
      restaurantId: finalRestaurantId,
      position: jobOffer.position
    });

    return jobOffer;
  }

  /**
   * Get recommended jobs by name and location
   * @param {Object} params - Get recommended jobs parameters
   * @param {string} [params.jobName] - Job name to search for
   * @param {string} [params.location] - Location to search for
   * @param {number} [params.limit] - Limit of results (default: 4)
   * @returns {Promise<Array>} Array of jobs with converted image URLs
   */
  static async getRecommendedJobs({ jobName, location, limit = 4 }) {
    Logger.info('Getting recommended jobs', { jobName, location, limit });

    // Calculate finished date (30 days ago)
    const finishedDateParsed = new Date(new Date().setDate(new Date().getDate() - 30));

    // Fetch jobs by name and location
    const formattedJobs = await fetchJobsByNameAndLocationHelper(jobName, location, null, finishedDateParsed);

    // Convert restaurant image URLs to actual signed URLs for each job
    const jobsWithSignedUrls = await Promise.all(
      formattedJobs.map(async (job) => {
        const updatedJob = { ...job };
        if (updatedJob.restaurant) {
          updatedJob.restaurant = await convertImageUrls(
            updatedJob.restaurant,
            ['profileImageUrl', 'profileCarouselUrls']
          );
        }
        return updatedJob;
      })
    );

    Logger.info('Recommended jobs retrieved successfully', {
      count: jobsWithSignedUrls.length,
      jobName,
      location
    });

    return jobsWithSignedUrls;
  }

  /**
   * Get top-rated jobs for carousel
   * @param {Object} params - Get top-rated jobs parameters
   * @param {number} [params.limit] - Limit of results (default: 4)
   * @returns {Promise<Array>} Array of jobs with converted image URLs
   */
  static async getTopRatedJobs({ limit = 4 }) {
    Logger.info('Getting top-rated jobs', { limit });

    // Calculate finished date (60 days ago)
    const finishedDateParsed = new Date(new Date().setDate(new Date().getDate() - 60));

    // Fetch top-rated jobs
    const formattedJobs = await fetchTopRatedJobsHelper(limit, finishedDateParsed);

    // Convert restaurant image URLs to actual signed URLs for each job
    const jobsWithSignedUrls = await Promise.all(
      formattedJobs.map(async (job) => {
        const updatedJob = { ...job };
        if (updatedJob.restaurant) {
          updatedJob.restaurant = await convertImageUrls(
            updatedJob.restaurant,
            ['profileImageUrl', 'profileCarouselUrls']
          );
        }
        return updatedJob;
      })
    );

    Logger.info('Top-rated jobs retrieved successfully', {
      count: jobsWithSignedUrls.length,
      limit
    });

    return jobsWithSignedUrls;
  }

  /**
   * Update a job offer
   * @param {Object} params - Update job offer parameters
   * @param {number} params.jobId - Job offer ID
   * @param {number} params.restaurantId - Restaurant ID
   * @param {Object} params.body - Request body data with updates
   * @returns {Promise<Object>} Updated job offer
   * @throws {Error} If validation fails or update fails
   */
  static async updateJob({ jobId, restaurantId, body }) {
    Logger.info('Updating job offer', { jobId, restaurantId });

    if (!jobId) {
      const error = new Error('Job offer ID is required');
      error.statusCode = 400;
      error.code = 'MISSING_JOB_ID';
      throw error;
    }

    const parsedJobId = parseInt(jobId, 10);
    if (isNaN(parsedJobId)) {
      const error = new Error('Invalid job offer ID');
      error.statusCode = 400;
      error.code = 'INVALID_JOB_ID';
      throw error;
    }

    if (!restaurantId) {
      const error = new Error('Restaurant ID is required');
      error.statusCode = 400;
      error.code = 'MISSING_RESTAURANT_ID';
      throw error;
    }

    // Update job offer
    const updated = await updateJobOfferHelper(parsedJobId, restaurantId, body);

    Logger.info('Job offer updated successfully', {
      jobId: parsedJobId,
      restaurantId,
      position: updated.position
    });

    return updated;
  }

  /**
   * Get jobs with filters, pagination, and ordering
   * @param {Object} params - Get jobs parameters
   * @param {Object} params.query - Query parameters
   * @returns {Promise<Object>} Paginated jobs with metadata
   */
  static async getJobs({ query }) {
    Logger.info('Getting jobs with filters', { 
      page: query.page,
      limit: query.limit,
      orderBy: query.orderBy,
      position: query.position,
      q: query.q
    });

    const {
      locationId,
      schedule,
      period,
      format,
      contract,
      region,
      comuna,
      position,
      q,
      page,
      limit = 10,
      orderBy,
      finishedDate,
    } = query;

    // Parse finished date (default: 30 days ago)
    const finishedDateParsed = finishedDate
      ? new Date(finishedDate)
      : new Date(new Date().setDate(new Date().getDate() - 30));

    // Parse and validate pagination
    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const limitNumber = Math.max(parseInt(limit, 10) || 10, 1);
    const skip = (pageNumber - 1) * limitNumber;

    // Build restaurant filters
    const restaurantFilterFields = [
      'specialty',
      'format',
      'benefits',
      'region',
      'comuna',
    ];
    const restaurantFilter = buildFilters(query, restaurantFilterFields);
    
    // Build search conditions - prioritize position filter if provided, otherwise use search term
    let searchConditions = {};
    if (position) {
      searchConditions = buildSearchConditions(position, 'position');
    } else if (q) {
      searchConditions = buildSearchConditions(q, 'position');
    }

    // Build order by criteria
    let orderByCriteria = { createdAt: 'desc' };
    if (orderBy === 'applications') {
      orderByCriteria = {
        applications: {
          _count: 'desc',
        },
      };
    } else if (orderBy === 'date') {
      orderByCriteria = {
        createdAt: 'desc',
      };
    }

    // Fetch jobs and total count in parallel
    const [jobs, totalJobs] = await Promise.all([
      getJobsWithFiltersHelper(restaurantFilter, searchConditions, orderByCriteria, limitNumber, skip),
      getTotalJobsCountHelper(restaurantFilter, searchConditions),
    ]);

    // Convert image keys to actual signed URLs for each job's restaurant
    const jobsWithSignedUrls = await Promise.all(
      jobs.map(async (job) => {
        const convertedJob = { ...job };
        if (job.restaurant) {
          convertedJob.restaurant = await convertImageUrls(
            job.restaurant,
            ['profileImageUrl', 'profileCarouselUrls']
          );
        }
        return convertedJob;
      })
    );

    const totalPages = Math.ceil(totalJobs / limitNumber);

    Logger.info('Jobs retrieved successfully', {
      count: jobsWithSignedUrls.length,
      totalJobs,
      totalPages,
      currentPage: pageNumber
    });

    return {
      data: jobsWithSignedUrls,
      totalPages,
      totalJobs,
      currentPage: pageNumber
    };
  }

  /**
   * Get restaurant job offers for a user
   * @param {Object} params - Get restaurant job offers parameters
   * @param {number} params.userId - User ID
   * @param {number} [params.restaurantId] - Optional specific restaurant ID to filter by
   * @returns {Promise<Array>} Array of job offers with converted image URLs
   * @throws {Error} If user doesn't have access to requested restaurant
   */
  static async getRestaurantJobOffers({ userId, restaurantId }) {
    Logger.info('Getting restaurant job offers', { userId, restaurantId });

    if (!userId) {
      const error = new Error('User ID is required');
      error.statusCode = 400;
      error.code = 'MISSING_USER_ID';
      throw error;
    }

    // Get all restaurant IDs the user has access to
    const allRestaurantIds = await getUserRestaurantIdsHelper(userId);

    if (allRestaurantIds.length === 0) {
      const error = new Error('User has no restaurant access');
      error.statusCode = 403;
      error.code = 'NO_RESTAURANT_ACCESS';
      throw error;
    }

    // If a specific restaurant ID is provided, filter to that restaurant
    let targetRestaurantIds = allRestaurantIds;
    if (restaurantId) {
      const requestedRestaurantId = parseInt(restaurantId, 10);
      
      if (isNaN(requestedRestaurantId)) {
        const error = new Error('Invalid restaurant ID');
        error.statusCode = 400;
        error.code = 'INVALID_RESTAURANT_ID';
        throw error;
      }

      // Verify the user has access to the requested restaurant
      if (!allRestaurantIds.includes(requestedRestaurantId)) {
        const error = new Error('You do not have access to this restaurant');
        error.statusCode = 403;
        error.code = 'RESTAURANT_ACCESS_DENIED';
        throw error;
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

    // Convert image keys to actual signed URLs for each job's restaurant
    const jobOffersWithSignedUrls = await Promise.all(
      jobOffers.map(async (job) => {
        const convertedJob = { ...job };
        if (job.restaurant) {
          convertedJob.restaurant = await convertImageUrls(
            job.restaurant,
            ['profileImageUrl', 'profileCarouselUrls']
          );
        }
        return convertedJob;
      })
    );

    Logger.info('Restaurant job offers retrieved successfully', {
      userId,
      restaurantId,
      count: jobOffersWithSignedUrls.length,
      targetRestaurantIds: targetRestaurantIds.length
    });

    return jobOffersWithSignedUrls;
  }

  /**
   * Get job offer by ID
   * @param {Object} params - Get job offer parameters
   * @param {number} params.jobId - Job offer ID
   * @returns {Promise<Object>} Job offer with converted image URLs and formatted data
   * @throws {Error} If validation fails or job offer not found
   */
  static async getJobById({ jobId }) {
    Logger.info('Getting job offer by ID', { jobId });

    if (!jobId) {
      const error = new Error('Job offer ID is required');
      error.statusCode = 400;
      error.code = 'MISSING_JOB_ID';
      throw error;
    }

    const parsedJobId = parseInt(jobId, 10);
    if (isNaN(parsedJobId)) {
      const error = new Error('Invalid job offer ID');
      error.statusCode = 400;
      error.code = 'INVALID_JOB_ID';
      throw error;
    }

    // Get job offer
    const jobOffer = await getJobOfferByIdHelper(parsedJobId);

    if (!jobOffer) {
      const error = new Error('Job offer not found');
      error.statusCode = 404;
      error.code = 'JOB_OFFER_NOT_FOUND';
      throw error;
    }

    // Convert image keys to actual signed URLs for the job's restaurant
    const convertedJob = { ...jobOffer };
    if (jobOffer.restaurant) {
      convertedJob.restaurant = await convertImageUrls(
        jobOffer.restaurant,
        ['profileImageUrl', 'profileCarouselUrls']
      );
    }

    // Format response data
    const responseData = {
      ...convertedJob,
      applicationsCount: jobOffer.applications?.length || 0,
      createdAt: jobOffer.createdAt?.toISOString().slice(0, 10) || null,
    };

    Logger.info('Job offer retrieved successfully', {
      jobId: parsedJobId,
      applicationsCount: responseData.applicationsCount
    });

    return responseData;
  }

  /**
   * Delete (soft delete) a job offer
   * @param {Object} params - Delete job offer parameters
   * @param {number} params.jobId - Job offer ID
   * @param {number} params.restaurantId - Restaurant ID
   * @returns {Promise<Object>} Deleted job offer
   * @throws {Error} If validation fails or deletion fails
   */
  static async deleteJob({ jobId, restaurantId }) {
    Logger.info('Deleting job offer', { jobId, restaurantId });

    if (!jobId) {
      const error = new Error('Job offer ID is required');
      error.statusCode = 400;
      error.code = 'MISSING_JOB_ID';
      throw error;
    }

    const parsedJobId = parseInt(jobId, 10);
    if (isNaN(parsedJobId)) {
      const error = new Error('Invalid job offer ID');
      error.statusCode = 400;
      error.code = 'INVALID_JOB_ID';
      throw error;
    }

    if (!restaurantId) {
      const error = new Error('Restaurant ID is required');
      error.statusCode = 400;
      error.code = 'MISSING_RESTAURANT_ID';
      throw error;
    }

    // Soft delete job offer with cascade
    const deletedJob = await softDeleteJobCascadeHelper(parsedJobId, restaurantId);

    Logger.info('Job offer soft deleted successfully', {
      jobId: parsedJobId,
      restaurantId
    });

    return deletedJob;
  }
}

module.exports = JobService;


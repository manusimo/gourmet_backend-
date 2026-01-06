const {
  getJobPost,
  isJobPostAvailable,
  getExistingApplication,
  createApplication,
  getApplicationById,
  getJobOfferForRestaurant,
  getApplicationsForJobOffer
} = require('../helpers/applicationHelpers.js');
const { convertImageUrls } = require('../utils/imageUrlUtils.js');
const { processApplicationNotifications } = require('./applicationNotificationService.js');
const { Logger } = require('../middleware/errorTracking.js');

/**
 * Service to handle application creation business logic
 */
class ApplicationService {
  /**
   * Create a new job application
   * @param {Object} params - Application parameters
   * @param {number} params.jobPostId - Job post ID
   * @param {number} params.employeeId - Employee ID
   * @param {Array} params.answers - Application answers
   * @returns {Object} Created application
   * @throws {Error} With appropriate error code and message
   */
  static async createApplication({ jobPostId, employeeId, answers }) {
    const startTime = Date.now();

    // Log application attempt
    Logger.info('Application creation started', {
      jobPostId,
      employeeId,
      answersCount: answers?.length || 0
    });

    // Check if job post exists
    const jobPost = await getJobPost(jobPostId);
    if (!jobPost) {
      Logger.warn('Job post not found', { jobPostId, employeeId });
      const error = new Error('Trabajo no encontrado.');
      error.statusCode = 404;
      throw error;
    }

    // Check if job post is available (not deleted, not expired)
    const availability = isJobPostAvailable(jobPost);
    if (!availability.isAvailable) {
      Logger.warn('Job post not available', {
        jobPostId,
        employeeId,
        reason: availability.reason
      });
      const error = new Error(availability.reason);
      error.statusCode = 400;
      throw error;
    }

    // Check if employee has already applied (optimistic check)
    // Note: Database unique constraint will prevent race conditions
    const existingApplication = await getExistingApplication(jobPostId, employeeId);
    if (existingApplication) {
      Logger.warn('Duplicate application attempt', { jobPostId, employeeId });
      const error = new Error('Ya postulaste a este trabajo.');
      error.statusCode = 409;
      error.code = 'DUPLICATE_APPLICATION';
      throw error;
    }

    // Create application (database will enforce uniqueness via constraint)
    const application = await createApplication(jobPostId, employeeId, answers);

    // Log successful creation
    Logger.info('Application created successfully', {
      applicationId: application.id,
      jobPostId,
      employeeId,
      duration: Date.now() - startTime
    });

    // Process notifications asynchronously (fire-and-forget)
    // Don't block response if notifications fail
    processApplicationNotifications({
      jobPostId,
      employeeId,
      applicationId: application.id,
      jobPost
    }).catch(notificationError => {
      // Log notification errors but don't fail the request
      Logger.error('Notification processing failed', {
        applicationId: application.id,
        jobPostId,
        employeeId,
        error: notificationError.message
      });
    });

    return application;
  }

  /**
   * Get application by ID with authorization check and image URL conversion
   * @param {Object} params - Parameters
   * @param {number} params.applicationId - Application ID
   * @param {number} [params.employeeId] - Employee ID (if employee is requesting)
   * @param {number} [params.restaurantId] - Restaurant ID (if company is requesting)
   * @param {string} [params.userType] - User type ('profesionales' or 'empresas')
   * @returns {Object} Application with converted image URLs
   * @throws {Error} With appropriate error code if not authorized
   */
  static async getApplication({ applicationId, employeeId, restaurantId, userType }) {
    // Get application
    const application = await getApplicationById(applicationId);
    
    if (!application) {
      const error = new Error('Postulación no encontrada');
      error.statusCode = 404;
      throw error;
    }

    // Authorization check
    // Employee can only see their own applications
    if (userType === 'profesionales' && employeeId) {
      if (application.employeeId !== employeeId) {
        const error = new Error('No tienes permiso para ver esta postulación');
        error.statusCode = 403;
        throw error;
      }
    }
    
    // Company can only see applications to their job posts
    if (userType === 'empresas' && restaurantId) {
      if (application.jobPost?.restaurantId !== restaurantId) {
        const error = new Error('No tienes permiso para ver esta postulación');
        error.statusCode = 403;
        throw error;
      }
    }

    // If no user type specified, require authentication at route level
    if (!userType) {
      const error = new Error('Debes estar autenticado para ver esta postulación');
      error.statusCode = 401;
      throw error;
    }

    // Convert image URLs to signed URLs
    const applicationWithSignedUrls = { ...application };
    if (application.employee) {
      applicationWithSignedUrls.employee = await convertImageUrls(application.employee, ['profileImageUrl']);
    }
    if (application.jobPost?.restaurant) {
      applicationWithSignedUrls.jobPost.restaurant = await convertImageUrls(
        application.jobPost.restaurant, 
        ['profileImageUrl', 'profileCarouselUrls']
      );
    }

    return applicationWithSignedUrls;
  }

  /**
   * Get applicants for a job offer with authorization check
   * @param {Object} params - Parameters
   * @param {number} params.jobOfferId - Job offer ID
   * @param {number} params.restaurantId - Restaurant ID
   * @returns {Array} Applications with converted image URLs
   * @throws {Error} With appropriate error code if not authorized
   */
  static async getApplicantsForJobOffer({ jobOfferId, restaurantId }) {
    // Validate restaurant ID
    if (!restaurantId) {
      const error = new Error('ID del restaurante es requerido');
      error.statusCode = 401;
      throw error;
    }

    // Check if job offer exists and belongs to restaurant
    const jobOffer = await getJobOfferForRestaurant(jobOfferId, restaurantId);
    if (!jobOffer) {
      const error = new Error('Oferta de trabajo no encontrada o no tienes permiso para ver los postulantes.');
      error.statusCode = 404;
      throw error;
    }

    // Get applications for this job offer
    const applications = await getApplicationsForJobOffer(jobOfferId);

    // Convert employee profile image URLs to signed URLs
    const applicationsWithSignedUrls = await Promise.all(
      applications.map(async (application) => {
        const convertedApplication = { ...application };
        if (application.employee) {
          convertedApplication.employee = await convertImageUrls(application.employee, ['profileImageUrl']);
        }
        return convertedApplication;
      })
    );

    return applicationsWithSignedUrls;
  }
}

module.exports = ApplicationService;


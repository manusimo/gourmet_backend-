const { convertImageUrls } = require('../utils/imageUrlUtils.js');
const Logger = require('../utils/logger.js');
const { uploadFile, extractKeyFromUrl } = require('../services/uploadService.js');
const {
  getEmployeeByUserId,
  createEmployeeProfile,
  generateEmployeeToken,
  getEmployeeProfile,
  updateEmployeeProfile,
  getEmployeeWithDetails,
  synchronizeExperiences,
  synchronizeEducations,
  getEmployeeById: getEmployeeByIdHelper,
  getFavoriteJobs: getFavoriteJobsHelper,
  getJobOfferById: getJobOfferByIdHelper,
  getEmployeeByEmployeeId: getEmployeeByEmployeeIdHelper,
  checkFavoriteJobExists: checkFavoriteJobExistsHelper,
  createFavoriteJob: createFavoriteJobHelper,
  searchEmployees: searchEmployeesHelper,
  getFavoriteJobById: getFavoriteJobByIdHelper,
  deleteFavoriteJob: deleteFavoriteJobHelper,
  checkTalentPoolRecord: checkTalentPoolRecordHelper,
  createTalentPoolRecord: createTalentPoolRecordHelper
} = require('../helpers/employeeHelpers.js');
const { getEmployeeApplications: getEmployeeApplicationsHelper } = require('../helpers/jobHelpers.js');
const { findApplicationDetails } = require('../helpers/employee/findApplication.js');

/**
 * Employee Service
 * Handles business logic for employee-related operations
 */
class EmployeeService {
  /**
   * Format employee information for response
   * @param {Object} employee - Employee object from database
   * @returns {Promise<Object>} Employee with converted image URLs
   */
  static async formatEmployeeInfo(employee) {
    Logger.info('Formatting employee information', { employeeId: employee.id });

    // Convert image keys to signed URLs
    const employeeWithSignedUrls = await convertImageUrls(employee, ['profileImageUrl']);

    Logger.info('Employee information formatted successfully', { employeeId: employee.id });

    return employeeWithSignedUrls;
  }

  /**
   * Get current employee profile by employee ID
   * @param {Object} params - Get employee profile parameters
   * @param {number} params.employeeId - Employee ID
   * @returns {Promise<Object>} Employee profile with converted image URLs
   * @throws {Error} If employee not found
   */
  static async getCurrentEmployeeProfile({ employeeId }) {
    Logger.info('Getting current employee profile', { employeeId });

    if (!employeeId) {
      const error = new Error('ID de empleado es requerido.');
      error.statusCode = 400;
      error.code = 'MISSING_EMPLOYEE_ID';
      throw error;
    }

    const employeeProfile = await getEmployeeProfile(employeeId);

    if (!employeeProfile) {
      const error = new Error('Employee profile not found');
      error.statusCode = 404;
      error.code = 'EMPLOYEE_PROFILE_NOT_FOUND';
      throw error;
    }

    // Convert image keys to signed URLs
    const employeeWithSignedUrls = await convertImageUrls(employeeProfile, ['profileImageUrl']);

    Logger.info('Current employee profile retrieved successfully', { employeeId });

    return employeeWithSignedUrls;
  }

  /**
   * Create employee profile with file uploads and data processing
   * @param {Object} params - Create employee parameters
   * @param {Object} params.body - Request body data
   * @param {Array} params.files - Uploaded files
   * @param {number} params.userId - User ID
   * @returns {Promise<Object>} Created employee profile and token
   * @throws {Error} If validation fails or creation fails
   */
  static async createEmployee({ body, files, userId }) {
    Logger.info('Creating employee profile', { userId });

    // Check if employee already exists
    const existingEmployee = await getEmployeeByUserId(userId);
    if (existingEmployee) {
      const error = new Error('Employee profile already exists');
      error.statusCode = 400;
      error.code = 'EMPLOYEE_ALREADY_EXISTS';
      throw error;
    }

    // Process and validate input data
    const processedData = await this._processEmployeeData(body, files, userId);

    // Create employee profile
    const employeeProfile = await createEmployeeProfile(processedData);

    // Generate authentication token
    const newToken = generateEmployeeToken({
      userId,
      employeeId: employeeProfile.id
    });

    // Convert image keys to signed URLs
    const employeeWithSignedUrls = await convertImageUrls(employeeProfile, ['profileImageUrl']);

    Logger.info('Employee profile created successfully', {
      employeeId: employeeProfile.id,
      userId,
      name: employeeProfile.name
    });

    return {
      ...employeeWithSignedUrls,
      token: newToken
    };
  }

  /**
   * Process employee data from request body and files
   * @param {Object} body - Request body data
   * @param {Array} files - Uploaded files
   * @param {number} userId - User ID
   * @returns {Promise<Object>} Processed employee data
   * @private
   */
  static async _processEmployeeData(body, files, userId) {
    const {
      name,
      position,
      experiences: experiencesRaw,
      surname,
      skills: skillsRaw,
      educations: educationsRaw,
      aboutMe,
      birthDate,
      country,
      phoneNumber,
      comuna,
      region,
      genre,
      civilState,
      available,
      schedule,
      profileImageUrl
    } = body;

    // Parse JSON strings from FormData
    const experiences = this._parseJsonField(experiencesRaw, []);
    const educations = this._parseJsonField(educationsRaw, []);
    const skills = this._parseJsonField(skillsRaw, []);

    // Handle profile image upload
    const profileImageFile = files?.find(file => file.fieldname === 'profileImage');
    const finalProfileImageUrl = await this._handleProfileImageUpload(
      profileImageUrl,
      profileImageFile
    );

    return {
      name,
      position,
      experiences,
      surname,
      skills,
      educations,
      aboutMe,
      birthDate,
      country,
      phoneNumber,
      comuna,
      region,
      genre,
      civilState,
      available,
      schedule,
      profileImageUrl: finalProfileImageUrl || 'No photo',
      userId
    };
  }

  /**
   * Parse JSON field from FormData
   * @param {any} field - Field to parse
   * @param {any} defaultValue - Default value if parsing fails
   * @returns {any} Parsed value or default
   * @private
   */
  static _parseJsonField(field, defaultValue) {
    if (typeof field === 'string') {
      try {
        return JSON.parse(field);
      } catch (error) {
        return defaultValue;
      }
    }
    return field !== undefined && field !== null ? field : defaultValue;
  }

  /**
   * Update employee profile with file uploads and data processing
   * @param {Object} params - Update employee parameters
   * @param {Object} params.body - Request body data
   * @param {Array} params.files - Uploaded files
   * @param {number} params.employeeId - Employee ID
   * @returns {Promise<Object>} Updated employee profile with converted image URLs
   * @throws {Error} If validation fails or update fails
   */
  static async updateEmployee({ body, files, employeeId }) {
    Logger.info('Updating employee profile', { employeeId });

    if (!employeeId) {
      const error = new Error('ID de empleado es requerido.');
      error.statusCode = 400;
      error.code = 'MISSING_EMPLOYEE_ID';
      throw error;
    }

    // Process and validate input data
    const processedData = await this._processUpdateEmployeeData(body, files);

    // Get current employee data once (used for synchronization)
    const currentEmployee = await getEmployeeWithDetails(employeeId);

    // Update employee profile (this handles updating existing experiences/educations)
    await updateEmployeeProfile(employeeId, processedData);

    // Synchronize experiences: delete removed, create new (updates handled by updateEmployeeProfile)
    await synchronizeExperiences(employeeId, processedData.experiences || [], currentEmployee);

    // Synchronize educations: delete removed, create new (updates handled by updateEmployeeProfile)
    await synchronizeEducations(employeeId, processedData.educations || [], currentEmployee);

    // Get updated employee with all details
    const updatedEmployee = await getEmployeeWithDetails(employeeId);

    // Convert image keys to signed URLs
    const employeeWithSignedUrls = await convertImageUrls(updatedEmployee, ['profileImageUrl']);

    Logger.info('Employee profile updated successfully', {
      employeeId,
      name: updatedEmployee.name
    });

    return employeeWithSignedUrls;
  }

  /**
   * Process employee update data from request body and files
   * @param {Object} body - Request body data
   * @param {Array} files - Uploaded files
   * @returns {Promise<Object>} Processed employee update data
   * @private
   */
  static async _processUpdateEmployeeData(body, files) {
    const {
      name,
      position,
      experiences: experiencesRaw,
      surname,
      period,
      yearsOfExperience,
      educations: educationsRaw,
      skills: skillsRaw,
      aboutMe,
      birthDate,
      region,
      comuna,
      country,
      phoneNumber,
      genre,
      civilState,
      available,
      schedule,
      profileImageUrl
    } = body;

    // Parse JSON strings from FormData and ensure arrays are never undefined
    const experiences = this._parseJsonField(experiencesRaw, []);
    const educations = this._parseJsonField(educationsRaw, []);
    const skills = this._parseJsonField(skillsRaw, []);

    // Handle profile image upload
    const profileImageFile = files?.find(file => file.fieldname === 'profileImage');
    const finalProfileImageUrl = await this._handleProfileImageUpload(
      profileImageUrl,
      profileImageFile
    );

    return {
      name,
      position,
      experiences: experiences || [],
      surname,
      period,
      yearsOfExperience,
      educations: educations || [],
      skills,
      aboutMe,
      birthDate,
      region,
      comuna,
      country,
      phoneNumber,
      genre,
      civilState,
      available,
      schedule,
      profileImageUrl: finalProfileImageUrl
    };
  }

  /**
   * Handle profile image upload
   * @param {string} profileImageUrl - Existing profile image URL
   * @param {Object} profileImageFile - Uploaded profile image file
   * @returns {Promise<string>} Final profile image URL/key
   * @private
   */
  static async _handleProfileImageUpload(profileImageUrl, profileImageFile) {
    if (profileImageFile) {
      const uploadResult = await uploadFile(profileImageFile, 'employee-profiles');
      if (uploadResult.success) {
        return uploadResult.key;
      } else {
        const error = new Error('Failed to upload profile image');
        error.statusCode = 400;
        error.code = 'PROFILE_IMAGE_UPLOAD_FAILED';
        error.details = uploadResult.error;
        throw error;
      }
    }

    if (!profileImageUrl) {
      return null;
    }

    // Extract key from signed URL if needed
    if (typeof profileImageUrl === 'string' && profileImageUrl.includes('/api/company/signed-url/')) {
      return profileImageUrl.split('/api/company/signed-url/')[1];
    }

    const maybeKey = extractKeyFromUrl(profileImageUrl);
    return maybeKey || profileImageUrl;
  }

  /**
   * Get applications for an employee
   * @param {Object} params - Get employee applications parameters
   * @param {number} params.employeeId - Employee ID
   * @returns {Promise<Array>} Array of applications with converted image URLs
   * @throws {Error} If validation fails or employee not found
   */
  static async getEmployeeApplications({ employeeId }) {
    Logger.info('Getting employee applications', { employeeId });

    if (!employeeId) {
      const error = new Error('ID de empleado es requerido.');
      error.statusCode = 400;
      error.code = 'MISSING_EMPLOYEE_ID';
      throw error;
    }

    const parsedEmployeeId = parseInt(employeeId, 10);
    if (isNaN(parsedEmployeeId)) {
      const error = new Error('ID de empleado inválido.');
      error.statusCode = 400;
      error.code = 'INVALID_EMPLOYEE_ID';
      throw error;
    }

    // Check if employee exists
    const employeeExists = await getEmployeeByIdHelper(parsedEmployeeId);
    if (!employeeExists) {
      const error = new Error('Employee not found');
      error.statusCode = 404;
      error.code = 'EMPLOYEE_NOT_FOUND';
      throw error;
    }

    // Get applications for employee
    const applications = await getEmployeeApplicationsHelper(parsedEmployeeId);

    // Convert restaurant image URLs to actual signed URLs for each application
    const applicationsWithSignedUrls = await Promise.all(
      applications.map(async (application) => {
        const convertedApplication = { ...application };
        if (application.jobPost && application.jobPost.restaurant) {
          convertedApplication.jobPost.restaurant = await convertImageUrls(
            application.jobPost.restaurant,
            ['profileImageUrl', 'profileCarouselUrls']
          );
        }
        return convertedApplication;
      })
    );

    Logger.info('Employee applications retrieved successfully', {
      employeeId: parsedEmployeeId,
      count: applicationsWithSignedUrls.length
    });

    return applicationsWithSignedUrls;
  }

  /**
   * Get specific application by employee ID and job post ID
   * @param {Object} params - Get application parameters
   * @param {number} params.employeeId - Employee ID
   * @param {number} params.jobPostId - Job post ID
   * @returns {Promise<Object>} Application with converted image URLs
   * @throws {Error} If validation fails or application not found
   */
  static async getApplicationByEmployeeAndJobPost({ employeeId, jobPostId }) {
    Logger.info('Getting application by employee and job post', { employeeId, jobPostId });

    if (!employeeId || !jobPostId) {
      const error = new Error('ID de empleado y ID de publicación de trabajo son requeridos.');
      error.statusCode = 400;
      error.code = 'MISSING_IDS';
      throw error;
    }

    const employeeIdInt = parseInt(employeeId, 10);
    const jobPostIdInt = parseInt(jobPostId, 10);

    if (isNaN(employeeIdInt) || isNaN(jobPostIdInt)) {
      const error = new Error('Invalid employee or job post ID.');
      error.statusCode = 400;
      error.code = 'INVALID_IDS';
      throw error;
    }

    // Find application details
    const application = await findApplicationDetails(employeeIdInt, jobPostIdInt);

    if (!application) {
      const error = new Error('Application not found.');
      error.statusCode = 404;
      error.code = 'APPLICATION_NOT_FOUND';
      throw error;
    }

    // Convert image URLs to signed URLs
    const applicationWithSignedUrls = { ...application };
    if (application.employee) {
      applicationWithSignedUrls.employee = await convertImageUrls(
        application.employee,
        ['profileImageUrl']
      );
    }
    if (application.jobPost?.restaurant) {
      applicationWithSignedUrls.jobPost.restaurant = await convertImageUrls(
        application.jobPost.restaurant,
        ['profileImageUrl', 'profileCarouselUrls']
      );
    }

    Logger.info('Application retrieved successfully', {
      employeeId: employeeIdInt,
      jobPostId: jobPostIdInt,
      applicationId: application.id
    });

    return applicationWithSignedUrls;
  }

  /**
   * Get all favorite jobs for an employee
   * @param {Object} params - Get favorite jobs parameters
   * @param {number} params.employeeId - Employee ID
   * @returns {Promise<Array>} Array of favorite jobs with converted image URLs
   * @throws {Error} If validation fails or employee not found
   */
  static async getFavoriteJobs({ employeeId }) {
    Logger.info('Getting favorite jobs for employee', { employeeId });

    if (!employeeId) {
      const error = new Error('Employee not found');
      error.statusCode = 404;
      error.code = 'EMPLOYEE_NOT_FOUND';
      throw error;
    }

    // Get favorite jobs
    const favoriteJobs = await getFavoriteJobsHelper(employeeId);

    // Convert image keys to actual signed URLs for favorite jobs' restaurants
    const favoriteJobsWithSignedUrls = await Promise.all(
      (favoriteJobs || []).map(async (favoriteJob) => {
        const convertedJob = { ...favoriteJob };
        if (favoriteJob.jobOffer && favoriteJob.jobOffer.restaurant) {
          convertedJob.jobOffer.restaurant = await convertImageUrls(
            favoriteJob.jobOffer.restaurant,
            ['profileImageUrl', 'profileCarouselUrls']
          );
        }
        return convertedJob;
      })
    );

    Logger.info('Favorite jobs retrieved successfully', {
      employeeId,
      count: favoriteJobsWithSignedUrls.length
    });

    return favoriteJobsWithSignedUrls;
  }

  /**
   * Add a job post to employee's favorites
   * @param {Object} params - Add favorite job parameters
   * @param {number} params.employeeId - Employee ID
   * @param {number} params.jobPostId - Job post ID
   * @returns {Promise<Object>} Created favorite job
   * @throws {Error} If validation fails, job post not found, employee not found, or already favorite
   */
  static async addFavoriteJob({ employeeId, jobPostId }) {
    Logger.info('Adding favorite job', { employeeId, jobPostId });

    if (!employeeId) {
      const error = new Error('Employee not found');
      error.statusCode = 404;
      error.code = 'EMPLOYEE_NOT_FOUND';
      throw error;
    }

    if (!jobPostId) {
      const error = new Error('Job post ID is required');
      error.statusCode = 400;
      error.code = 'MISSING_JOB_POST_ID';
      throw error;
    }

    // Validate job post exists
    const jobPost = await getJobOfferByIdHelper(jobPostId);
    if (!jobPost) {
      const error = new Error('Job post not found');
      error.statusCode = 404;
      error.code = 'JOB_POST_NOT_FOUND';
      throw error;
    }

    // Validate employee exists
    const employee = await getEmployeeByEmployeeIdHelper(employeeId);
    if (!employee) {
      const error = new Error('Employee not found');
      error.statusCode = 404;
      error.code = 'EMPLOYEE_NOT_FOUND';
      throw error;
    }

    // Check if already favorite
    const existingFavorite = await checkFavoriteJobExistsHelper(employeeId, jobPostId);
    if (existingFavorite) {
      const error = new Error('Job post is already a favorite');
      error.statusCode = 400;
      error.code = 'ALREADY_FAVORITE';
      throw error;
    }

    // Create favorite job
    const newFavorite = await createFavoriteJobHelper(employeeId, jobPostId);

    Logger.info('Favorite job added successfully', {
      employeeId,
      jobPostId,
      favoriteJobId: newFavorite.id
    });

    return newFavorite;
  }

  /**
   * Search employees with filters
   * @param {Object} params - Search parameters
   * @param {string} [params.position] - Position filter
   * @param {string} [params.experience] - Experience filter
   * @param {string} [params.region] - Region filter
   * @param {string} [params.comuna] - Comuna filter
   * @param {string} [params.available] - Available filter
   * @param {string} [params.schedule] - Schedule filter
   * @returns {Promise<Array>} Array of employees with converted image URLs
   */
  static async searchEmployees({ position, experience, region, comuna, available, schedule }) {
    Logger.info('Searching employees', {
      position,
      experience,
      region,
      comuna,
      available,
      schedule
    });

    // Search employees with filters
    const employees = await searchEmployeesHelper({
      position,
      experience,
      region,
      comuna,
      available,
      schedule
    });

    // Convert image keys to actual signed URLs for each employee
    const employeesWithSignedUrls = await convertImageUrls(employees, ['profileImageUrl']);

    Logger.info('Employee search completed successfully', {
      count: employeesWithSignedUrls.length
    });

    return employeesWithSignedUrls;
  }

  /**
   * Delete a favorite job for an employee
   * @param {Object} params - Delete favorite job parameters
   * @param {number} params.employeeId - Employee ID
   * @param {number} params.jobPostId - Job post ID
   * @returns {Promise<void>}
   * @throws {Error} If validation fails, employee not authorized, or favorite job not found
   */
  static async deleteFavoriteJob({ employeeId, jobPostId }) {
    Logger.info('Deleting favorite job', { employeeId, jobPostId });

    if (!employeeId) {
      const error = new Error('Unauthorized access.');
      error.statusCode = 403;
      error.code = 'UNAUTHORIZED';
      throw error;
    }

    if (!jobPostId) {
      const error = new Error('Job post ID is required');
      error.statusCode = 400;
      error.code = 'MISSING_JOB_POST_ID';
      throw error;
    }

    // Get favorite job to verify it exists and belongs to the employee
    const favoriteJob = await getFavoriteJobByIdHelper(employeeId, jobPostId);
    if (!favoriteJob) {
      const error = new Error('Favorite job not found.');
      error.statusCode = 404;
      error.code = 'FAVORITE_JOB_NOT_FOUND';
      throw error;
    }

    // Delete the favorite job
    await deleteFavoriteJobHelper(favoriteJob.id);

    Logger.info('Favorite job deleted successfully', {
      employeeId,
      jobPostId,
      favoriteJobId: favoriteJob.id
    });
  }

  /**
   * Check if a job post is already a favorite for an employee
   * @param {Object} params - Check favorite job parameters
   * @param {number} params.employeeId - Employee ID
   * @param {number} params.jobPostId - Job post ID
   * @returns {Promise<Object>} Object with isSaved boolean
   * @throws {Error} If validation fails or employee not found
   */
  static async checkFavoriteJob({ employeeId, jobPostId }) {
    Logger.info('Checking if job is favorite', { employeeId, jobPostId });

    if (!employeeId) {
      const error = new Error('Employee not found');
      error.statusCode = 404;
      error.code = 'EMPLOYEE_NOT_FOUND';
      throw error;
    }

    if (!jobPostId) {
      const error = new Error('Job post ID is required');
      error.statusCode = 400;
      error.code = 'MISSING_JOB_POST_ID';
      throw error;
    }

    const parsedJobPostId = parseInt(jobPostId, 10);
    if (isNaN(parsedJobPostId)) {
      const error = new Error('Invalid job post ID');
      error.statusCode = 400;
      error.code = 'INVALID_JOB_POST_ID';
      throw error;
    }

    // Check if favorite job exists
    const favoriteJob = await checkFavoriteJobExistsHelper(employeeId, parsedJobPostId);

    const result = {
      isSaved: !!favoriteJob,
      message: favoriteJob ? 'You have already saved this job' : 'Job not found'
    };

    Logger.info('Favorite job check completed', {
      employeeId,
      jobPostId: parsedJobPostId,
      isSaved: result.isSaved
    });

    return result;
  }

  /**
   * Add employee to talent pool for a restaurant
   * @param {Object} params - Add to talent pool parameters
   * @param {number} params.employeeId - Employee ID
   * @param {number} params.restaurantId - Restaurant ID
   * @returns {Promise<Object>} Created talent pool record
   * @throws {Error} If validation fails, already exists, or creation fails
   */
  static async addToTalentPool({ employeeId, restaurantId }) {
    Logger.info('Adding employee to talent pool', { employeeId, restaurantId });

    if (!employeeId) {
      const error = new Error('Employee ID is required');
      error.statusCode = 400;
      error.code = 'MISSING_EMPLOYEE_ID';
      throw error;
    }

    if (!restaurantId) {
      const error = new Error('Restaurant ID is required');
      error.statusCode = 400;
      error.code = 'MISSING_RESTAURANT_ID';
      throw error;
    }

    // Check if record already exists
    const existingRecord = await checkTalentPoolRecordHelper(employeeId, restaurantId);
    if (existingRecord) {
      const error = new Error('You have already applied to this company.');
      error.statusCode = 409;
      error.code = 'TALENT_POOL_RECORD_EXISTS';
      throw error;
    }

    // Create talent pool record
    const newTalentPoolRecord = await createTalentPoolRecordHelper(employeeId, restaurantId);

    if (!newTalentPoolRecord) {
      const error = new Error('We were not able to send the cv to this company');
      error.statusCode = 500;
      error.code = 'TALENT_POOL_CREATION_FAILED';
      throw error;
    }

    Logger.info('Talent pool record created successfully', {
      employeeId,
      restaurantId,
      talentPoolId: newTalentPoolRecord.id
    });

    return newTalentPoolRecord;
  }

  /**
   * Check talent pool status for an employee and restaurant
   * @param {Object} params - Check talent pool parameters
   * @param {number} params.employeeId - Employee ID
   * @param {number} params.restaurantId - Restaurant ID
   * @returns {Promise<Object>} Object with isCvSent boolean and message
   * @throws {Error} If validation fails
   */
  static async checkTalentPoolStatus({ employeeId, restaurantId }) {
    Logger.info('Checking talent pool status', { employeeId, restaurantId });

    if (!restaurantId) {
      const error = new Error('Invalid restaurant ID');
      error.statusCode = 400;
      error.code = 'MISSING_RESTAURANT_ID';
      throw error;
    }

    const parsedRestaurantId = parseInt(restaurantId, 10);
    if (isNaN(parsedRestaurantId)) {
      const error = new Error('Invalid restaurant ID');
      error.statusCode = 400;
      error.code = 'INVALID_RESTAURANT_ID';
      throw error;
    }

    // Check if record exists
    const existingRecord = await checkTalentPoolRecordHelper(employeeId, parsedRestaurantId);

    const result = {
      isCvSent: !!existingRecord,
      message: existingRecord 
        ? 'Application already exists for this company.' 
        : 'No application found for this company.'
    };

    Logger.info('Talent pool status check completed', {
      employeeId,
      restaurantId: parsedRestaurantId,
      isCvSent: result.isCvSent
    });

    return result;
  }
}

module.exports = EmployeeService;


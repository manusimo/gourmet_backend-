const {
  getCompanies,
  getTotalCompanies,
  getRestaurantUserById,
  getCompanyLocations,
  formatLocations,
  getTopRatedCompanies,
  getTotalCompaniesCount,
  getTalentsApplications,
  createCompanyProfile,
  generateCompanyToken,
  getCompanyById
} = require('../helpers/companyHelpers.js');
const { deleteLocations, updateCompanyProfile, createNewLocations } = require('../helpers/company.js');
const { filterNewLocations, filterExistingLocations, getCurrentLocations, findLocationsToDelete } = require('../helpers/companyHelpers.js');
const { buildFilters, buildSearchConditions } = require('../helpers/filterHelpers.js');
const { convertImageUrls } = require('../utils/imageUrlUtils.js');
const { parseIntervalToAverage } = require('../utils/parseIntervalToAverage.js');
const { uploadFile, uploadMultipleFiles, extractKeyFromUrl } = require('./uploadService.js');
const { prisma } = require('../db.js');
const Logger = require('../utils/logger.js');

/**
 * Company Service
 * Handles business logic for company-related operations
 */
class CompanyService {
  /**
   * Get companies with filters, pagination, and search
   * @param {Object} params - Get companies parameters
   * @param {string} params.q - Search query
   * @param {number} params.page - Page number
   * @param {number} params.limit - Items per page
   * @param {string} params.orderBy - Order by criteria ('popularity' or 'scale')
   * @param {Object} params.query - Query parameters for filters
   * @returns {Promise<Object>} Companies with pagination metadata
   * @throws {Error} If validation fails or database error occurs
   */
  static async getCompanies({ q, page = 1, limit = 10, orderBy, query }) {
    Logger.info('Getting companies', { q, page, limit, orderBy });

    // Validate pagination parameters
    const pageInt = Math.max(parseInt(page, 10), 1);
    const limitInt = Math.max(parseInt(limit, 10), 1);

    // Validate orderBy parameter
    if (orderBy && !['popularity', 'scale'].includes(orderBy)) {
      const error = new Error("Valor de ordenamiento inválido. Debe ser 'popularity' o 'scale'.");
      error.statusCode = 400;
      error.code = 'INVALID_ORDER_BY';
      throw error;
    }

    // Build filters and search conditions
    const filterFields = ['format', 'specialty', 'region', 'comuna', 'benefits', 'workers', 'weeklyAverageClients'];
    const filters = buildFilters(query, filterFields);
    const searchConditions = buildSearchConditions(q, 'name');

    // Calculate order by criteria if specified (business logic in service)
    let orderByCriteria = null;
    if (orderBy) {
      orderByCriteria = await this._calculateOrderByCriteria(orderBy);
    }

    // Calculate pagination
    const skip = (pageInt - 1) * limitInt;

    // Fetch companies and total count in parallel
    const [companies, totalCompanies] = await Promise.all([
      getCompanies(filters, searchConditions, limitInt, skip, orderByCriteria),
      getTotalCompanies(filters, searchConditions)
    ]);

    // Convert image keys to signed URLs
    const companiesWithSignedUrls = await Promise.all(
      companies.map(async (company) => {
        return await convertImageUrls(company, ['profileImageUrl', 'profileCarouselUrls']);
      })
    );

    Logger.info('Companies retrieved successfully', {
      count: companiesWithSignedUrls.length,
      totalCompanies,
      page: pageInt
    });

    return {
      data: companiesWithSignedUrls,
      totalCompanies,
      currentPage: pageInt,
      totalPages: Math.ceil(totalCompanies / limitInt)
    };
  }

  /**
   * Calculate order by criteria for companies (business logic)
   * @param {string} orderBy - Order by type ('popularity' or 'scale')
   * @returns {Promise<Object>} Order by criteria object
   * @private
   */
  static async _calculateOrderByCriteria(orderBy) {
    if (orderBy === 'popularity') {
      // Fetch restaurants with application counts
      const restaurants = await prisma.restaurant.findMany({
        select: {
          id: true,
          jobOffers: {
            select: {
              _count: {
                select: {
                  applications: true
                }
              }
            }
          }
        }
      });

      // Calculate popularity (total applications per restaurant)
      const restaurantsWithPopularity = restaurants.map((restaurant) => ({
        id: restaurant.id,
        applicationCount: restaurant.jobOffers.reduce(
          (sum, jobOffer) => sum + jobOffer._count.applications,
          0
        )
      }));

      // Sort by popularity (descending)
      const sortedRestaurants = restaurantsWithPopularity.sort(
        (a, b) => b.applicationCount - a.applicationCount
      );

      // Extract sorted IDs
      const sortedIds = sortedRestaurants.map((r) => r.id);

      return sortedIds.length > 0
        ? { id: { in: sortedIds } }
        : { id: { in: [] } };
    }

    if (orderBy === 'scale') {
      // Fetch all restaurants with workers and clients data
      const restaurants = await prisma.restaurant.findMany({
        select: {
          id: true,
          workers: true,
          weeklyAverageClients: true
        }
      });

      // Calculate scale (workers + clients average)
      const restaurantsWithScale = restaurants.map((restaurant) => ({
        id: restaurant.id,
        scale:
          parseIntervalToAverage(restaurant.workers) +
          parseIntervalToAverage(restaurant.weeklyAverageClients)
      }));

      // Sort by scale (descending)
      const sortedRestaurants = restaurantsWithScale.sort(
        (a, b) => b.scale - a.scale
      );

      // Extract sorted IDs
      const sortedIds = sortedRestaurants.map((r) => r.id);

      return { id: { in: sortedIds } };
    }

    return {};
  }

  /**
   * Format restaurant user information for response
   * @param {Object} restaurantUser - Restaurant user object from database
   * @returns {Promise<Object>} Formatted restaurant user information
   */
  static async formatRestaurantUserInfo(restaurantUser) {
    Logger.info('Formatting restaurant user information', { restaurantUserId: restaurantUser.id });

    // Format response data
    const restaurantInfo = {
      id: restaurantUser.id,
      name: restaurantUser.user.name,
      surname: restaurantUser.user.surname,
      email: restaurantUser.user.email,
      profileImageUrl: restaurantUser.restaurant.profileImageUrl,
      position: restaurantUser.position || 'Staff Member',
      location: restaurantUser.restaurant.location || 'Location not specified',
      restaurantName: restaurantUser.restaurant.name,
      restaurantDescription: restaurantUser.restaurant.description
    };

    // Convert image URL to signed URL
    if (restaurantInfo.profileImageUrl) {
      const converted = await convertImageUrls(
        { profileImageUrl: restaurantInfo.profileImageUrl },
        ['profileImageUrl']
      );
      restaurantInfo.profileImageUrl = converted.profileImageUrl || restaurantInfo.profileImageUrl;
    }

    Logger.info('Restaurant user information formatted successfully', {
      restaurantUserId: restaurantUser.id,
      restaurantName: restaurantInfo.restaurantName
    });

    return restaurantInfo;
  }

  /**
   * Get company locations by restaurant ID
   * @param {Object} params - Get locations parameters
   * @param {number} params.restaurantId - Restaurant ID
   * @returns {Promise<Array>} Formatted locations array
   * @throws {Error} If restaurantId is missing
   */
  static async getCompanyLocations({ restaurantId }) {
    Logger.info('Getting company locations', { restaurantId });

    if (!restaurantId) {
      const error = new Error('ID del restaurante es requerido.');
      error.statusCode = 400;
      error.code = 'MISSING_RESTAURANT_ID';
      throw error;
    }

    const parsedRestaurantId = parseInt(restaurantId, 10);
    if (isNaN(parsedRestaurantId)) {
      const error = new Error('ID del restaurante inválido.');
      error.statusCode = 400;
      error.code = 'INVALID_RESTAURANT_ID';
      throw error;
    }

    // Get locations
    const locations = await getCompanyLocations(parsedRestaurantId);

    // Format locations
    const formattedLocations = formatLocations(locations);

    Logger.info('Company locations retrieved successfully', {
      restaurantId: parsedRestaurantId,
      locationCount: formattedLocations.length
    });

    // Return empty array if no locations (frontend handles empty state)
    return formattedLocations;
  }

  /**
   * Get top rated companies with pagination
   * @param {Object} params - Get top rated companies parameters
   * @param {number} params.page - Page number
   * @param {number} params.limit - Items per page
   * @returns {Promise<Object>} Top rated companies with pagination metadata
   * @throws {Error} If validation fails or database error occurs
   */
  static async getTopRatedCompanies({ page = 1, limit = 4 }) {
    Logger.info('Getting top rated companies', { page, limit });

    // Validate pagination parameters
    const pageInt = Math.max(parseInt(page, 10), 1);
    const limitInt = Math.max(parseInt(limit, 10), 1);

    // Calculate pagination
    const skip = (pageInt - 1) * limitInt;

    // Fetch top rated companies and total count in parallel
    const [companies, totalCompanies] = await Promise.all([
      getTopRatedCompanies(limitInt, skip),
      getTotalCompaniesCount()
    ]);

    // Convert image keys to signed URLs and format response
    const companiesWithSignedUrls = await Promise.all(
      companies.map(async (company) => {
        const companyWithUrls = await convertImageUrls(company, ['profileImageUrl', 'profileCarouselUrls']);
        return {
          ...companyWithUrls,
          jobOffersCount: company._count?.jobOffers || 0
        };
      })
    );

    Logger.info('Top rated companies retrieved successfully', {
      count: companiesWithSignedUrls.length,
      totalCompanies,
      page: pageInt
    });

    return {
      data: companiesWithSignedUrls,
      totalCompanies,
      currentPage: pageInt,
      totalPages: Math.ceil(totalCompanies / limitInt)
    };
  }

  /**
   * Get talents applications for a restaurant
   * @param {Object} params - Get talents applications parameters
   * @param {number} params.restaurantId - Restaurant ID
   * @returns {Promise<Array>} Array of talent applications
   * @throws {Error} If restaurantId is missing
   */
  static async getTalentsApplications({ restaurantId }) {
    Logger.info('Getting talents applications', { restaurantId });

    if (!restaurantId) {
      const error = new Error('ID del restaurante es requerido.');
      error.statusCode = 400;
      error.code = 'MISSING_RESTAURANT_ID';
      throw error;
    }

    const parsedRestaurantId = parseInt(restaurantId, 10);
    if (isNaN(parsedRestaurantId)) {
      const error = new Error('ID del restaurante inválido.');
      error.statusCode = 400;
      error.code = 'INVALID_RESTAURANT_ID';
      throw error;
    }

    // Get talents applications
    const talents = await getTalentsApplications(parsedRestaurantId);

    Logger.info('Talents applications retrieved successfully', {
      restaurantId: parsedRestaurantId,
      count: talents.length
    });

    return talents;
  }

  /**
   * Create company profile with file uploads and data processing
   * @param {Object} params - Create company parameters
   * @param {Object} params.body - Request body data
   * @param {Array} params.files - Uploaded files
   * @param {number} params.userId - User ID
   * @param {string} params.userType - User type
   * @param {string} params.role - User role
   * @returns {Promise<Object>} Created company profile and token
   * @throws {Error} If validation fails or creation fails
   */
  static async createCompany({ body, files, userId, userType, role }) {
    Logger.info('Creating company profile', { userId, userType, role });

    // Process and validate input data
    const processedData = await this._processCompanyData(body, files, userId);

    // Create company profile
    const companyProfile = await createCompanyProfile(processedData);

    // Generate authentication token
    const newToken = this._generateCompanyAuthToken({
      userId,
      userType,
      role,
      restaurantId: companyProfile.id
    });

    Logger.info('Company profile created successfully', {
      companyId: companyProfile.id,
      userId,
      name: companyProfile.name
    });

    return {
      ...companyProfile,
      token: newToken
    };
  }

  /**
   * Process company data from request body and files
   * @param {Object} body - Request body data
   * @param {Array} files - Uploaded files
   * @param {number} userId - User ID
   * @returns {Promise<Object>} Processed company data
   * @private
   */
  static async _processCompanyData(body, files, userId) {
    const {
      name,
      specialty,
      format,
      description,
      rut,
      legalName,
      region,
      comuna,
      numberOfRestaurants,
      workers,
      weeklyAverageClients,
      jobOffers,
      profileImageUrl
    } = body;

    // Parse JSON strings from FormData
    const benefits = this._parseJsonField(body.benefits, {});
    const locations = this._ensureArray(this._parseJsonField(body.locations, []));
    const profileCarouselUrls = this._parseJsonField(body.profileCarouselUrls, []);

    // Handle file uploads
    const finalProfileImageUrl = await this._handleProfileImageUpload(
      profileImageUrl,
      files?.find(file => file.fieldname === 'profileImage')
    );

    const finalProfileCarouselUrls = await this._handleGalleryImagesUpload(
      profileCarouselUrls,
      files?.filter(file => file.fieldname === 'galleryImages')
    );

    // Process and normalize data
    return {
      name: name || '',
      specialty: specialty || '',
      format: format || '',
      description: description || 'No hay descripción',
      rut: rut || 'No rut to show',
      legalName: legalName || 'No legal name to show',
      region: region || 'No hay',
      comuna: comuna || 'No hay',
      numberOfRestaurants: numberOfRestaurants ? parseInt(numberOfRestaurants, 10) : 1,
      workers: workers || '',
      weeklyAverageClients: weeklyAverageClients || '',
      benefits: this._processBenefits(benefits),
      locations: Array.isArray(locations) ? locations : [],
      jobOffers: Array.isArray(jobOffers) ? jobOffers : [],
      profileImageUrl: finalProfileImageUrl || 'No photo',
      profileCarouselUrls: finalProfileCarouselUrls,
      userId
    };
  }

  /**
   * Process benefits field (handle both array and object formats)
   * @param {any} benefits - Benefits data
   * @returns {Array} Processed benefits array
   * @private
   */
  static _processBenefits(benefits) {
    if (Array.isArray(benefits)) {
      return benefits;
    }
    if (benefits && typeof benefits === 'object') {
      return Object.keys(benefits).filter(key => benefits[key]);
    }
    return [];
  }

  /**
   * Generate company authentication token
   * @param {Object} params - Token parameters
   * @param {number} params.userId - User ID
   * @param {string} params.userType - User type
   * @param {string} params.role - User role
   * @param {number} params.restaurantId - Restaurant ID
   * @returns {string} JWT token
   * @private
   */
  static _generateCompanyAuthToken({ userId, userType, role, restaurantId }) {
    // Admin users don't need RestaurantUser record
    const restaurantUserId = null;
    return generateCompanyToken({
      userId,
      userType,
      role,
      restaurantId,
      restaurantUserId
    });
  }

  /**
   * Get company by ID
   * @param {Object} params - Get company parameters
   * @param {number} params.companyId - Company ID
   * @returns {Promise<Object>} Company with converted image URLs
   * @throws {Error} If company not found
   */
  static async getCompanyById({ companyId }) {
    Logger.info('Getting company by ID', { companyId });

    const parsedId = parseInt(companyId, 10);
    if (isNaN(parsedId)) {
      const error = new Error('ID de restaurante inválido.');
      error.statusCode = 400;
      error.code = 'INVALID_COMPANY_ID';
      throw error;
    }

    const restaurant = await getCompanyById(parsedId);

    if (!restaurant) {
      const error = new Error('Restaurante no encontrado.');
      error.statusCode = 404;
      error.code = 'COMPANY_NOT_FOUND';
      throw error;
    }

    // Convert image keys to signed URLs
    const companyWithSignedUrls = await convertImageUrls(restaurant, ['profileImageUrl', 'profileCarouselUrls']);

    Logger.info('Company retrieved successfully', { companyId: parsedId });

    return companyWithSignedUrls;
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
   * Ensure value is an array
   * @param {any} value - Value to ensure is array
   * @returns {Array} Array value
   * @private
   */
  static _ensureArray(value) {
    if (Array.isArray(value)) {
      return value;
    }
    if (value === null || value === undefined) {
      return [];
    }
    if (typeof value === 'object') {
      return Object.keys(value).length > 0 ? [value] : [];
    }
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
      } catch (error) {
        return [];
      }
    }
    return [];
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
      const uploadResult = await uploadFile(profileImageFile, 'company-profiles');
      if (uploadResult.success) {
        return uploadResult.key;
      } else {
        const error = new Error('Error al subir la imagen de perfil.');
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
   * Handle gallery images upload
   * @param {Array} profileCarouselUrls - Existing carousel URLs
   * @param {Array} galleryImageFiles - Uploaded gallery image files
   * @returns {Promise<Array>} Final carousel URLs/keys
   * @private
   */
  static async _handleGalleryImagesUpload(profileCarouselUrls, galleryImageFiles) {
    let finalUrls = Array.isArray(profileCarouselUrls) ? profileCarouselUrls : [];

    if (galleryImageFiles && galleryImageFiles.length > 0) {
      const uploadResult = await uploadMultipleFiles(galleryImageFiles, 'company-gallery');
      if (uploadResult.success) {
        const newGalleryKeys = uploadResult.files.map(file => file.key);
        // Filter out blob URLs and signed URLs, keep only existing keys
        const existingUrls = finalUrls.filter(url =>
          !url.startsWith('blob:') && !url.includes('signed-url')
        );
        return [...existingUrls, ...newGalleryKeys];
      } else {
        const error = new Error('Error al subir las imágenes de la galería.');
        error.statusCode = 400;
        error.code = 'GALLERY_IMAGES_UPLOAD_FAILED';
        error.details = uploadResult.error;
        throw error;
      }
    }

    // Process existing carousel URLs to extract keys if needed
    return finalUrls.map(url => {
      if (url.includes('/api/company/signed-url/')) {
        return url.split('/api/company/signed-url/')[1];
      }
      const maybeKey = extractKeyFromUrl(url);
      return maybeKey || url;
    });
  }

  /**
   * Update company profile with file uploads and data processing
   * @param {Object} params - Update company parameters
   * @param {Object} params.body - Request body data
   * @param {Array} params.files - Uploaded files
   * @param {number} params.restaurantId - Restaurant ID
   * @returns {Promise<Object>} Success message
   * @throws {Error} If validation fails or update fails
   */
  static async updateCompany({ body, files, restaurantId }) {
    Logger.info('Updating company profile', { restaurantId });

    // Validate restaurant ID
    const parsedRestaurantId = this._validateRestaurantId(restaurantId);

    // Process and prepare update data
    const updateData = await this._processUpdateData(body, files, parsedRestaurantId);

    // Process locations (new, existing, to delete)
    const locationChanges = await this._processLocationChanges(body.locations, parsedRestaurantId);

    // Update company profile in transaction
    await this._executeCompanyUpdate(parsedRestaurantId, updateData, locationChanges);

    Logger.info('Company profile updated successfully', {
      restaurantId: parsedRestaurantId,
      name: body.name
    });

    return { message: 'Company profile updated successfully' };
  }

  /**
   * Validate restaurant ID
   * @param {number|string} restaurantId - Restaurant ID to validate
   * @returns {number} Parsed restaurant ID
   * @throws {Error} If restaurant ID is invalid
   * @private
   */
  static _validateRestaurantId(restaurantId) {
    if (!restaurantId) {
      const error = new Error('ID del restaurante es requerido.');
      error.statusCode = 400;
      error.code = 'MISSING_RESTAURANT_ID';
      throw error;
    }

    const parsedId = parseInt(restaurantId, 10);
    if (isNaN(parsedId)) {
      const error = new Error('ID del restaurante inválido.');
      error.statusCode = 400;
      error.code = 'INVALID_RESTAURANT_ID';
      throw error;
    }

    return parsedId;
  }

  /**
   * Process update data from request body and files
   * @param {Object} body - Request body data
   * @param {Array} files - Uploaded files
   * @param {number} restaurantId - Restaurant ID
   * @returns {Promise<Object>} Processed update data
   * @private
   */
  static async _processUpdateData(body, files, restaurantId) {
    const {
      legalName,
      rut,
      name,
      format,
      specialty,
      region,
      comuna,
      numberOfRestaurants,
      workers,
      weeklyAverageClients,
      description,
      profileImageUrl
    } = body;

    // Parse JSON strings from FormData
    const benefits = this._parseJsonField(body.benefits, {});
    const profileCarouselUrls = this._parseJsonField(body.profileCarouselUrls, []);

    // Handle file uploads
    const finalProfileImageUrl = await this._handleProfileImageUpload(
      profileImageUrl,
      files?.find(file => file.fieldname === 'profileImage')
    );

    const finalProfileCarouselUrls = await this._handleGalleryImagesUpload(
      profileCarouselUrls,
      files?.filter(file => file.fieldname === 'galleryImages')
    );

    return {
      legalName,
      rut,
      name,
      format,
      specialty,
      numberOfRestaurants,
      workers,
      profileImageUrl: finalProfileImageUrl,
      weeklyAverageClients,
      description,
      region,
      comuna,
      benefits: this._processBenefits(benefits),
      profileCarouselUrls: finalProfileCarouselUrls
    };
  }

  /**
   * Process location changes (new, existing, to delete)
   * @param {any} locations - Locations data from request
   * @param {number} restaurantId - Restaurant ID
   * @returns {Promise<Object>} Location changes object
   * @private
   */
  static async _processLocationChanges(locations, restaurantId) {
    const parsedLocations = this._ensureArray(this._parseJsonField(locations, []));
    const currentLocations = await getCurrentLocations(restaurantId);

    return {
      new: filterNewLocations(parsedLocations),
      existing: filterExistingLocations(parsedLocations),
      toDelete: findLocationsToDelete(currentLocations, parsedLocations)
    };
  }

  /**
   * Execute company update in transaction
   * @param {number} restaurantId - Restaurant ID
   * @param {Object} updateData - Update data
   * @param {Object} locationChanges - Location changes
   * @returns {Promise<void>}
   * @private
   */
  static async _executeCompanyUpdate(restaurantId, updateData, locationChanges) {
    await prisma.$transaction(async () => {
      // Delete locations that are no longer in the request
      await deleteLocations(locationChanges.toDelete);

      // Update company profile
      await updateCompanyProfile(restaurantId, {
        ...updateData,
        existingLocations: locationChanges.existing
      });

      // Create new locations
      await createNewLocations(locationChanges.new, restaurantId);
    });
  }

  /**
   * Delete company/restaurant and all related data
   * @param {Object} params - Delete company parameters
   * @param {number} params.restaurantId - Restaurant ID
   * @param {number} params.userId - User ID (for ownership verification)
   * @returns {Promise<Object>} Success message
   * @throws {Error} If validation fails, restaurant not found, or user doesn't own restaurant
   */
  static async deleteCompany({ restaurantId, userId }) {
    Logger.info('Deleting company', { restaurantId, userId });

    // Validate restaurant ID
    const parsedRestaurantId = this._validateRestaurantId(restaurantId);

    // Verify restaurant exists and user owns it
    const restaurant = await this._verifyRestaurantOwnership(parsedRestaurantId, userId);

    // Delete all related data in transaction
    await this._deleteRestaurantData(parsedRestaurantId);

    Logger.info('Company deleted successfully', {
      restaurantId: parsedRestaurantId,
      restaurantName: restaurant.name,
      userId
    });

    return { message: 'Restaurante eliminado exitosamente.' };
  }

  /**
   * Verify restaurant exists and user owns it
   * @param {number} restaurantId - Restaurant ID
   * @param {number} userId - User ID
   * @returns {Promise<Object>} Restaurant data
   * @throws {Error} If restaurant not found or user doesn't own it
   * @private
   */
  static async _verifyRestaurantOwnership(restaurantId, userId) {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        id: true,
        name: true,
        userId: true
      }
    });

    if (!restaurant) {
      const error = new Error('Restaurante no encontrado.');
      error.statusCode = 404;
      error.code = 'RESTAURANT_NOT_FOUND';
      throw error;
    }

    // Check if user owns this restaurant
    if (restaurant.userId !== userId) {
      Logger.warn('Unauthorized delete attempt', { restaurantId, userId });
      const error = new Error('No tienes permiso para eliminar este restaurante.');
      error.statusCode = 403;
      error.code = 'FORBIDDEN';
      throw error;
    }

    return restaurant;
  }

  /**
   * Delete all restaurant-related data in a transaction
   * @param {number} restaurantId - Restaurant ID
   * @returns {Promise<void>}
   * @private
   */
  static async _deleteRestaurantData(restaurantId) {
    await prisma.$transaction(async (tx) => {
      // Delete job offers and their dependencies
      await this._deleteJobOffersAndDependencies(tx, restaurantId);

      // Delete locations
      await tx.location.deleteMany({
        where: { restaurantId }
      });

      // Delete conversations and messages
      await this._deleteConversationsAndMessages(tx, restaurantId);

      // Delete other related entities
      await this._deleteOtherRelatedEntities(tx, restaurantId);

      // Finally delete the restaurant
      await tx.restaurant.delete({
        where: { id: restaurantId }
      });
    });
  }

  /**
   * Delete job offers and all their dependencies
   * @param {Object} tx - Prisma transaction client
   * @param {number} restaurantId - Restaurant ID
   * @returns {Promise<void>}
   * @private
   */
  static async _deleteJobOffersAndDependencies(tx, restaurantId) {
    const jobOffers = await tx.jobOffer.findMany({
      where: { restaurantId }
    });

    // For each job offer: delete dependent entities
    for (const jobOffer of jobOffers) {
      // Get applications for this job offer
      const applications = await tx.application.findMany({
        where: { jobPostId: jobOffer.id }
      });

      // Delete answers for applications
      for (const application of applications) {
        await tx.answer.deleteMany({
          where: { applicationId: application.id }
        });
      }

      // Delete applications
      await tx.application.deleteMany({
        where: { jobPostId: jobOffer.id }
      });

      // Delete questions
      await tx.question.deleteMany({
        where: { jobOfferId: jobOffer.id }
      });

      // Delete favourite jobs
      await tx.favouriteJob.deleteMany({
        where: { jobOfferId: jobOffer.id }
      });
    }

    // Delete all job offers
    await tx.jobOffer.deleteMany({
      where: { restaurantId }
    });
  }

  /**
   * Delete conversations and their messages
   * @param {Object} tx - Prisma transaction client
   * @param {number} restaurantId - Restaurant ID
   * @returns {Promise<void>}
   * @private
   */
  static async _deleteConversationsAndMessages(tx, restaurantId) {
    const conversations = await tx.conversation.findMany({
      where: { restaurantId }
    });

    // Delete messages for each conversation
    for (const conversation of conversations) {
      await tx.message.deleteMany({
        where: { conversationId: conversation.id }
      });
    }

    // Delete conversations
    await tx.conversation.deleteMany({
      where: { restaurantId }
    });
  }

  /**
   * Delete other related entities (talent pool, restaurant users, AI agents, scheduled calls)
   * @param {Object} tx - Prisma transaction client
   * @param {number} restaurantId - Restaurant ID
   * @returns {Promise<void>}
   * @private
   */
  static async _deleteOtherRelatedEntities(tx, restaurantId) {
    // Delete talent pool entries
    await tx.talentPool.deleteMany({
      where: { restaurantId }
    });

    // Delete restaurant user associations
    await tx.restaurantUser.deleteMany({
      where: { restaurantId }
    });

    // Delete AI agents
    await tx.aiAgent.deleteMany({
      where: { restaurantId }
    });

    // Delete scheduled calls
    await tx.scheduledCall.deleteMany({
      where: { restaurantId }
    });
  }
}

module.exports = CompanyService;


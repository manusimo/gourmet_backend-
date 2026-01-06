const Logger = require('../utils/logger.js');
const { prisma } = require('../db.js');
const { getConversationById } = require('../helpers/chatHelpers.js');
const { getEmployeeByUserId } = require('../helpers/employeeHelpers.js');
const { getRestaurantUserByUserId } = require('../helpers/companyHelpers.js');
const {
  createHiringOffer,
  sendHiringOfferMessage,
  getHiringById,
  getHiringByConversationId: getHiringByConversationIdHelper,
  getHiringsByJobOfferId: getHiringsByJobOfferIdHelper,
  acceptHiringOffer,
  rejectHiringOffer,
  getEffectiveHiringValues,
  getActiveHiringsForEmployee,
  getActiveHiringsForRestaurant,
  updateHiringOffer,
  findLastHiringOfferMessage,
  updateHiringOfferMessage
} = require('../helpers/hiringHelpers.js');
const { convertImageUrls } = require('../utils/imageUrlUtils.js');

/**
 * Hiring Service
 * Handles business logic for hiring operations
 */
class HiringService {
  /**
   * Create hiring offer
   * @param {Object} params - Create hiring offer parameters
   * @param {string|number} params.employeeId - Employee ID
   * @param {string|number} params.conversationId - Conversation ID
   * @param {string|number} [params.jobOfferId] - Job offer ID (optional)
   * @param {string|Date} [params.startDate] - Start date (optional)
   * @param {string|Date} [params.endDate] - End date (optional)
   * @param {number} params.restaurantUserId - Restaurant user ID
   * @param {number} params.restaurantId - Restaurant ID
   * @returns {Promise<Object>} Created hiring offer
   * @throws {Error} If validation fails or creation fails
   */
  static async createHiringOffer({
    employeeId,
    conversationId,
    jobOfferId,
    startDate,
    endDate,
    restaurantUserId,
    restaurantId
  }) {
    Logger.info('Creating hiring offer', {
      employeeId,
      conversationId,
      jobOfferId,
      restaurantUserId,
      restaurantId
    });

    // Validate required fields
    if (!employeeId || !conversationId) {
      const error = new Error('employeeId and conversationId are required');
      error.statusCode = 400;
      error.code = 'MISSING_REQUIRED_FIELDS';
      throw error;
    }

    if (!restaurantUserId) {
      const error = new Error('Restaurant user ID is required');
      error.statusCode = 401;
      error.code = 'MISSING_RESTAURANT_USER_ID';
      throw error;
    }

    // Get conversation to verify it exists and get job offer info
    const conversation = await getConversationById(conversationId);

    if (!conversation) {
      const error = new Error('Conversation not found');
      error.statusCode = 404;
      error.code = 'CONVERSATION_NOT_FOUND';
      throw error;
    }

    // Verify the restaurant user has access to this conversation
    if (conversation.restaurantUserId !== restaurantUserId) {
      const error = new Error('You do not have access to this conversation');
      error.statusCode = 403;
      error.code = 'UNAUTHORIZED_CONVERSATION_ACCESS';
      throw error;
    }

    // Use job offer info if available
    const finalJobOfferId = jobOfferId || conversation.jobOfferId;
    const finalRestaurantId = restaurantId || conversation.restaurantId;

    // Create hiring offer
    const hiring = await createHiringOffer({
      employeeId: parseInt(employeeId),
      startDate: startDate,
      endDate: endDate,
      restaurantId: finalRestaurantId,
      jobOfferId: finalJobOfferId,
      conversationId: parseInt(conversationId)
    });

    Logger.info('Hiring offer created successfully', {
      hiringId: hiring.id,
      employeeId,
      conversationId
    });

    // Send message to employee (pass hiring to get effective values)
    await sendHiringOfferMessage({
      conversationId: parseInt(conversationId),
      senderUserId: restaurantUserId,
      receiverUserId: parseInt(employeeId),
      senderType: 'restaurant',
      receiverType: 'employee'
    }, hiring);

    Logger.info('Hiring offer message sent successfully', {
      hiringId: hiring.id,
      conversationId
    });

    return hiring;
  }

  /**
   * Format date for Spanish locale
   * @param {Date|string} date - Date to format
   * @returns {string} Formatted date string
   * @private
   */
  static _formatDateForSpanish(date) {
    const dateObj = date instanceof Date ? date : new Date(date);
    return dateObj.toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  }

  /**
   * Build acceptance date message
   * @param {Object} effectiveValues - Effective hiring values
   * @returns {string} Formatted date message
   * @private
   */
  static _buildAcceptanceDateMessage(effectiveValues) {
    if (effectiveValues.startDate) {
      const formattedStartDate = this._formatDateForSpanish(effectiveValues.startDate);

      if (effectiveValues.endDate) {
        const formattedEndDate = this._formatDateForSpanish(effectiveValues.endDate);
        return `El período de trabajo comenzará el ${formattedStartDate} y terminará el ${formattedEndDate}.`;
      } else {
        return `El período de trabajo comenzará el ${formattedStartDate}.`;
      }
    } else {
      // Fallback if no dates
      return `El período de trabajo comenzará ahora y terminará en ${effectiveValues.period} días.`;
    }
  }

  /**
   * Create acceptance message in conversation
   * @param {Object} params - Acceptance message parameters
   * @param {number} params.conversationId - Conversation ID
   * @param {number} params.employeeId - Employee ID
   * @param {number} params.restaurantUserId - Restaurant user ID
   * @param {Object} params.effectiveValues - Effective hiring values
   * @returns {Promise<Object>} Created message
   * @private
   */
  static async _createAcceptanceMessage({ conversationId, employeeId, restaurantUserId, effectiveValues }) {
    const dateMessage = this._buildAcceptanceDateMessage(effectiveValues);
    const messageText = `He aceptado la oferta de contratación para ${effectiveValues.position}. ${dateMessage}`;

    return await prisma.message.create({
      data: {
        text: messageText,
        conversationId,
        senderEmployeeId: employeeId,
        receiverRestaurantUserId: restaurantUserId
      }
    });
  }

  /**
   * Accept hiring offer
   * @param {Object} params - Accept hiring offer parameters
   * @param {string|number} params.hiringId - Hiring ID
   * @param {number} params.employeeId - Employee ID
   * @param {string|Date} [params.startDate] - Start date (optional)
   * @param {string|Date} [params.endDate] - End date (optional)
   * @returns {Promise<Object>} Updated hiring offer
   * @throws {Error} If validation fails or acceptance fails
   */
  static async acceptHiringOffer({ hiringId, employeeId, startDate, endDate }) {
    Logger.info('Accepting hiring offer', { hiringId, employeeId, startDate, endDate });

    if (!hiringId) {
      const error = new Error('Hiring ID is required');
      error.statusCode = 400;
      error.code = 'MISSING_HIRING_ID';
      throw error;
    }

    if (!employeeId) {
      const error = new Error('Employee ID is required');
      error.statusCode = 401;
      error.code = 'MISSING_EMPLOYEE_ID';
      throw error;
    }

    const parsedHiringId = parseInt(hiringId, 10);
    if (isNaN(parsedHiringId)) {
      const error = new Error('Invalid hiring ID');
      error.statusCode = 400;
      error.code = 'INVALID_HIRING_ID';
      throw error;
    }

    // Get hiring to verify it exists
    const hiring = await getHiringById(parsedHiringId);

    if (!hiring) {
      const error = new Error('Hiring offer not found');
      error.statusCode = 404;
      error.code = 'HIRING_NOT_FOUND';
      throw error;
    }

    // Verify the employee owns this hiring
    if (hiring.employeeId !== parseInt(employeeId)) {
      const error = new Error('You do not have permission to accept this hiring offer');
      error.statusCode = 403;
      error.code = 'UNAUTHORIZED_HIRING_ACCESS';
      throw error;
    }

    // Accept hiring offer
    const updatedHiring = await acceptHiringOffer(parsedHiringId, { startDate, endDate });

    Logger.info('Hiring offer accepted successfully', {
      hiringId: parsedHiringId,
      employeeId
    });

    // Send confirmation message if conversation exists
    if (hiring.conversationId) {
      const conversation = await getConversationById(hiring.conversationId);

      if (conversation) {
        // Get effective values (use override if exists, otherwise JobOffer)
        const effectiveValues = getEffectiveHiringValues(updatedHiring);

        // Create acceptance message
        await this._createAcceptanceMessage({
          conversationId: hiring.conversationId,
          employeeId: parseInt(employeeId),
          restaurantUserId: conversation.restaurantUserId,
          effectiveValues
        });

        Logger.info('Acceptance message sent successfully', {
          hiringId: parsedHiringId,
          conversationId: hiring.conversationId
        });
      }
    }

    return updatedHiring;
  }

  /**
   * Create rejection message in conversation
   * @param {Object} params - Rejection message parameters
   * @param {number} params.conversationId - Conversation ID
   * @param {number} params.employeeId - Employee ID
   * @param {number} params.restaurantUserId - Restaurant user ID
   * @param {Object} params.effectiveValues - Effective hiring values
   * @returns {Promise<Object>} Created message
   * @private
   */
  static async _createRejectionMessage({ conversationId, employeeId, restaurantUserId, effectiveValues }) {
    const messageText = `He rechazado la oferta de contratación para ${effectiveValues.position}.`;

    return await prisma.message.create({
      data: {
        text: messageText,
        conversationId,
        senderEmployeeId: employeeId,
        receiverRestaurantUserId: restaurantUserId
      }
    });
  }

  /**
   * Reject hiring offer
   * @param {Object} params - Reject hiring offer parameters
   * @param {string|number} params.hiringId - Hiring ID
   * @param {number} params.employeeId - Employee ID
   * @returns {Promise<Object>} Updated hiring offer
   * @throws {Error} If validation fails or rejection fails
   */
  static async rejectHiringOffer({ hiringId, employeeId }) {
    Logger.info('Rejecting hiring offer', { hiringId, employeeId });

    if (!hiringId) {
      const error = new Error('Hiring ID is required');
      error.statusCode = 400;
      error.code = 'MISSING_HIRING_ID';
      throw error;
    }

    if (!employeeId) {
      const error = new Error('Employee ID is required');
      error.statusCode = 401;
      error.code = 'MISSING_EMPLOYEE_ID';
      throw error;
    }

    const parsedHiringId = parseInt(hiringId, 10);
    if (isNaN(parsedHiringId)) {
      const error = new Error('Invalid hiring ID');
      error.statusCode = 400;
      error.code = 'INVALID_HIRING_ID';
      throw error;
    }

    // Get hiring to verify it exists
    const hiring = await getHiringById(parsedHiringId);

    if (!hiring) {
      const error = new Error('Hiring offer not found');
      error.statusCode = 404;
      error.code = 'HIRING_NOT_FOUND';
      throw error;
    }

    // Verify the employee owns this hiring
    if (hiring.employeeId !== parseInt(employeeId)) {
      const error = new Error('You do not have permission to reject this hiring offer');
      error.statusCode = 403;
      error.code = 'UNAUTHORIZED_HIRING_ACCESS';
      throw error;
    }

    // Reject hiring offer
    const updatedHiring = await rejectHiringOffer(parsedHiringId);

    Logger.info('Hiring offer rejected successfully', {
      hiringId: parsedHiringId,
      employeeId
    });

    // Send rejection message if conversation exists
    if (hiring.conversationId) {
      const conversation = await getConversationById(hiring.conversationId);

      if (conversation) {
        // Get effective values (use override if exists, otherwise JobOffer)
        const effectiveValues = getEffectiveHiringValues(hiring);

        // Create rejection message
        await this._createRejectionMessage({
          conversationId: hiring.conversationId,
          employeeId: parseInt(employeeId),
          restaurantUserId: conversation.restaurantUserId,
          effectiveValues
        });

        Logger.info('Rejection message sent successfully', {
          hiringId: parsedHiringId,
          conversationId: hiring.conversationId
        });
      }
    }

    return updatedHiring;
  }

  /**
   * Get active hirings for a user (employee or restaurant)
   * @param {Object} params - Get active hirings parameters
   * @param {string} params.userType - User type ('profesionales' or 'empresas')
   * @param {string|number} params.userId - User ID
   * @returns {Promise<Array>} Array of active hirings
   * @throws {Error} If validation fails or fetching fails
   */
  static async getActiveHirings({ userType, userId }) {
    Logger.info('Getting active hirings', { userType, userId });

    if (!userType) {
      const error = new Error('User type is required');
      error.statusCode = 400;
      error.code = 'MISSING_USER_TYPE';
      throw error;
    }

    if (!userId) {
      const error = new Error('User ID is required');
      error.statusCode = 400;
      error.code = 'MISSING_USER_ID';
      throw error;
    }

    const parsedUserId = parseInt(userId, 10);
    if (isNaN(parsedUserId)) {
      const error = new Error('Invalid user ID');
      error.statusCode = 400;
      error.code = 'INVALID_USER_ID';
      throw error;
    }

    if (userType === 'profesionales') {
      // Get employee ID from user ID
      const employee = await getEmployeeByUserId(parsedUserId);

      if (!employee) {
        const error = new Error('Employee not found');
        error.statusCode = 404;
        error.code = 'EMPLOYEE_NOT_FOUND';
        throw error;
      }

      const hirings = await getActiveHiringsForEmployee(employee.id);

      Logger.info('Active hirings retrieved for employee', {
        employeeId: employee.id,
        count: hirings.length
      });

      return hirings;
    } else if (userType === 'empresas') {
      // Get restaurant ID from user ID
      const restaurantUser = await getRestaurantUserByUserId(parsedUserId);

      if (!restaurantUser) {
        const error = new Error('Restaurant user not found');
        error.statusCode = 404;
        error.code = 'RESTAURANT_USER_NOT_FOUND';
        throw error;
      }

      const hirings = await getActiveHiringsForRestaurant(restaurantUser.restaurantId);

      Logger.info('Active hirings retrieved for restaurant', {
        restaurantId: restaurantUser.restaurantId,
        count: hirings.length
      });

      return hirings;
    } else {
      const error = new Error('Invalid user type');
      error.statusCode = 400;
      error.code = 'INVALID_USER_TYPE';
      throw error;
    }
  }

  /**
   * Build update date message for hiring offer
   * @param {Object} effectiveValues - Effective hiring values
   * @returns {string} Formatted date message
   * @private
   */
  static _buildUpdateDateMessage(effectiveValues) {
    if (effectiveValues.startDate) {
      const formattedStartDate = this._formatDateForSpanish(effectiveValues.startDate);

      if (effectiveValues.endDate) {
        const formattedEndDate = this._formatDateForSpanish(effectiveValues.endDate);
        return ` El período de trabajo comenzará el ${formattedStartDate} y terminará el ${formattedEndDate}.`;
      } else {
        return ` El período de trabajo comenzará el ${formattedStartDate}.`;
      }
    } else {
      // Fallback if no dates - use period in days
      return ` El período de contratación es de ${effectiveValues.period || 30} días.`;
    }
  }

  /**
   * Build hiring offer message text
   * @param {Object} effectiveValues - Effective hiring values
   * @param {string} dateMessage - Formatted date message
   * @returns {string} Complete hiring offer message text
   * @private
   */
  static _buildHiringOfferMessageText(effectiveValues, dateMessage) {
    return `Te han intentado contratar para el trabajo de ${effectiveValues.position || 'trabajo'}.${dateMessage} Puedes aceptar o rechazar esta oferta.`;
  }

  /**
   * Update hiring offer message if conversation exists
   * @param {Object} params - Update message parameters
   * @param {number} params.conversationId - Conversation ID
   * @param {number} params.restaurantUserId - Restaurant user ID
   * @param {Object} params.effectiveValues - Effective hiring values
   * @returns {Promise<void>}
   * @private
   */
  static async _updateHiringOfferMessage({ conversationId, restaurantUserId, effectiveValues }) {
    const lastMessage = await findLastHiringOfferMessage(conversationId, restaurantUserId);

    if (lastMessage) {
      const dateMessage = this._buildUpdateDateMessage(effectiveValues);
      const updatedMessageText = this._buildHiringOfferMessageText(effectiveValues, dateMessage);

      await updateHiringOfferMessage(lastMessage.id, updatedMessageText);

      Logger.info('Hiring offer message updated successfully', {
        conversationId,
        messageId: lastMessage.id
      });
    }
  }

  /**
   * Update hiring offer (only startDate and endDate)
   * @param {Object} params - Update hiring offer parameters
   * @param {string|number} params.hiringId - Hiring ID
   * @param {string|Date} [params.startDate] - Start date (optional)
   * @param {string|Date} [params.endDate] - End date (optional)
   * @param {number} params.restaurantId - Restaurant ID (for authorization)
   * @param {number} params.restaurantUserId - Restaurant user ID (for message update)
   * @returns {Promise<Object>} Updated hiring offer
   * @throws {Error} If validation fails or update fails
   */
  static async updateHiringOffer({ hiringId, startDate, endDate, restaurantId, restaurantUserId }) {
    Logger.info('Updating hiring offer', { hiringId, startDate, endDate, restaurantId });

    if (!hiringId) {
      const error = new Error('Hiring ID is required');
      error.statusCode = 400;
      error.code = 'MISSING_HIRING_ID';
      throw error;
    }

    if (!restaurantId) {
      const error = new Error('Restaurant ID is required');
      error.statusCode = 401;
      error.code = 'MISSING_RESTAURANT_ID';
      throw error;
    }

    const parsedHiringId = parseInt(hiringId, 10);
    if (isNaN(parsedHiringId)) {
      const error = new Error('Invalid hiring ID');
      error.statusCode = 400;
      error.code = 'INVALID_HIRING_ID';
      throw error;
    }

    // Get hiring to verify it exists
    const hiring = await getHiringById(parsedHiringId);

    if (!hiring) {
      const error = new Error('Hiring offer not found');
      error.statusCode = 404;
      error.code = 'HIRING_NOT_FOUND';
      throw error;
    }

    // Verify the restaurant user has access to this hiring
    if (hiring.restaurantId !== parseInt(restaurantId)) {
      const error = new Error('You do not have permission to update this hiring offer');
      error.statusCode = 403;
      error.code = 'UNAUTHORIZED_HIRING_ACCESS';
      throw error;
    }

    // Update the hiring offer (only startDate and endDate)
    const updatedHiring = await updateHiringOffer(parsedHiringId, {
      startDate,
      endDate
    });

    Logger.info('Hiring offer updated successfully', {
      hiringId: parsedHiringId,
      restaurantId
    });

    // Find and update the last hiring offer message if conversation exists
    if (hiring.conversationId && restaurantUserId) {
      const effectiveValues = getEffectiveHiringValues(updatedHiring);

      await this._updateHiringOfferMessage({
        conversationId: hiring.conversationId,
        restaurantUserId,
        effectiveValues
      });
    }

    return updatedHiring;
  }

  /**
   * Get hiring by conversation ID
   * @param {Object} params - Get hiring parameters
   * @param {string|number} params.conversationId - Conversation ID
   * @returns {Promise<Object>} Hiring offer
   * @throws {Error} If validation fails or hiring not found
   */
  static async getHiringByConversationId({ conversationId }) {
    Logger.info('Getting hiring by conversation ID', { conversationId });

    if (!conversationId) {
      const error = new Error('Conversation ID is required');
      error.statusCode = 400;
      error.code = 'MISSING_CONVERSATION_ID';
      throw error;
    }

    const parsedConversationId = parseInt(conversationId, 10);
    if (isNaN(parsedConversationId)) {
      const error = new Error('Invalid conversation ID');
      error.statusCode = 400;
      error.code = 'INVALID_CONVERSATION_ID';
      throw error;
    }

    const hiring = await getHiringByConversationIdHelper(parsedConversationId);

    if (!hiring) {
      const error = new Error('Hiring offer not found for this conversation');
      error.statusCode = 404;
      error.code = 'HIRING_NOT_FOUND';
      throw error;
    }

    Logger.info('Hiring retrieved successfully', {
      hiringId: hiring.id,
      conversationId: parsedConversationId
    });

    return hiring;
  }

  /**
   * Get hirings by job offer ID
   * @param {Object} params - Get hirings parameters
   * @param {string|number} params.jobOfferId - Job offer ID
   * @returns {Promise<Array>} Array of hirings for the job offer
   * @throws {Error} If validation fails
   */
  static async getHiringsByJobOfferId({ jobOfferId }) {
    Logger.info('Getting hirings by job offer ID', { jobOfferId });

    if (!jobOfferId) {
      const error = new Error('Job offer ID is required');
      error.statusCode = 400;
      error.code = 'MISSING_JOB_OFFER_ID';
      throw error;
    }

    const parsedJobOfferId = parseInt(jobOfferId, 10);
    if (isNaN(parsedJobOfferId)) {
      const error = new Error('Invalid job offer ID');
      error.statusCode = 400;
      error.code = 'INVALID_JOB_OFFER_ID';
      throw error;
    }

    const hirings = await getHiringsByJobOfferIdHelper(parsedJobOfferId);

    // Convert employee image URLs to signed URLs
    const hiringsWithSignedUrls = await Promise.all(
      hirings.map(async (hiring) => {
        const convertedHiring = { ...hiring };
        if (convertedHiring.employee) {
          convertedHiring.employee = await convertImageUrls(convertedHiring.employee, ['profileImageUrl']);
        }
        return convertedHiring;
      })
    );

    Logger.info('Hirings retrieved successfully', {
      jobOfferId: parsedJobOfferId,
      count: hiringsWithSignedUrls.length
    });

    return hiringsWithSignedUrls;
  }
}

module.exports = HiringService;


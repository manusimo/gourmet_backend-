const { 
  getConversationWithMessages, 
  verifyConversationAccess,
  getConversationById,
  createMessage,
  getUserInfoByType,
  getRestaurantNameFromConversation,
  checkTalentConversation,
  checkApplicationConversation,
  findConversationByJobPost,
  findConversationByTalentPool,
  createConversation,
  findOrCreateRestaurantUser,
  getEmployeeConversations,
  getRestaurantUserConversations,
  convertEmployeeConversationImages,
  convertRestaurantConversationImages,
  getConversationForDeletion,
  hasAdminDeleteAccess,
  deleteConversation,
  generateChatToken
} = require('../helpers/chatHelpers.js');
const { processMessageNotifications } = require('./messageNotificationService.js');
const { convertImageUrls } = require('../utils/imageUrlUtils.js');
const Logger = require('../utils/logger.js');

/**
 * Chat Service
 * Handles business logic for chat-related operations
 */
class ChatService {
  /**
   * Generate chat socket authentication token
   * @param {Object} params - Generate token parameters
   * @param {number} params.userId - User ID
   * @param {string} params.userType - User type
   * @returns {Promise<Object>} Object with token
   * @throws {Error} If userId is missing or token generation fails
   */
  static async generateChatToken({ userId, userType }) {
    if (!userId) {
      const error = new Error('Autenticación requerida.');
      error.statusCode = 401;
      error.code = 'UNAUTHORIZED';
      throw error;
    }

    Logger.info('Generating chat token', { userId, userType });

    const token = generateChatToken(userId, userType);

    Logger.info('Chat token generated successfully', { userId });

    return { token };
  }

  /**
   * Get conversation messages with authorization check
   * @param {Object} params - Get messages parameters
   * @param {string} params.conversationId - Conversation ID
   * @param {number} params.userId - User ID requesting messages
   * @returns {Promise<Object>} Conversation messages
   * @throws {Error} If conversation not found or user not authorized
   */
  static async getConversationMessages({ conversationId, userId }) {
    if (!userId) {
      const error = new Error('Usuario no autorizado. ID de usuario no encontrado.');
      error.statusCode = 403;
      error.code = 'UNAUTHORIZED';
      throw error;
    }

    Logger.info('Getting conversation messages', { conversationId, userId });

    // Get conversation with messages
    const conversation = await getConversationWithMessages(conversationId);

    if (!conversation) {
      const error = new Error('Conversación no encontrada.');
      error.statusCode = 404;
      error.code = 'CONVERSATION_NOT_FOUND';
      throw error;
    }

    // Verify user has access to this conversation
    const hasAccess = await verifyConversationAccess(conversation, userId);

    if (!hasAccess) {
      Logger.warn('Unauthorized access attempt to conversation', { conversationId, userId });
      const error = new Error('No tienes autorización para acceder a esta conversación.');
      error.statusCode = 403;
      error.code = 'FORBIDDEN';
      throw error;
    }

    Logger.info('Conversation messages retrieved successfully', { 
      conversationId, 
      userId, 
      messageCount: conversation.messages?.length || 0 
    });

    return {
      messages: conversation.messages
    };
  }

  /**
   * Send a message in a conversation
   * @param {Object} params - Send message parameters
   * @param {string} params.text - Message text
   * @param {number} params.senderUserId - Sender user/employee/restaurantUser ID
   * @param {number} params.receiverUserId - Receiver user/employee/restaurantUser ID
   * @param {number} params.conversationId - Conversation ID
   * @param {string} params.senderType - Sender type: 'restaurant', 'employee', or 'user'
   * @param {string} params.receiverType - Receiver type: 'restaurant', 'employee', or 'user'
   * @returns {Promise<Object>} Created message
   * @throws {Error} If conversation not found
   */
  static async sendMessage({ text, senderUserId, receiverUserId, conversationId, senderType, receiverType }) {
    Logger.info('Sending message', { conversationId, senderUserId, receiverUserId, senderType, receiverType });

    // Verify conversation exists
    const conversation = await getConversationById(conversationId);

    if (!conversation) {
      const error = new Error('Conversación no encontrada.');
      error.statusCode = 404;
      error.code = 'CONVERSATION_NOT_FOUND';
      throw error;
    }

    // Create message
    const message = await createMessage({
      text,
      senderUserId,
      receiverUserId,
      conversationId,
      senderType,
      receiverType
    });

    Logger.info('Message created successfully', { messageId: message.id, conversationId });

    // Process notifications asynchronously (fire-and-forget)
    // Lookup sender and receiver info, then send notifications
    Promise.all([
      getUserInfoByType(senderUserId, senderType),
      getUserInfoByType(receiverUserId, receiverType),
      getRestaurantNameFromConversation(conversationId)
    ]).then(([sender, receiver, restaurantName]) => {
      if (sender && receiver) {
        processMessageNotifications({
          senderUserId: sender.id,
          receiverUserId: receiver.id,
          conversationId,
          messageText: text,
          senderName: sender.name,
          senderEmail: sender.email,
          recipientName: receiver.name,
          recipientEmail: receiver.email,
          restaurantName: sender.restaurantName || restaurantName || 'Restaurante'
        }).catch(error => {
          Logger.error('Failed to process message notifications', {
            error: error.message,
            conversationId,
            messageId: message.id
          });
        });
      } else {
        Logger.warn('Could not find sender or receiver for notifications', {
          conversationId,
          messageId: message.id,
          senderFound: !!sender,
          receiverFound: !!receiver
        });
      }
    }).catch(error => {
      Logger.error('Failed to lookup user info for notifications', {
        error: error.message,
        conversationId,
        messageId: message.id
      });
    });

    return message;
  }

  /**
   * Check if a conversation exists
   * @param {Object} params - Check conversation parameters
   * @param {number} params.employeeId - Employee ID
   * @param {string} params.type - Conversation type: 'talent' or 'application'
   * @param {number} params.restaurantUserId - Restaurant user ID
   * @param {number} [params.jobPostId] - Job post ID (optional, for application type)
   * @returns {Promise<Object|null>} Conversation or null if not found
   * @throws {Error} If restaurantUserId is missing or invalid type
   */
  static async checkConversation({ employeeId, type, restaurantUserId, jobPostId }) {
    if (!restaurantUserId) {
      const error = new Error('ID de usuario del restaurante no encontrado en las cookies.');
      error.statusCode = 400;
      error.code = 'MISSING_RESTAURANT_USER_ID';
      throw error;
    }

    Logger.info('Checking conversation existence', { employeeId, type, restaurantUserId, jobPostId });

    // Determine which helper to use based on type
    const conversation = await this._findConversationByType({
      type,
      employeeId,
      restaurantUserId,
      jobPostId
    });

    Logger.info(conversation ? 'Conversation found' : 'Conversation not found', {
      conversationId: conversation?.id,
      type,
      employeeId
    });

    return conversation;
  }

  /**
   * Find conversation by type (private helper)
   * @private
   */
  static async _findConversationByType({ type, employeeId, restaurantUserId, jobPostId }) {
    const validTypes = ['talent', 'application'];
    if (!validTypes.includes(type)) {
      const error = new Error(`Tipo de conversación inválido: ${type}. Debe ser 'talent' o 'application'.`);
      error.statusCode = 400;
      error.code = 'INVALID_CONVERSATION_TYPE';
      throw error;
    }

    if (type === 'talent') {
      return await checkTalentConversation(employeeId, restaurantUserId);
    }

    // type === 'application'
    if (jobPostId) {
      return await findConversationByJobPost(
        employeeId,
        parseInt(jobPostId),
        restaurantUserId,
        'applicant'
      );
    }

    return await checkApplicationConversation(employeeId, restaurantUserId);
  }

  /**
   * Create or ensure conversation exists
   * @param {Object} params - Create conversation parameters
   * @param {number} params.userId - User ID
   * @param {number} params.employeeId - Employee ID
   * @param {number} [params.jobPostId] - Job post ID (optional)
   * @param {number} [params.talentPoolId] - Talent pool ID (optional)
   * @param {string} params.type - Conversation type
   * @param {number} params.restaurantId - Restaurant ID
   * @returns {Promise<Object>} Conversation (existing or newly created)
   * @throws {Error} If restaurantId is missing or conversation creation fails
   */
  static async createOrEnsureConversation({ userId, employeeId, jobPostId, talentPoolId, type, restaurantId }) {
    if (!restaurantId) {
      const error = new Error('El ID del restaurante es requerido. Por favor, asegúrate de seleccionar un restaurante antes de crear conversaciones.');
      error.statusCode = 400;
      error.code = 'MISSING_RESTAURANT_ID';
      throw error;
    }

    Logger.info('Creating or ensuring conversation', { 
      userId, 
      employeeId, 
      jobPostId, 
      talentPoolId, 
      type, 
      restaurantId 
    });

    // Find or create restaurant user
    const restaurantUserId = await findOrCreateRestaurantUser(userId, restaurantId);

    if (!restaurantUserId) {
      const error = new Error('No se pudo encontrar o crear el ID de usuario del restaurante. Por favor, asegúrate de estar asociado correctamente con un restaurante.');
      error.statusCode = 400;
      error.code = 'RESTAURANT_USER_NOT_FOUND';
      throw error;
    }

    const parsedEmployeeId = parseInt(employeeId, 10);
    let conversation = null;

    // Check for existing conversation
    if (jobPostId) {
      conversation = await findConversationByJobPost(
        parsedEmployeeId, 
        parseInt(jobPostId), 
        restaurantUserId, 
        type
      );
    } else if (talentPoolId) {
      conversation = await findConversationByTalentPool(
        parsedEmployeeId, 
        parseInt(talentPoolId), 
        restaurantUserId, 
        type
      );
    }

    // Create new conversation if none exists
    if (!conversation) {
      conversation = await createConversation({
        employeeId: parsedEmployeeId,
        jobPostId: jobPostId ? parseInt(jobPostId) : null,
        talentPoolId: talentPoolId ? parseInt(talentPoolId) : null,
        restaurantUserId,
        restaurantId: parseInt(restaurantId),
        type
      });

      Logger.info('Conversation created', { 
        conversationId: conversation.id, 
        type, 
        employeeId, 
        restaurantUserId 
      });
    } else {
      Logger.info('Existing conversation found', { 
        conversationId: conversation.id, 
        type, 
        employeeId 
      });
    }

    return conversation;
  }

  /**
   * Get all conversations for current user
   * @param {Object} params - Get conversations parameters
   * @param {number} [params.employeeId] - Employee ID (if user is an employee)
   * @param {number} [params.restaurantUserId] - Restaurant user ID (if user is a restaurant user)
   * @param {string} [params.type] - Conversation type filter (optional)
   * @param {number} [params.restaurantId] - Restaurant ID filter (optional)
   * @returns {Promise<Array>} Array of conversations with converted image URLs
   * @throws {Error} If user type is invalid
   */
  static async getConversations({ employeeId, restaurantUserId, type, restaurantId }) {
    Logger.info('Getting conversations', { employeeId, restaurantUserId, type, restaurantId });

    if (employeeId) {
      return await this._getEmployeeConversations(employeeId, type);
    }

    if (restaurantUserId) {
      return await this._getRestaurantUserConversations(restaurantUserId, type, restaurantId);
    }

    const error = new Error('Tipo de usuario o ID inválido.');
    error.statusCode = 400;
    error.code = 'INVALID_USER_TYPE';
    throw error;
  }

  /**
   * Get and convert employee conversations
   * @private
   */
  static async _getEmployeeConversations(employeeId, type) {
    const conversations = await getEmployeeConversations(employeeId, type);
    const converted = await convertEmployeeConversationImages(conversations, convertImageUrls);
    
    Logger.info('Employee conversations retrieved', { 
      employeeId, 
      count: converted.length 
    });
    
    return converted;
  }

  /**
   * Get and convert restaurant user conversations
   * @private
   */
  static async _getRestaurantUserConversations(restaurantUserId, type, restaurantId) {
    const conversations = await getRestaurantUserConversations(restaurantUserId, type, restaurantId);
    const converted = await convertRestaurantConversationImages(conversations, convertImageUrls);
    
    Logger.info('Restaurant user conversations retrieved', { 
      restaurantUserId, 
      count: converted.length 
    });
    
    return converted;
  }

  /**
   * Delete a conversation
   * @param {Object} params - Delete conversation parameters
   * @param {number} params.conversationId - Conversation ID
   * @param {number} params.userId - User ID
   * @param {string} params.userType - User type ('empresas' or 'profesionales')
   * @param {string} params.role - User role ('admin', 'staff', etc.)
   * @param {number} [params.employeeId] - Employee ID (if user is an employee)
   * @param {number} [params.restaurantUserId] - Restaurant user ID (if user is a restaurant user)
   * @returns {Promise<void>}
   * @throws {Error} If conversation not found or user not authorized
   */
  static async deleteConversation({ conversationId, userId, userType, role, employeeId, restaurantUserId }) {
    Logger.info('Deleting conversation', { conversationId, userId, userType, role });

    const isAdminOrStaff = userType === 'empresas' && (role === 'admin' || role === 'staff');

    if (isAdminOrStaff) {
      await this._verifyAdminDeleteAccess(conversationId, userId);
    } else {
      await this._verifyRegularUserDeleteAccess({
        conversationId,
        userId,
        employeeId,
        restaurantUserId
      });
    }

    await deleteConversation(conversationId);
    Logger.info('Conversation deleted successfully', { conversationId, userId });
  }

  /**
   * Verify admin/staff user has access to delete conversation
   * @private
   */
  static async _verifyAdminDeleteAccess(conversationId, userId) {
    const conversation = await getConversationForDeletion(conversationId);
    
    if (!conversation) {
      this._throwConversationNotFound();
    }

    const hasAccess = hasAdminDeleteAccess(
      conversation,
      userId,
      conversation.restaurantUserId
    );

    if (!hasAccess) {
      Logger.warn('Unauthorized delete attempt by admin/staff', { conversationId, userId });
      this._throwForbiddenError();
    }
  }

  /**
   * Verify regular user has access to delete conversation
   * @private
   */
  static async _verifyRegularUserDeleteAccess({ conversationId, userId, employeeId, restaurantUserId }) {
    if (!employeeId && !restaurantUserId) {
      const error = new Error('Usuario no autorizado.');
      error.statusCode = 403;
      error.code = 'UNAUTHORIZED';
      throw error;
    }

    const conversation = await getConversationWithMessages(conversationId);

    if (!conversation) {
      this._throwConversationNotFound();
    }

    const hasAccess = await verifyConversationAccess(conversation, userId);

    if (!hasAccess) {
      Logger.warn('Unauthorized delete attempt', { conversationId, userId });
      this._throwForbiddenError();
    }
  }

  /**
   * Throw conversation not found error
   * @private
   */
  static _throwConversationNotFound() {
    const error = new Error('Conversación no encontrada.');
    error.statusCode = 404;
    error.code = 'CONVERSATION_NOT_FOUND';
    throw error;
  }

  /**
   * Throw forbidden error
   * @private
   */
  static _throwForbiddenError() {
    const error = new Error('No tienes autorización para eliminar esta conversación.');
    error.statusCode = 403;
    error.code = 'FORBIDDEN';
    throw error;
  }
}

module.exports = ChatService;


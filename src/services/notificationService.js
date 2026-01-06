const Logger = require('../utils/logger.js');
const { prisma } = require('../db.js');
const {
  getNotificationsForUser,
  getUnreadNotificationCount,
  markNotificationAsRead
} = require('../helpers/notificationHelpers.js');

/**
 * Create a notification for a user
 * @param {Object} notificationData - Notification data
 * @param {number} notificationData.userId - User ID to notify
 * @param {string} notificationData.type - Notification type
 * @param {string} notificationData.title - Notification title
 * @param {string} notificationData.message - Notification message
 * @param {Object} notificationData.data - Additional data (optional)
 */
const createNotification = async (notificationData) => {
  try {
    const { userId, type, title, message, data } = notificationData;
    
    console.log('🔔 Creating notification with data:', { userId, type, title, message });

    const notification = await prisma.notification.create({
      data: {
        userId,
        type,
        title,
        message,
        data: data ? JSON.stringify(data) : null
      }
    });

    console.log(`✅ Notification created for user ${userId}: ${title} (ID: ${notification.id})`);
    return notification;
  } catch (error) {
    console.error('❌ Error creating notification:', error);
    throw error;
  }
};

/**
 * Create a job application notification for ALL restaurant users (admin + staff)
 * @param {Object} applicationData - Application data
 */
const createJobApplicationNotification = async (applicationData) => {
  const { restaurantUserId, applicantName, jobTitle, restaurantName, applicationId } = applicationData;

  // Get the restaurant ID from the restaurant user
  const restaurantUser = await prisma.restaurantUser.findUnique({
    where: { id: restaurantUserId },
    select: { restaurantId: true }
  });

  if (!restaurantUser) {
    console.error('❌ Restaurant user not found for notification');
    return;
  }

  // Get ALL users associated with this restaurant (admin + staff)
  const restaurantUsers = await prisma.restaurantUser.findMany({
    where: { restaurantId: restaurantUser.restaurantId },
    select: { userId: true }
  });

  // Also get the restaurant owner (admin user)
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantUser.restaurantId },
    select: { userId: true }
  });

  // Collect all unique user IDs
  const userIds = new Set();
  
  // Add restaurant owner (admin)
  if (restaurant) {
    userIds.add(restaurant.userId);
  }
  
  // Add all staff users
  restaurantUsers.forEach(ru => userIds.add(ru.userId));

  console.log(`🔔 Creating job application notifications for ${userIds.size} users:`, Array.from(userIds));

  // Create notifications for all users
  const notifications = [];
  for (const userId of userIds) {
    try {
      const notification = await createNotification({
        userId,
        type: 'job_application',
        title: 'Nueva postulación recibida',
        message: `${applicantName} se postuló para el puesto de ${jobTitle} en ${restaurantName}`,
        data: {
          applicationId,
          applicantName,
          jobTitle,
          restaurantName,
          type: 'job_application'
        }
      });
      notifications.push(notification);
    } catch (error) {
      console.error(`❌ Failed to create notification for user ${userId}:`, error);
    }
  }

  return notifications;
};

/**
 * Create a job application notification for ONLY the specific restaurant user who posted the job
 * @param {Object} applicationData - Application data
 */
const createJobApplicationNotificationForSpecificUser = async (applicationData) => {
  const { restaurantUserId, applicantName, jobTitle, restaurantName, applicationId } = applicationData;

  // Get the specific restaurant user who posted the job
  const restaurantUser = await prisma.restaurantUser.findUnique({
    where: { id: restaurantUserId },
    select: { userId: true }
  });

  if (!restaurantUser) {
    console.error('❌ Restaurant user not found for notification');
    return;
  }

  console.log(`🔔 Creating job application notification for specific user: ${restaurantUser.userId}`);

  // Create notification only for the specific restaurant user
  try {
    const notification = await createNotification({
      userId: restaurantUser.userId,
      type: 'job_application',
      title: 'Nueva postulación recibida',
      message: `${applicantName} se postuló para el puesto de ${jobTitle} en ${restaurantName}`,
      data: {
        applicationId,
        applicantName,
        jobTitle,
        restaurantName,
        type: 'job_application'
      }
    });
    return notification;
  } catch (error) {
    console.error(`❌ Failed to create notification for user ${restaurantUser.userId}:`, error);
    throw error;
  }
};

/**
 * Create a message notification
 * @param {Object} messageData - Message data
 */
const createMessageNotification = async (messageData) => {
  const { recipientUserId, senderName, restaurantName, messagePreview, conversationId } = messageData;

  return await createNotification({
    userId: recipientUserId,
    type: 'MESSAGE',
    title: 'Nuevo mensaje recibido',
    message: `${senderName} te envió un mensaje desde ${restaurantName}: "${messagePreview}"`,
    data: {
      conversationId,
      senderName,
      restaurantName,
      messagePreview,
      type: 'message'
    }
  });
};

/**
 * Create a job offer notification for employees
 * @param {Object} jobOfferData - Job offer data
 */
const createJobOfferNotification = async (jobOfferData) => {
  const { employeeUserId, jobTitle, restaurantName, jobOfferId } = jobOfferData;

  return await createNotification({
    userId: employeeUserId,
    type: 'job_offer',
    title: 'Nueva oferta de trabajo',
    message: `Nueva oferta de trabajo: ${jobTitle} en ${restaurantName}`,
    data: {
      jobOfferId,
      jobTitle,
      restaurantName,
      type: 'job_offer'
    }
  });
};


/**
 * Create a system notification
 * @param {Object} systemData - System notification data
 */
const createSystemNotification = async (systemData) => {
  const { userId, title, message, data } = systemData;

  return await createNotification({
    userId,
    type: 'system',
    title,
    message,
    data
  });
};

/**
 * Get notifications for a user with unread count
 * @param {Object} params - Get notifications parameters
 * @param {number} params.userId - User ID
 * @param {number} [params.limit] - Maximum number of notifications to return (default: 50)
 * @returns {Promise<Object>} Object with notifications array and unreadCount
 * @throws {Error} If validation fails or fetching fails
 */
const getNotifications = async ({ userId, limit = 50 }) => {
  Logger.info('Getting notifications for user', { userId, limit });

  if (!userId) {
    const error = new Error('User ID is required');
    error.statusCode = 401;
    error.code = 'MISSING_USER_ID';
    throw error;
  }

  // Fetch notifications and unread count in parallel
  const [notifications, unreadCount] = await Promise.all([
    getNotificationsForUser(userId, limit),
    getUnreadNotificationCount(userId)
  ]);

  Logger.info('Notifications retrieved successfully', {
    userId,
    count: notifications.length,
    unreadCount
  });

  return {
    notifications,
    unreadCount
  };
};

/**
 * Get unread notification count for a user
 * @param {number} userId - User ID
 * @deprecated Use getNotifications instead
 */
const getUnreadCount = async (userId) => {
  try {
    return await getUnreadNotificationCount(userId);
  } catch (error) {
    Logger.error('Error getting unread count', { userId, error: error.message });
    return 0;
  }
};

/**
 * Mark a notification as read
 * @param {Object} params - Mark notification as read parameters
 * @param {string|number} params.notificationId - Notification ID
 * @param {number} params.userId - User ID (for authorization)
 * @returns {Promise<void>}
 * @throws {Error} If validation fails or notification not found
 */
const markNotificationAsReadById = async ({ notificationId, userId }) => {
  Logger.info('Marking notification as read', { notificationId, userId });

  if (!notificationId) {
    const error = new Error('Notification ID is required');
    error.statusCode = 400;
    error.code = 'MISSING_NOTIFICATION_ID';
    throw error;
  }

  if (!userId) {
    const error = new Error('User ID is required');
    error.statusCode = 401;
    error.code = 'MISSING_USER_ID';
    throw error;
  }

  const parsedNotificationId = parseInt(notificationId, 10);
  if (isNaN(parsedNotificationId)) {
    const error = new Error('Invalid notification ID');
    error.statusCode = 400;
    error.code = 'INVALID_NOTIFICATION_ID';
    throw error;
  }

  // Mark notification as read
  const result = await markNotificationAsRead(parsedNotificationId, userId);

  if (result.count === 0) {
    const error = new Error('Notification not found');
    error.statusCode = 404;
    error.code = 'NOTIFICATION_NOT_FOUND';
    throw error;
  }

  Logger.info('Notification marked as read successfully', {
    notificationId: parsedNotificationId,
    userId
  });
};

/**
 * Mark all notifications as read for a user
 * @param {number} userId - User ID
 */
const markAllAsRead = async (userId) => {
  try {
    await prisma.notification.updateMany({
      where: { 
        userId,
        isRead: false 
      },
      data: { isRead: true }
    });
    Logger.info(`All notifications marked as read for user ${userId}`);
  } catch (error) {
    Logger.error('Error marking all notifications as read', { userId, error: error.message });
    throw error;
  }
};

module.exports = {
  createNotification,
  createJobApplicationNotification,
  createJobApplicationNotificationForSpecificUser,
  createMessageNotification,
  createJobOfferNotification,
  createSystemNotification,
  getNotifications,
  getUnreadCount,
  markNotificationAsReadById,
  markAllAsRead
};

const { prisma } = require('../db.js');

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

    const notification = await prisma.notification.create({
      data: {
        userId,
        type,
        title,
        message,
        data: data ? JSON.stringify(data) : null
      }
    });

    console.log(`✅ Notification created for user ${userId}: ${title}`);
    return notification;
  } catch (error) {
    console.error('❌ Error creating notification:', error);
    throw error;
  }
};

/**
 * Create a job application notification
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
 * Create a message notification
 * @param {Object} messageData - Message data
 */
const createMessageNotification = async (messageData) => {
  const { recipientUserId, senderName, restaurantName, messagePreview, conversationId } = messageData;

  return await createNotification({
    userId: recipientUserId,
    type: 'message',
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
 * Get unread notification count for a user
 * @param {number} userId - User ID
 */
const getUnreadCount = async (userId) => {
  try {
    return await prisma.notification.count({
      where: { 
        userId,
        isRead: false 
      }
    });
  } catch (error) {
    console.error('❌ Error getting unread count:', error);
    return 0;
  }
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
    console.log(`✅ All notifications marked as read for user ${userId}`);
  } catch (error) {
    console.error('❌ Error marking all notifications as read:', error);
    throw error;
  }
};

module.exports = {
  createNotification,
  createJobApplicationNotification,
  createMessageNotification,
  createJobOfferNotification,
  createSystemNotification,
  getUnreadCount,
  markAllAsRead
};

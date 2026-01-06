const { prisma } = require('../db.js');

/**
 * Get notifications for a user
 * @param {number} userId - User ID
 * @param {number} [limit] - Maximum number of notifications to return (default: 50)
 * @returns {Promise<Array>} Array of notifications
 */
const getNotificationsForUser = async (userId, limit = 50) => {
  return await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit
  });
};

/**
 * Get unread notification count for a user
 * @param {number} userId - User ID
 * @returns {Promise<number>} Unread notification count
 */
const getUnreadNotificationCount = async (userId) => {
  return await prisma.notification.count({
    where: {
      userId,
      isRead: false
    }
  });
};

/**
 * Mark a notification as read
 * @param {number} notificationId - Notification ID
 * @param {number} userId - User ID (for authorization)
 * @returns {Promise<Object>} Update result with count property
 */
const markNotificationAsRead = async (notificationId, userId) => {
  return await prisma.notification.updateMany({
    where: {
      id: notificationId,
      userId // Ensure user can only update their own notifications
    },
    data: { isRead: true }
  });
};

module.exports = {
  getNotificationsForUser,
  getUnreadNotificationCount,
  markNotificationAsRead
};


const { prisma } = require('../db');
const { sendMessageNotification } = require('./emailService');
const { createMessageNotification } = require('./notificationService');

/**
 * Process message notifications with smart throttling
 * @param {Object} params - Message notification parameters
 */
const processMessageNotifications = async ({
  senderUserId,
  receiverUserId,
  conversationId,
  messageText,
  senderName,
  senderEmail,
  recipientName,
  recipientEmail,
  restaurantName
}) => {
  try {
    console.log(`💬 [NOTIFICATION] Starting processMessageNotifications`);
    console.log(`💬 [NOTIFICATION] Processing message notification for conversation ${conversationId}`);
    console.log(`💬 [NOTIFICATION] Notification details:`, {
      senderUserId,
      receiverUserId,
      senderName,
      recipientName,
      restaurantName,
      senderEmail,
      recipientEmail
    });

    // Check if we should send email notification (throttling)
    console.log(`💬 [NOTIFICATION] Checking email throttling for conversation ${conversationId}, user ${receiverUserId}`);
    const shouldSendEmail = await shouldSendEmailNotification(conversationId, receiverUserId);
    console.log(`💬 [NOTIFICATION] Should send email: ${shouldSendEmail}`);
    
    if (shouldSendEmail) {
      console.log(`💬 [NOTIFICATION] Sending email notification to ${recipientEmail}`);
      await sendMessageNotification({
        senderName,
        senderEmail,
        recipientName,
        recipientEmail,
        messagePreview: messageText.length > 100 ? messageText.substring(0, 100) + '...' : messageText,
        restaurantName,
        conversationId
      });
      console.log('📧 [NOTIFICATION] Message email notification sent successfully');
    } else {
      console.log('⏰ [NOTIFICATION] Email notification throttled (sent recently)');
    }

    // Always create in-app notification (but update existing one)
    console.log('🔔 [NOTIFICATION] Creating in-app notification for user:', parseInt(receiverUserId));
    await createOrUpdateInAppNotification({
      recipientUserId: parseInt(receiverUserId),
      senderName,
      restaurantName,
      messagePreview: messageText.length > 100 ? messageText.substring(0, 100) + '...' : messageText,
      conversationId
    });
    console.log('🔔 [NOTIFICATION] In-app message notification updated for user:', parseInt(receiverUserId));

  } catch (error) {
    console.error('❌ [NOTIFICATION] Failed to process message notifications:', error);
    console.error('❌ [NOTIFICATION] Error stack:', error.stack);
    // Don't throw error - notifications shouldn't break message sending
  }
};

/**
 * Check if we should send email notification (throttling logic)
 * @param {number} conversationId - Conversation ID
 * @param {number} receiverUserId - Receiver user ID
 * @returns {boolean} - Whether to send email
 */
const shouldSendEmailNotification = async (conversationId, receiverUserId) => {
  try {
    console.log(`💬 [NOTIFICATION] Checking email throttling for conversation ${conversationId}, user ${receiverUserId}`);
    // Check if we sent an email notification for this conversation in the last 30 minutes
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    console.log(`💬 [NOTIFICATION] Checking for recent notifications since: ${thirtyMinutesAgo.toISOString()}`);
    
    const recentEmailNotification = await prisma.notification.findFirst({
      where: {
        userId: receiverUserId,
        type: 'MESSAGE',
        createdAt: {
          gte: thirtyMinutesAgo
        },
        // Check if it's for the same conversation (stored in data field)
        data: {
          contains: `"conversationId":${conversationId}`
        }
      }
    });

    console.log(`💬 [NOTIFICATION] Recent email notification found:`, recentEmailNotification ? 'YES' : 'NO');

    // If we already sent an email recently, don't send another
    if (recentEmailNotification) {
      console.log('⏰ [NOTIFICATION] Email notification throttled (sent recently)');
      return false;
    }

    // Check if user has been active in this conversation recently (indicating they've seen messages)
    console.log(`💬 [NOTIFICATION] Checking user activity in conversation ${conversationId} for user ${receiverUserId}`);
    const userHasBeenActive = await checkUserActivityInConversation(conversationId, receiverUserId);
    console.log(`💬 [NOTIFICATION] User has been active: ${userHasBeenActive}`);
    
    if (userHasBeenActive) {
      console.log('👀 [NOTIFICATION] User has been active in conversation recently, skipping email');
      return false;
    }

    // If no recent email and user hasn't been active, we can send one
    console.log(`💬 [NOTIFICATION] Email notification approved - will send to user ${receiverUserId}`);
    return true;
  } catch (error) {
    console.error('❌ Error checking email notification throttle:', error);
    // If there's an error, default to sending (better to send than miss)
    return true;
  }
};

/**
 * Check if user has been active in the conversation recently
 * @param {number} conversationId - Conversation ID
 * @param {number} userId - User ID
 * @returns {boolean} - Whether user has been active
 */
const checkUserActivityInConversation = async (conversationId, userId) => {
  try {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    
    // Get user data and entity IDs
    const { user, userEntityIds } = await getUserDataAndEntityIds(userId);
    
    // Check for recent messages sent by user
    const hasRecentMessages = await checkRecentUserMessages(conversationId, userId, user, userEntityIds, tenMinutesAgo);
    if (hasRecentMessages) return true;
    
    // Check for recent notification reads
    const hasRecentNotificationRead = await checkRecentNotificationRead(conversationId, userId, tenMinutesAgo);
    if (hasRecentNotificationRead) return true;
    
    return false;
  } catch (error) {
    console.error('❌ Error checking user activity:', error);
    return false;
  }
};

/**
 * Get user data and their entity IDs (employee, restaurant user)
 * @param {number} userId - User ID
 * @returns {Object} - User data and entity IDs
 */
const getUserDataAndEntityIds = async (userId) => {
  const [employee, restaurantUsers, user] = await Promise.all([
    prisma.employee.findUnique({
      where: { userId: parseInt(userId) },
      select: { id: true }
    }),
    prisma.restaurantUser.findMany({
      where: { userId: parseInt(userId) },
      select: { id: true }
    }),
    prisma.user.findUnique({
      where: { id: parseInt(userId) },
      select: { role: true }
    })
  ]);

  const userEntityIds = [];
  if (employee) userEntityIds.push({ senderEmployeeId: employee.id });
  if (restaurantUsers.length > 0) {
    restaurantUsers.forEach(ru => {
      userEntityIds.push({ senderRestaurantUserId: ru.id });
    });
  }

  return { user, userEntityIds };
};

/**
 * Check if user has sent recent messages in the conversation
 * @param {number} conversationId - Conversation ID
 * @param {number} userId - User ID
 * @param {Object} user - User data
 * @param {Array} userEntityIds - User's entity IDs
 * @param {Date} tenMinutesAgo - Time threshold
 * @returns {boolean} - Whether user sent recent messages
 */
const checkRecentUserMessages = async (conversationId, userId, user, userEntityIds, tenMinutesAgo) => {
  // For admin users, check through restaurant ownership
  if (user && user.role === 'admin') {
    const adminMessageQuery = {
      conversationId: parseInt(conversationId),
      createdAt: { gte: tenMinutesAgo },
      OR: [
        ...userEntityIds,
        {
          conversation: {
            restaurant: {
              userId: parseInt(userId)
            }
          }
        }
      ]
    };
    
    const recentAdminMessages = await prisma.message.findFirst({
      where: adminMessageQuery
    });
    
    if (recentAdminMessages) return true;
  }

  // For regular users (employee/restaurant user)
  if (userEntityIds.length > 0) {
    const recentUserMessages = await prisma.message.findFirst({
      where: {
        conversationId: parseInt(conversationId),
        createdAt: { gte: tenMinutesAgo },
        OR: userEntityIds
      }
    });
    
    if (recentUserMessages) return true;
  }

  return false;
};

/**
 * Check if user has read notifications recently
 * @param {number} conversationId - Conversation ID
 * @param {number} userId - User ID
 * @param {Date} tenMinutesAgo - Time threshold
 * @returns {boolean} - Whether user read notifications recently
 */
const checkRecentNotificationRead = async (conversationId, userId, tenMinutesAgo) => {
  const recentNotificationRead = await prisma.notification.findFirst({
    where: {
      userId: parseInt(userId),
      type: 'MESSAGE',
      isRead: true,
      updatedAt: { gte: tenMinutesAgo },
      data: {
        contains: `"conversationId":${conversationId}`
      }
    }
  });

  return !!recentNotificationRead;
};

/**
 * Create or update in-app notification for conversation
 * @param {Object} params - Notification parameters
 */
const createOrUpdateInAppNotification = async ({
  recipientUserId,
  senderName,
  restaurantName,
  messagePreview,
  conversationId
}) => {
  try {
    console.log('🔍 [NOTIFICATION] Checking for existing notification for user:', recipientUserId, 'conversation:', conversationId);
    // Check if there's already an unread notification for this conversation
    // Since data is a JSON string, we need to use string contains to find the conversationId
    const existingNotification = await prisma.notification.findFirst({
      where: {
        userId: recipientUserId,
        type: 'MESSAGE',
        isRead: false,
        data: {
          contains: `"conversationId":${conversationId}`
        }
      }
    });
    console.log('🔍 [NOTIFICATION] Existing notification found:', !!existingNotification);

    if (existingNotification) {
      // Update existing notification with new message preview and timestamp
      await prisma.notification.update({
        where: { id: existingNotification.id },
        data: {
          message: `Nuevo mensaje de ${senderName} en ${restaurantName}: ${messagePreview}`,
          updatedAt: new Date()
        }
      });
      console.log('🔄 Updated existing message notification');
    } else {
      // Create new notification
      await createMessageNotification({
        recipientUserId,
        senderName,
        restaurantName,
        messagePreview,
        conversationId
      });
      console.log('✨ Created new message notification');
    }
  } catch (error) {
    console.error('❌ Failed to create/update in-app notification:', error);
    throw error;
  }
};

module.exports = {
  processMessageNotifications
};
